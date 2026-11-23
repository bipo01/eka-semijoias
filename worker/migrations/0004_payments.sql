-- Pix charges with a payment link and payment receipts (docs/vendas/PAGAMENTO_PLAN.md).

-- The secret token of the order's current payment link (/pagamento/<token>); NULL until charged.
ALTER TABLE orders ADD COLUMN pay_token TEXT;
CREATE UNIQUE INDEX orders_pay_token ON orders (pay_token);

-- Payment receipts sent by customers. Personal and financial data: served only to the admin.
-- Kept in D1 (rows top out at 2 MB; the browser compresses images first).
CREATE TABLE receipts (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  bytes BLOB NOT NULL
);
CREATE INDEX receipts_order ON receipts (order_id, created_at);
