import asyncio
import logging
from web3 import Web3
from web3.middleware import geth_poa_middleware
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.future import select
from sqlalchemy import text
from config.settings import DATABASE_URL, WEB3_PROVIDER_URI

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Chainlink Price Feed ABI
PRICE_FEED_ABI = '[{"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"description","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint80","name":"_roundId","type":"uint80"}],"name":"getRoundData","outputs":[{"internalType":"uint80","name":"roundId","type":"uint80"},{"internalType":"int256","name":"answer","type":"int256"},{"internalType":"uint256","name":"startedAt","type":"uint256"},{"internalType":"uint256","name":"updatedAt","type":"uint256"},{"internalType":"uint80","name":"answeredInRound","type":"uint80"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"latestRoundData","outputs":[{"internalType":"uint80","name":"roundId","type":"uint80"},{"internalType":"int256","name":"answer","type":"int256"},{"internalType":"uint256","name":"startedAt","type":"uint256"},{"internalType":"uint256","name":"updatedAt","type":"uint256"},{"internalType":"uint80","name":"answeredInRound","type":"uint80"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"version","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}]'

class PriceFeedService:
    def __init__(self, web3_provider, db_url):
        self.web3 = Web3(Web3.HTTPProvider(web3_provider))
        self.web3.middleware_onion.inject(geth_poa_middleware, layer=0)
        self.db_engine = create_async_engine(db_url)

    async def get_assets(self):
        async with AsyncSession(self.db_engine) as session:
            result = await session.execute(
                select(text('id, symbol, price_feed_address'))
                .select_from(text('assets'))
            )
            return result.fetchall()

    async def get_latest_price(self, price_feed_address):
        contract = self.web3.eth.contract(address=price_feed_address, abi=PRICE_FEED_ABI)
        latest_data = contract.functions.latestRoundData().call()
        return latest_data[1] / 10**8  # Assuming 8 decimals, adjust if needed

    async def update_price(self, asset_id, price):
        async with AsyncSession(self.db_engine) as session:
            await session.execute(
                text("INSERT INTO price_feeds (asset_id, price) VALUES (:asset_id, :price)")
                .params(asset_id=asset_id, price=price)
            )
            await session.commit()

    async def update_all_prices(self):
        assets = await self.get_assets()
        for asset in assets:
            try:
                price = await self.get_latest_price(asset.price_feed_address)
                await self.update_price(asset.id, price)
                logger.info(f"Updated price for {asset.symbol}: {price}")
            except Exception as e:
                logger.error(f"Error updating price for {asset.symbol}: {e}")

    async def run(self):
        while True:
            try:
                await self.update_all_prices()
            except Exception as e:
                logger.error(f"Error in price feed service: {e}")
            await asyncio.sleep(60)  # Update prices every minute

async def main():
    service = PriceFeedService(WEB3_PROVIDER_URI, DATABASE_URL)
    await service.run()

if __name__ == "__main__":
    asyncio.run(main())
