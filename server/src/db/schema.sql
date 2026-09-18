-- ---------------------------------------------------------------------------
-- Lagerorte: Kühlschrank, Gefrierfach, Vorratskammer, Keller, Küche, …
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  kind        TEXT    NOT NULL DEFAULT 'pantry'
              CHECK (kind IN ('fridge', 'freezer', 'pantry', 'cellar', 'kitchen', 'other')),
  note        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- Warengruppen: Molkereiprodukte, Obst & Gemüse, Getränke, …
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  color       TEXT    NOT NULL DEFAULT '#6b7280',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- Artikelstamm. Der Bestand selbst liegt in stock_items, damit ein Artikel
-- gleichzeitig mit mehreren MHD an mehreren Orten liegen kann.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  name                    TEXT    NOT NULL,
  brand                   TEXT,
  barcode                 TEXT    UNIQUE,
  category_id             INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  default_location_id     INTEGER REFERENCES locations(id)  ON DELETE SET NULL,
  unit                    TEXT    NOT NULL DEFAULT 'Stk',
  min_stock               REAL    NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  package_size            REAL    CHECK (package_size IS NULL OR package_size > 0),
  default_shelf_life_days INTEGER CHECK (default_shelf_life_days IS NULL OR default_shelf_life_days > 0),
  image_url               TEXT,
  note                    TEXT,
  archived                INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_products_name     ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_archived ON products(archived);

-- ---------------------------------------------------------------------------
-- Bestandsposten ("Charge"): eine konkrete Menge eines Artikels an einem Ort
-- mit einem eigenen Mindesthaltbarkeitsdatum.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  quantity    REAL    NOT NULL CHECK (quantity >= 0),
  unit        TEXT    NOT NULL DEFAULT 'Stk',
  best_before TEXT,
  opened      INTEGER NOT NULL DEFAULT 0 CHECK (opened IN (0, 1)),
  opened_at   TEXT,
  price       REAL    CHECK (price IS NULL OR price >= 0),
  note        TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_stock_product     ON stock_items(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_location    ON stock_items(location_id);
CREATE INDEX IF NOT EXISTS idx_stock_best_before ON stock_items(best_before);

-- ---------------------------------------------------------------------------
-- Lückenloses Bewegungsjournal – Grundlage für Verbrauchsstatistiken.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movements (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  stock_item_id  INTEGER,
  location_id    INTEGER,
  to_location_id INTEGER,
  type           TEXT    NOT NULL
                 CHECK (type IN ('purchase', 'consume', 'waste', 'move', 'correction')),
  quantity       REAL    NOT NULL,
  unit           TEXT    NOT NULL DEFAULT 'Stk',
  price          REAL,
  note           TEXT,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_movements_product ON movements(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_created ON movements(created_at);
CREATE INDEX IF NOT EXISTS idx_movements_type    ON movements(type);

-- ---------------------------------------------------------------------------
-- Einkaufsliste. source='auto' markiert Einträge, die aus einer
-- Mindestbestands-Unterschreitung entstanden sind.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shopping_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  quantity   REAL    NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit       TEXT    NOT NULL DEFAULT 'Stk',
  note       TEXT,
  done       INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  source     TEXT    NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto')),
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_auto_product
  ON shopping_items(product_id) WHERE source = 'auto' AND product_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Freie Einstellungen (Haushaltsname, Vorwarnzeit, …)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- Änderungsprotokoll. Wird von Triggern gefüllt und ist die Grundlage für
-- einen späteren Abgleich mit einem Cloud-Backend: ein Client merkt sich die
-- zuletzt gesehene rev und fragt nur Neueres ab.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS change_log (
  rev       INTEGER PRIMARY KEY AUTOINCREMENT,
  entity    TEXT    NOT NULL,
  entity_id INTEGER NOT NULL,
  op        TEXT    NOT NULL CHECK (op IN ('insert', 'update', 'delete')),
  at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_change_log_entity ON change_log(entity, entity_id);
