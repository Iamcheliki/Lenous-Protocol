import asyncio
import logging
from decimal import Decimal
from web3 import Web3
from web3.middleware import geth_poa_middleware
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.future import select
from sqlalchemy import text
import os
from dotenv import load_dotenv
import json

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AutoDeleverageService:
    def __init__(self):
        self.web3 = Web3(Web3.HTTPProvider(os.getenv('WEB3_PROVIDER_URI')))
        self.web3.middleware_onion.inject(geth_poa_middleware, layer=0)
        
        contract_address = os.getenv('CONTRACT_ADDRESS')
        contract_abi = self.load_contract_abi()
        self.contract = self.web3.eth.contract(address=contract_address, abi=contract_abi)
        
        self.db_engine = create_async_engine(os.getenv('DATABASE_URL'))
        
        self.web3.eth.default_account = os.getenv('ACCOUNT_ADDRESS')
        self.private_key = os.getenv('PRIVATE_KEY')

        self.AUTO_DELEVERAGE_THRESHOLD = Decimal('0.8')  # 80% of initial margin

    def load_contract_abi(self):
        with open('contract_abi.json', 'r') as abi_file:
            return json.load(abi_file)

    async def get_positions(self):
        async with AsyncSession(self.db_engine) as session:
            result = await session.execute(
                select(text('trader, asset, position_id, size, margin, leverage, entry_price, is_long'))
                .select_from(text('positions'))
            )
            return result.fetchall()

    async def get_latest_price(self, asset):
        async with AsyncSession(self.db_engine) as session:
            result = await session.execute(
                select(text('price'))
                .select_from(text('price_feeds'))
                .where(text('asset = :asset'))
                .order_by(text('timestamp DESC'))
                .limit(1)
                .params(asset=asset)
            )
            return result.scalar_one_or_none()

    def calculate_pnl(self, position, current_price):
        price_diff = current_price - position.entry_price
        if not position.is_long:
            price_diff = -price_diff
        return (price_diff * position.size) / position.entry_price

    def safe_to_uint256(self, value):
        try:
            return max(0, min(int(value), 2**256 - 1))
        except ValueError:
            return 0

    async def auto_deleverage(self):
        positions = await self.get_positions()
        traders = []
        assets = []
        position_ids = []
        reduction_amounts = []

        for position in positions:
            current_price = await self.get_latest_price(position.asset)
            if current_price is None:
                logger.warning(f"No price found for asset {position.asset}")
                continue

            pnl = self.calculate_pnl(position, current_price)
            equity_after_pnl = position.margin + pnl
            collateralization_ratio = equity_after_pnl / (position.size * current_price / position.leverage)

            if collateralization_ratio < self.AUTO_DELEVERAGE_THRESHOLD:
                reduction_amount = position.size // 2  # Reduce position size by half
                traders.append(position.trader)
                assets.append(position.asset)
                position_ids.append(self.safe_to_uint256(position.position_id))
                reduction_amounts.append(self.safe_to_uint256(reduction_amount))

        if position_ids:
            try:
                tx = self.contract.functions.autoDeleverage(
                    traders, assets, position_ids, reduction_amounts
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
                    logger.info(f"Successfully auto-deleveraged positions, tx hash: {tx_hash.hex()}")
                else:
                    logger.error("Failed to auto-deleverage positions")
            except Exception as e:
                logger.error(f"Error in auto-deleveraging: {e}")
        else:
            logger.info("No positions need auto-deleveraging")

    async def run(self):
        while True:
            try:
                await self.auto_deleverage()
            except Exception as e:
                logger.error(f"Error in auto-deleverage service: {e}")
            await asyncio.sleep(60)  # Check every minute

async def main():
    service = AutoDeleverageService()
    await service.run()

if __name__ == "__main__":
    asyncio.run(main())
