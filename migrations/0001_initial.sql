CREATE TABLE books (
  id TEXT PRIMARY KEY,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL UNIQUE
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL DEFAULT '',
  delivery_address TEXT NOT NULL,
  delivery_city TEXT NOT NULL,
  delivery_postal_code TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  total_cents INTEGER NOT NULL CHECK (total_cents > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE order_items (
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books(id),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
  PRIMARY KEY (order_id, book_id)
);

INSERT INTO books (id, price_cents, sort_order) VALUES
  ('stasi-state-or-socialist-paradise', 1100, 1);
