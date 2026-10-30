ALTER TABLE orders ADD COLUMN courier TEXT CHECK (courier IN ('econt', 'speedy'));
