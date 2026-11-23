-- Monotonic counters. Order numbers come from here (never from MAX(number)),
-- so deleting an order never makes its number available again.
CREATE TABLE counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
