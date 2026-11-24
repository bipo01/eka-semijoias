-- Reseller program (docs/revenda/PLAN.md §2–§5). Personal data: admin and the reseller's own panel only.

-- Pre-registration review: nova → analise → aprovada | recusada → efetivada.
ALTER TABLE leads ADD COLUMN status TEXT NOT NULL DEFAULT 'nova';

CREATE TABLE resellers (
  id TEXT PRIMARY KEY,
  -- Public showcase address /r/<slug>.
  slug TEXT NOT NULL UNIQUE,
  -- Digits only; the login identifier.
  whatsapp TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('ativa', 'pausada', 'encerrada')),
  lead_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
);

-- PIN of each reseller (hash + salt, keyed by PIN_PEPPER like the admin PIN).
CREATE TABLE reseller_credentials (
  reseller_id TEXT PRIMARY KEY,
  pin_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- First-access / PIN-reset links: only the SHA-256 of the token is stored.
CREATE TABLE reseller_invites (
  token_hash TEXT PRIMARY KEY,
  reseller_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX reseller_invites_reseller ON reseller_invites (reseller_id);

CREATE TABLE reseller_sessions (
  token_hash TEXT PRIMARY KEY,
  reseller_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX reseller_sessions_reseller ON reseller_sessions (reseller_id);

-- Contract acceptance evidence (one row per acceptance).
CREATE TABLE contract_acceptances (
  id TEXT PRIMARY KEY,
  reseller_id TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  version INTEGER NOT NULL,
  text_sha256 TEXT NOT NULL,
  typed_name TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('aceite', 'link'))
);
CREATE INDEX contract_acceptances_reseller ON contract_acceptances (reseller_id);

-- A kit ("maleta") lent to a reseller for one cycle; at most one open kit per reseller.
CREATE TABLE kits (
  id TEXT PRIMARY KEY,
  reseller_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('aberta', 'fechada')),
  opened_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  closed_at TEXT,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
);
CREATE UNIQUE INDEX kits_one_open ON kits (reseller_id) WHERE status = 'aberta';
CREATE INDEX kits_reseller ON kits (reseller_id, opened_at);

-- Sales a reseller records from her kit.
CREATE TABLE reseller_sales (
  id TEXT PRIMARY KEY,
  reseller_id TEXT NOT NULL,
  kit_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ativa', 'cancelada')),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  data TEXT NOT NULL CHECK (json_valid(data))
);
CREATE INDEX reseller_sales_kit ON reseller_sales (kit_id, created_at);
CREATE INDEX reseller_sales_reseller ON reseller_sales (reseller_id, created_at);

-- Admin-only configuration documents (e.g. key 'revenda': commission tiers, cycle, contract).
CREATE TABLE app_config (
  key TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
);
