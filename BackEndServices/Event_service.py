
import asyncio
import json
from web3 import Web3
from web3.middleware import geth_poa_middleware
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.INFO

# Ethereum network configuration
WEB3_PROVIDER_URI = 'https://rpc.ankr.com/eth_sepolia'  # Replace with your Ethereum node URL
CONTRACT_ADDRESS = '0x...'  # Replace with your OrderBook contract address
CONTRACT_ABI = json.loads('...')  # Replace with your OrderBook contract ABI

# Database configuration
DATABASE_URL = "postgresql+asyncpg://user:password@localhost/orderbook_db"

class OrderBookEventListener:
    def __init__(self, web3_provider, contract_address, contract_abi, db_url):
        self.web3 = Web3(Web3.HTTPProvider(web3_provider))
        self.web3.middleware_onion.inject(geth_poa_middleware, layer=0)
        self.contract = self.web3.eth.contract(address=contract_address, abi=contract_abi)
        self.db_engine = create_async_engine(db_url)

    async def handle_order_placed_event(self, event):
        async with AsyncSession(self.db_engine) as session:
            stmt = text("""
                INSERT INTO orders (order_id, user_id, asset_id, price, amount, is_buy_order, order_type, leverage, margin_type, expiration)
                VALUES (:order_id, :user_id, :asset_id, :price, :amount, :is_buy_order, :order_type, :leverage, :margin_type, :expiration)
            """)
            await session.execute(stmt, {
                'order_id': event['args']['orderId'],
                'user_id': event['args']['trader'],
                'asset_id': event['args']['asset'],
                'price': event['args']['price'],
                'amount': event['args']['amount'],
                'is_buy_order': event['args']['isBuyOrder'],
                'order_type': event['args']['orderType'],
                'leverage': event['args']['leverage'],
                'margin_type': event['args']['marginType'],
                'expiration': event['args']['expiration']
            })
            await session.commit()
        logger.info(f"Order placed: {event['args']}")

    async def handle_order_matched_event(self, event):
        async with AsyncSession(self.db_engine) as session:
            stmt = text("""
                UPDATE orders
                SET filled_amount = filled_amount + :matched_amount
                WHERE order_id IN (:buy_order_id, :sell_order_id)
            """)
            await session.execute(stmt, {
                'matched_amount': event['args']['matchedAmount'],
                'buy_order_id': event['args']['buyOrderId'],
                'sell_order_id': event['args']['sellOrderId']
            })
            await session.commit()
        logger.info(f"Order matched: {event['args']}")

    async def handle_position_updated_event(self, event):
        async with AsyncSession(self.db_engine) as session:
            stmt = text("""
                INSERT INTO positions (position_id, user_id, asset_id, size, entry_price, is_long, leverage, margin, margin_type)
                VALUES (:position_id, :user_id, :asset_id, :size, :entry_price, :is_long, :leverage, :margin, :margin_type)
                ON CONFLICT (position_id) DO UPDATE
                SET size = :size, entry_price = :entry_price, leverage = :leverage, margin = :margin
            """)
            await session.execute(stmt, {
                'position_id': event['args']['positionId'],
                'user_id': event['args']['trader'],
                'asset_id': event['args']['asset'],
                'size': event['args']['size'],
                'entry_price': event['args']['entryPrice'],
                'is_long': event['args']['isLong'],
                'leverage': event['args']['leverage'],
                'margin': event['args']['margin'],
                'margin_type': event['args']['marginType']
            })
            await session.commit()
        logger.info(f"Position updated: {event['args']}")

    async def listen_for_events(self):
        order_placed_event_filter = self.contract.events.OrderPlaced.create_filter(fromBlock='latest')
        order_matched_event_filter = self.contract.events.OrderMatched.create_filter(fromBlock='latest')
        position_updated_event_filter = self.contract.events.PositionUpdated.create_filter(fromBlock='latest')

        while True:
            for event in order_placed_event_filter.get_new_entries():
                await self.handle_order_placed_event(event)
            for event in order_matched_event_filter.get_new_entries():
                await self.handle_order_matched_event(event)
            for event in position_updated_event_filter.get_new_entries():
                await self.handle_position_updated_event(event)
            await asyncio.sleep(10)  # Poll for new events every 10 seconds

async def main():
    listener = OrderBookEventListener(WEB3_PROVIDER_URI, CONTRACT_ADDRESS, CONTRACT_ABI, DATABASE_URL)
    await listener.listen_for_events()

if __name__ == "__main__":
    asyncio.run(main())
