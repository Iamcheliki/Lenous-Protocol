
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    address VARCHAR(42) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assets (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    decimals INTEGER NOT NULL
);

CREATE TABLE positions (
    id SERIAL PRIMARY KEY,
    trader VARCHAR(42) NOT NULL,
    asset_id INTEGER REFERENCES assets(id),
    position_id VARCHAR(66) UNIQUE NOT NULL,
    size NUMERIC(28, 18) NOT NULL,
    entry_price NUMERIC(28, 18) NOT NULL,
    leverage NUMERIC(10, 2) NOT NULL,
    margin NUMERIC(28, 18) NOT NULL,
    margin_type VARCHAR(10) NOT NULL,
    is_long BOOLEAN NOT NULL,
    unrealized_pnl NUMERIC(28, 18) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    trader VARCHAR(42) NOT NULL,
    asset_id INTEGER REFERENCES assets(id),
    order_id VARCHAR(66) UNIQUE NOT NULL,
    price NUMERIC(28, 18) NOT NULL,
    amount NUMERIC(28, 18) NOT NULL,
    filled_amount NUMERIC(28, 18) DEFAULT 0,
    is_buy_order BOOLEAN NOT NULL,
    order_type VARCHAR(10) NOT NULL,
    stop_loss_price NUMERIC(28, 18),
    take_profit_price NUMERIC(28, 18),
    expiration TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE price_feeds (
    id SERIAL PRIMARY KEY,
    asset_id INTEGER REFERENCES assets(id),
    price NUMERIC(28, 18) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE funding_rates (
    id SERIAL PRIMARY KEY,
    asset_id INTEGER REFERENCES assets(id),
    rate NUMERIC(10, 8) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_positions_trader ON positions(trader);
CREATE INDEX idx_positions_asset_id ON positions(asset_id);
CREATE INDEX idx_orders_trader ON orders(trader);
CREATE INDEX idx_orders_asset_id ON orders(asset_id);
CREATE INDEX idx_price_feeds_asset_id_timestamp ON price_feeds(asset_id, timestamp);
