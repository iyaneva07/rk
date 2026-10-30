ALTER TABLE orders ADD COLUMN language TEXT NOT NULL DEFAULT 'bg' CHECK (language IN ('bg', 'en'));
ALTER TABLE books ADD COLUMN title_bg TEXT NOT NULL DEFAULT '';
ALTER TABLE books ADD COLUMN title_en TEXT NOT NULL DEFAULT '';

UPDATE books SET title_bg = 'Щази държава или социалистически рай?', title_en = 'Stasi State or Socialist Paradise?' WHERE id = 'stasi-state-or-socialist-paradise';

CREATE TABLE order_notifications (
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('owner', 'customer')),
  sent_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_error TEXT,
  PRIMARY KEY (order_id, kind)
);

CREATE INDEX order_notifications_pending ON order_notifications (next_attempt_at) WHERE sent_at IS NULL;
