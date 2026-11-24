-- Stock entries/exits with a reason, and pieces lent to resellers (docs/revenda/PLAN.md §4, §6).
-- SQLite cannot change a CHECK in place: the table is rebuilt with the history copied as is.
CREATE TABLE stock_movements_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  product_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  size TEXT NOT NULL DEFAULT '',
  delta INTEGER NOT NULL,
  qty_after INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('ajuste', 'pedido', 'devolucao', 'entrada', 'saida', 'maleta', 'retorno_maleta')),
  order_number INTEGER,
  -- Free text for entries/exits ("compra do fornecedor", "brinde"…); no personal data.
  note TEXT,
  -- The reseller kit a 'maleta' / 'retorno_maleta' movement belongs to.
  kit_id TEXT
);
INSERT INTO stock_movements_v2 (id, at, product_id, variant_id, size, delta, qty_after, reason, order_number)
  SELECT id, at, product_id, variant_id, size, delta, qty_after, reason, order_number FROM stock_movements;
DROP TABLE stock_movements;
ALTER TABLE stock_movements_v2 RENAME TO stock_movements;
CREATE INDEX stock_movements_product ON stock_movements (product_id, id);
CREATE INDEX stock_movements_kit ON stock_movements (kit_id) WHERE kit_id IS NOT NULL;
