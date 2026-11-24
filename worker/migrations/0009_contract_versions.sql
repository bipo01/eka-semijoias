-- The exact text (or link) of every reseller contract version, so the SHA-256 kept with each
-- acceptance can always be checked against what was accepted (docs/revenda/PLAN.md §2).
CREATE TABLE contract_versions (
  version INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('aceite', 'link')),
  body TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);
