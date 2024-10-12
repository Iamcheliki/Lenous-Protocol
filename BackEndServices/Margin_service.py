
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

class PnLAndLiquidationService:
    def __init__(self):
        self.web3 = Web3(Web3.HTTPProvider(os.getenv('WEB3_PROVIDER_URI')))
        self.web3.middleware_onion.inject(geth_poa_middleware, layer=0)
        
        contract_address = os.getenv('CONTRACT_ADDRESS')
        contract_abi = self.load_contract_abi()
        self.contract = self.web3.eth.contract(address=contract_address, abi=contract_abi)
        
        self.db_engine = create_async_engine(os.getenv('DATABASE_URL'))
        
        self.web3.eth.default_account = os.getenv('ACCOUNT_ADDRESS')
        self.private_key = os.getenv('PRIVATE_KEY')

        self.LIQUIDATION_THRESHOLD = Decimal('50')  # 50% of initial margin
        self.MARGIN_CALL_THRESHOLD = Decimal('75')  # 75% of initial margin

    def load_contract_abi(self):
        with open('contract_abi.json', 'r') as abi_file:
            return json.load(abi_file)

    async def get_positions(self):
        async with AsyncSession(self.db_engine) as session:
            result = await session.execute(
                select(text('trader, asset, position_id, size, margin, leverage, entry_price, is_long, margin_type'))
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

    async def check_margin_levels(self):
        positions = await self.get_positions()
        for position in positions:
            current_price = await self.get_latest_price(position.asset)
            if current_price is None:
                logger.warning(f"No price found for asset {position.asset}")
                continue

            pnl = self.calculate_pnl(position, current_price)
            current_margin = position.margin
            if pnl < 0:
                current_margin = max(current_margin - abs(pnl), Decimal('0'))

            position_value = (position.size * current_price) / Decimal('1e18')
            required_margin = (position_value * self.LIQUIDATION_THRESHOLD) / Decimal('100')

            if current_margin < required_margin:
                await self.liquidate_position(position.trader, position.asset, position.position_id)
            elif current_margin < (position_value * self.MARGIN_CALL_THRESHOLD) / Decimal('100'):
                await self.trigger_margin_call(position.trader, position.asset, position.position_id)

        async def liquidate_position(self, trader, asset, position_id):
        try:
            position_id = self.safe_to_uint256(position_id)

            tx = self.contract.functions.liquidatePosition(
                trader, asset, position_id
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
                logger.info(f"Successfully liquidated position for trader {trader}, asset {asset}, position {position_id}, tx hash: {tx_hash.hex()}")
            else:
                logger.error(f"Failed to liquidate position for trader {trader}, asset {asset}, position {position_id}")
        except Exception as e:
            logger.error(f"Error liquidating position: {e}")

    async def trigger_margin_call(self, trader, asset, position_id):
        # In a real-world scenario, you might want to notify the user via email, push notification, etc.
        logger.warning(f"Margin call triggered for trader {trader}, asset {asset}, position {position_id}")
        # You could also store this information in the database for further action

    async def update_pnl(self):
        positions = await self.get_positions()
        async with AsyncSession(self.db_engine) as session:
            for position in positions:
                current_price = await self.get_latest_price(position.asset)
                if current_price is None:
                    continue
                pnl = self.calculate_pnl(position, current_price)
                await session.execute(
                    text("UPDATE positions SET unrealized_pnl = :pnl WHERE position_id = :position_id")
                    .params(pnl=pnl, position_id=position.position_id)
                )
            await session.commit()

    async def run(self):
        while True:
            try:
                await self.update_pnl()
                await self.check_margin_levels()
            except Exception as e:
                logger.error(f"Error in PnL and Liquidation service: {e}")
            await asyncio.sleep(60)  # Run every minute

async def main():
    service = PnLAndLiquidationService()
    await service.run()

if __name__ == "__main__":
    asyncio.run(main())
