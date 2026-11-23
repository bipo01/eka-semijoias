-- Web Push subscriptions of the owner's devices (docs/vendas/FASE3_PLAN.md §5). Additive only.
-- `id` is a short hash of the endpoint (the endpoint itself is a capability URL: never sent back
-- to the browser except to the device that owns it).
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  last_error TEXT
);
