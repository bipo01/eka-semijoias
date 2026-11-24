-- The owner's own motives for stock entries and exits ("Feira de artesanato"), saved when she
-- registers a move with "Outra entrada" / "Outra saída" and offered again next time.
-- label_key is the comparison key (no case, accents or extra spaces), so one motive is kept once.
CREATE TABLE stock_motives (
  kind TEXT NOT NULL CHECK (kind IN ('entrada', 'saida')),
  label_key TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT NOT NULL,
  PRIMARY KEY (kind, label_key)
);
