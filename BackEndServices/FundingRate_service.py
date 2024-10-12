import asyncio
import logging
from decimal import Decimal
from web3 import Web3
from web3.middleware import geth_poa_middleware
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.future import select
from sqlalchemy.sql import func, text
import os
from dotenv import load_dotenv
import json

# Load environment variables
load_dotenv()

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FundingRateService:
    def __init__(self):
        self.web3 = Web3(Web3.HTTPProvider(os.getenv('WEB3_PROVIDER')))
        self.web3.middleware_onion.inject(geth_poa_middleware, layer=0)
        
        contract_address = os.getenv('CONTRACT_ADDRESS')
        contract_abi = self.load_contract_abi()
        self.contract = self.web3.eth.contract(address=contract_address, abi=contract_abi)
        
        self.db_engine = create_async_engine(os.getenv('DATABASE_URL'))
        
        self.web3.eth.default_account = os.getenv('ACCOUNT_ADDRESS')
        self.private_key = os.getenv('PRIVATE_KEY')

    def load_contract_abi(self):
        with open('contract_abi.json', 'r') as abi_file:
            return json.load(abi_file)

    async def calculate_funding_rate(self, asset):
        async with AsyncSession(self.db_engine) as session:
            long_volume = await session.execute(
                select(func.sum(text('size'))).select_from(text('positions'))
                .where(text('asset_id = :asset AND is_long = true'))
                .params(asset=asset)
            )
            short_volume = await session.execute(
                select(func.sum(text('size'))).select_from(text('positions'))
                .where(text('asset_id = :asset AND is_long = false'))
                .params(asset=asset)
            )

            long_volume = long_volume.scalar() or Decimal('0')
            short_volume = short_volume.scalar() or Decimal('0')

            total_volume = long_volume + short_volume
            if total_volume == Decimal('0'):
                return Decimal('0')

            imbalance = long_volume - short_volume
            funding_rate = imbalance / total_volume
            return funding_rate

    async def get_positions(self, asset):
        async with AsyncSession(self.db_engine) as session:
            result = await session.execute(
                select(text('trader, position_id, size, is_long'))
                .select_from(text('positions'))
                .where(text('asset_id = :asset'))
                .params(asset=asset)
            )
            return result.fetchall()

    def safe_to_uint256(self, value):
        try:
            return max(0, min(int(value), 2**256 - 1))
        except ValueError:
            return 0

    async def apply_funding_rate(self, asset):
        funding_rate = await self.calculate_funding_rate(asset)
        positions = await self.get_positions(asset)

        traders = []
        assets = []
        position_ids = []
        adjustments = []

        for position in positions:
            traders.append(position.trader)
            assets.append(asset)
            position_ids.append(self.safe_to_uint256(position.position_id))
            
            adjustment = int(Decimal(position.size) * funding_rate)
            if position.is_long:
                adjustment = -adjustment
            adjustments.append(self.safe_to_uint256(adjustment))

        if not position_ids:
            logger.info(f"No positions to apply funding rate for asset {asset}")
            return

        try:
            tx = self.contract.functions.applyFundingRate(
                traders, assets, position_ids, adjustments
            ).build_transaction({
                'from': self.web3.eth.default_account,
                'gas': 2000000,
                'gasPrice': self.web3.eth.gas_price,
                'nonce': self.web3.eth.get_transaction_count(self.web3.eth.default_account),
            })
            signed_tx = self.web3.eth.account.sign_transaction(tx, private_key=self.private_key)
            tx_hash = self.web3.eth.send_raw_transaction(signed_tx.rawTransaction)
            tx_receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash)
            
            if tx_receipt['status'] == 1:
                logger.info(f"Successfully applied funding rate for asset {asset}, tx hash: {tx_hash.hex()}")
            else:
                logger.error(f"Failed to apply funding rate for asset {asset}")
        except Exception as e:
            logger.error(f"Error applying funding rate for asset {asset}: {e}")

    async def get_all_assets(self):
        async with AsyncSession(self.db_engine) as session:
            result = await session.execute(select(text('DISTINCT asset_id')).select_from(text('positions')))
            return [row[0] for row in result.fetchall()]

    async def run(self):
        while True:
            try:
                assets = await self.get_all_assets()
                for asset in assets:
                    await self.apply_funding_rate(asset)
            except Exception as e:
                logger.error(f"Error in funding rate service: {e}")
            await asyncio.sleep(8 * 60 * 60)  # Run every 8 hours

async def main():
    service = FundingRateService()
    await service.run()

if __name__ == "__main__":
    asyncio.run(main())
