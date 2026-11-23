-- ÉKA Semijoias backend: initial schema.
-- Catalog entities are stored as JSON documents (validated by the shared zod
-- schemas before every write) plus the columns that need keys or indexes.
-- `version` is the catalog version in which the row last changed; it drives
-- per-entity conflict detection (see worker/catalog.ts).

-- The public settings (one row). Credentials are NOT here (see admin_credentials).
CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
);

-- Deleted catalog entities, so a stale save from another device cannot bring them back.
CREATE TABLE tombstones (
  kind TEXT NOT NULL CHECK (kind IN ('product', 'category', 'collection')),
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  PRIMARY KEY (kind, id)
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  version INTEGER NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
);
CREATE INDEX categories_slug ON categories (slug);

CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  version INTEGER NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
);
CREATE INDEX collections_slug ON collections (slug);

-- Future order_items / stock_levels reference products(id).
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories (id),
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
);
CREATE INDEX products_slug ON products (slug);
CREATE INDEX products_category ON products (category_id);

-- The exact public JSON of GET /api/catalog, rewritten in the same transaction as every
-- catalog write. `version` here is THE catalog version (integer, compare-and-swap target).
CREATE TABLE catalog_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  body TEXT NOT NULL
);

-- Reseller pre-registrations (personal data: admin-only).
CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
);
CREATE INDEX leads_created ON leads (created_at);

-- Uploaded photos, content-addressed. `bytes` is used only when no R2 bucket is bound.
CREATE TABLE media (
  key TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  bytes BLOB
);

CREATE TABLE admin_credentials (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  pin_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  pin_length INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

-- Only the SHA-256 of each session token is stored.
CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX admin_sessions_expires ON admin_sessions (expires_at);

-- Fixed-window counters for login and lead throttling. Keys hold hashed IPs only.
CREATE TABLE throttle (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  locked_until INTEGER NOT NULL DEFAULT 0,
  strikes INTEGER NOT NULL DEFAULT 0
);

-- Responses of committed writes, replayed when a client retries with the same Idempotency-Key.
CREATE TABLE idempotency (
  key TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  response TEXT NOT NULL
);
CREATE INDEX idempotency_created ON idempotency (created_at);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL
);

-- Never holds rows: inserting 0 violates the CHECK and aborts the surrounding batch.
-- Used as a compare-and-swap guard inside D1 batches (which run as one transaction).
CREATE TABLE write_guard (
  ok INTEGER NOT NULL CHECK (ok = 1)
);
