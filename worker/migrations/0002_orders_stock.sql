-- Orders, stock control and stock history (docs/vendas/PLAN.md). Additive only.

-- Orders registered by the bag. `number` and `status` are the truth for those
-- fields; `data` holds the rest (items priced by the server, customer, history).
-- Personal data: admin endpoints only.
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('enviado', 'confirmado', 'pago', 'entregue', 'cancelado')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  data TEXT NOT NULL CHECK (json_valid(data))
);
CREATE INDEX orders_created ON orders (created_at);
CREATE INDEX orders_status ON orders (status, created_at);

-- Products with stock control. A tracked product's combination without a
-- stock_levels row counts as 0 (nothing uncounted is sold).
CREATE TABLE stock_tracked (
  product_id TEXT PRIMARY KEY,
  since TEXT NOT NULL
);

-- Units per product, finish and size ('' when the finish has no sizes).
-- The CHECK is the last barrier: an update that would go negative aborts its batch.
CREATE TABLE stock_levels (
  product_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  size TEXT NOT NULL DEFAULT '',
  qty INTEGER NOT NULL CHECK (qty >= 0 AND qty <= 100000),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (product_id, variant_id, size)
);

-- Every stock change: manual adjustments and order confirmations/returns.
CREATE TABLE stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  product_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  size TEXT NOT NULL DEFAULT '',
  delta INTEGER NOT NULL,
  qty_after INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('ajuste', 'pedido', 'devolucao')),
  order_number INTEGER
);
CREATE INDEX stock_movements_product ON stock_movements (product_id, id);
