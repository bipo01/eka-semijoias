-- The owner's customers (docs/revenda/PLAN.md §1). Personal data: admin endpoints only.
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  -- Digits only (DDD + number), unique when present.
  whatsapp TEXT,
  -- Lowercased, accent-free name for search.
  name_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
);
CREATE UNIQUE INDEX customers_whatsapp ON customers (whatsapp) WHERE whatsapp IS NOT NULL;
CREATE INDEX customers_name ON customers (name_key);

-- An order may belong to a registered customer (erasing the customer keeps the order, unlinked).
ALTER TABLE orders ADD COLUMN customer_id TEXT;
CREATE INDEX orders_customer ON orders (customer_id) WHERE customer_id IS NOT NULL;
