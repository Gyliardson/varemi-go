PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    provider_key TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cart_sessions (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL REFERENCES stores(id),
    token_hash TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('active', 'expired')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cart_items (
    session_id TEXT NOT NULL REFERENCES cart_sessions(id) ON DELETE CASCADE,
    barcode TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    currency TEXT NOT NULL CHECK (currency = 'BRL'),
    promotion_label TEXT,
    price_source TEXT NOT NULL,
    price_effective_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (session_id, barcode)
);

CREATE TABLE IF NOT EXISTS idempotency_requests (
    session_id TEXT NOT NULL REFERENCES cart_sessions(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    operation TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (session_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_cart_sessions_expires_at ON cart_sessions(expires_at);
