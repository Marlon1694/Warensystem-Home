import { db } from '../db/index.js';
import { HttpError } from './http.js';
import { insertRow, now, requireRow, updateRow } from './repository.js';

/** Einheiten, die die Oberfläche zur Auswahl anbietet. */
export const UNITS = ['Stk', 'Pck', 'g', 'kg', 'ml', 'l', 'Dose', 'Flasche', 'Glas', 'Portion'];

export const LOCATION_KINDS = ['fridge', 'freezer', 'pantry', 'cellar', 'kitchen', 'other'];

export const MOVEMENT_TYPES = ['purchase', 'consume', 'waste', 'move', 'correction'];

/** Abschnitte, aus denen sich die Übersicht zusammensetzen lässt. */
export const DASHBOARD_WIDGETS = [
  'stats',
  'expiring',
  'locations',
  'shopping',
  'low_stock',
  'recent',
  'location_stock',
  'note',
];

/** Kennzahlen, die eine Kachel im Abschnitt "stats" anzeigen kann. */
export const DASHBOARD_TILES = [
  'expired',
  'expiring_soon',
  'below_min_stock',
  'products_in_stock',
  'shopping_open',
  'batches',
  'stock_value',
];

/**
 * Vorgabe für einen frischen Haushalt: die Zahlen, die täglich zählen, danach
 * was bald wegmuss, und zuletzt die Lagerorte als Einstieg in den Bestand.
 */
export const DEFAULT_DASHBOARD = [
  { id: 'stats', type: 'stats', options: { tiles: ['expired', 'expiring_soon', 'below_min_stock', 'products_in_stock'] } },
  { id: 'expiring', type: 'expiring', options: { limit: 10 } },
  { id: 'locations', type: 'locations', options: {} },
];

/** Mengen sind Gleitkommazahlen – ohne Rundung entstehen Werte wie 0.30000000000000004. */
export function round3(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Verbrauchsreihenfolge: Angebrochenes zuerst, danach das älteste MHD (FEFO). */
const BATCH_ORDER = 'ORDER BY opened DESC, (best_before IS NULL), best_before ASC, id ASC';

const PRODUCT_SELECT = `
  SELECT
    p.*,
    c.name  AS category_name,
    c.color AS category_color,
    l.name  AS default_location_name,
    COALESCE(stock.total_quantity, 0) AS total_quantity,
    COALESCE(stock.batch_count, 0)    AS batch_count,
    stock.next_best_before
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN locations  l ON l.id = p.default_location_id
  LEFT JOIN (
    SELECT
      product_id,
      SUM(quantity)    AS total_quantity,
      COUNT(*)         AS batch_count,
      MIN(best_before) AS next_best_before
    FROM stock_items
    WHERE quantity > 0
    GROUP BY product_id
  ) stock ON stock.product_id = p.id
`;

/** Ein Artikel samt aggregiertem Bestand. */
export function getProductWithStock(productId) {
  const row = db().prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(productId);
  return row ? decorateProduct(row) : null;
}

/**
 * Artikelliste mit Bestand. Der Lagerort-Filter wirkt auf den Bestand, nicht
 * auf den Artikelstamm: gefiltert werden Artikel, die dort tatsächlich liegen.
 */
export function listProductsWithStock({ locationId, categoryId, search, includeArchived, onlyInStock } = {}) {
  const where = [];
  const params = [];

  if (!includeArchived) where.push('p.archived = 0');

  if (categoryId) {
    where.push('p.category_id = ?');
    params.push(categoryId);
  }

  if (search) {
    where.push('(p.name LIKE ? OR p.brand LIKE ? OR p.barcode = ?)');
    params.push(`%${search}%`, `%${search}%`, search);
  }

  if (locationId) {
    where.push(
      'EXISTS (SELECT 1 FROM stock_items s WHERE s.product_id = p.id AND s.location_id = ? AND s.quantity > 0)',
    );
    params.push(locationId);
  }

  if (onlyInStock) where.push('COALESCE(stock.total_quantity, 0) > 0');

  const sql = `${PRODUCT_SELECT}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY p.name COLLATE NOCASE`;

  return db().prepare(sql).all(...params).map(decorateProduct);
}

function decorateProduct(row) {
  const total = round3(row.total_quantity ?? 0);
  return {
    ...row,
    archived: row.archived === 1,
    total_quantity: total,
    below_min_stock: row.min_stock > 0 && total < row.min_stock,
  };
}

/** Alle Bestandsposten eines Artikels in Verbrauchsreihenfolge. */
export function listBatches(productId) {
  return db().prepare(`
    SELECT s.*, l.name AS location_name, l.kind AS location_kind
    FROM stock_items s
    JOIN locations l ON l.id = s.location_id
    WHERE s.product_id = ? AND s.quantity > 0
    ORDER BY s.opened DESC, (s.best_before IS NULL), s.best_before ASC, s.id ASC
  `).all(productId).map((row) => ({ ...row, opened: row.opened === 1 }));
}

/**
 * Bestandsposten, deren MHD abgelaufen ist oder demnächst abläuft.
 * days = Vorwarnzeit; abgelaufene Posten sind immer enthalten.
 */
export function listExpiring(days) {
  const limit = new Date();
  limit.setDate(limit.getDate() + days);

  return db().prepare(`
    SELECT
      s.id, s.product_id, s.location_id, s.quantity, s.unit, s.best_before, s.opened,
      p.name AS product_name, p.brand,
      l.name AS location_name, l.kind AS location_kind,
      c.name AS category_name, c.color AS category_color,
      CAST(julianday(s.best_before) - julianday('now', 'start of day') AS INTEGER) AS days_left
    FROM stock_items s
    JOIN products  p ON p.id = s.product_id
    JOIN locations l ON l.id = s.location_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE s.quantity > 0 AND s.best_before IS NOT NULL AND s.best_before <= ?
    ORDER BY s.best_before ASC, p.name COLLATE NOCASE
  `).all(limit.toISOString().slice(0, 10)).map((row) => ({ ...row, opened: row.opened === 1 }));
}

function recordMovement(entry) {
  return insertRow('movements', {
    product_id: entry.product_id,
    stock_item_id: entry.stock_item_id ?? null,
    location_id: entry.location_id ?? null,
    to_location_id: entry.to_location_id ?? null,
    type: entry.type,
    quantity: round3(entry.quantity),
    unit: entry.unit,
    price: entry.price ?? null,
    note: entry.note ?? null,
    created_at: entry.created_at ?? now(),
  });
}

/**
 * Wareneingang. Ein Posten mit identischem Ort und MHD wird aufgestockt,
 * statt einen zweiten Eintrag mit denselben Eckdaten anzulegen.
 */
export function bookPurchase({ product, locationId, quantity, bestBefore, price, note, opened }) {
  const targetLocation = locationId ?? product.default_location_id;
  if (!targetLocation) {
    throw HttpError.badRequest('Kein Lagerort angegeben und kein Standardlagerort am Artikel hinterlegt');
  }
  requireRow('locations', targetLocation, 'Lagerort');

  const existing = db().prepare(`
    SELECT * FROM stock_items
    WHERE product_id = ? AND location_id = ? AND opened = 0
      AND ((best_before IS NULL AND ? IS NULL) OR best_before = ?)
    LIMIT 1
  `).get(product.id, targetLocation, bestBefore, bestBefore);

  const batch = existing && !opened
    ? updateRow('stock_items', existing.id, {
        quantity: round3(existing.quantity + quantity),
        price: sumPrice(existing.price, price),
      })
    : insertRow('stock_items', {
        product_id: product.id,
        location_id: targetLocation,
        quantity: round3(quantity),
        unit: product.unit,
        best_before: bestBefore,
        opened: opened ? 1 : 0,
        opened_at: opened ? now() : null,
        price: price ?? null,
        note: note ?? null,
      });

  recordMovement({
    product_id: product.id,
    stock_item_id: batch.id,
    location_id: targetLocation,
    type: 'purchase',
    quantity,
    unit: product.unit,
    price: price ?? null,
    note,
  });

  syncAutoShoppingItem(product.id);
  return batch;
}

function sumPrice(a, b) {
  if (a === null && (b === null || b === undefined)) return null;
  return round3((a ?? 0) + (b ?? 0));
}

/**
 * Verbrauch oder Entsorgung. Ohne festen Posten wird nach FEFO über mehrere
 * Posten hinweg abgebucht, damit zuerst weggeht, was zuerst schlecht wird.
 */
export function bookConsumption({ product, quantity, locationId, stockItemId, type, note }) {
  const params = [product.id];
  let filter = 'product_id = ? AND quantity > 0';

  if (stockItemId) {
    filter += ' AND id = ?';
    params.push(stockItemId);
  } else if (locationId) {
    filter += ' AND location_id = ?';
    params.push(locationId);
  }

  const batches = db().prepare(`SELECT * FROM stock_items WHERE ${filter} ${BATCH_ORDER}`).all(...params);
  const available = round3(batches.reduce((sum, batch) => sum + batch.quantity, 0));

  if (available < quantity) {
    throw HttpError.conflict(
      `Nicht genug Bestand: verfügbar ${available} ${product.unit}, gebucht werden sollen ${quantity} ${product.unit}`,
      { available, requested: quantity, unit: product.unit },
    );
  }

  let remaining = quantity;
  const touched = [];

  for (const batch of batches) {
    if (remaining <= 0) break;

    const take = Math.min(batch.quantity, remaining);
    const rest = round3(batch.quantity - take);
    remaining = round3(remaining - take);

    if (rest > 0) {
      updateRow('stock_items', batch.id, { quantity: rest });
    } else {
      db().prepare('DELETE FROM stock_items WHERE id = ?').run(batch.id);
    }

    recordMovement({
      product_id: product.id,
      stock_item_id: batch.id,
      location_id: batch.location_id,
      type,
      quantity: -take,
      unit: product.unit,
      // Preisanteil für die Verschwendungsstatistik anteilig mitschreiben.
      price: batch.price ? round3((batch.price / batch.quantity) * take) : null,
      note,
    });

    touched.push({ stock_item_id: batch.id, quantity: take, remaining: rest });
  }

  syncAutoShoppingItem(product.id);
  return { booked: quantity, batches: touched };
}

/** Umlagern, z. B. aus dem Gefrierfach in den Kühlschrank zum Auftauen. */
export function bookMove({ product, batch, toLocationId, quantity, note }) {
  if (batch.location_id === toLocationId) {
    throw HttpError.badRequest('Quell- und Ziellagerort sind identisch');
  }
  if (quantity > batch.quantity) {
    throw HttpError.conflict(`Der Posten enthält nur ${batch.quantity} ${product.unit}`);
  }
  requireRow('locations', toLocationId, 'Ziellagerort');

  const rest = round3(batch.quantity - quantity);
  if (rest > 0) {
    updateRow('stock_items', batch.id, { quantity: rest });
  } else {
    db().prepare('DELETE FROM stock_items WHERE id = ?').run(batch.id);
  }

  const target = db().prepare(`
    SELECT * FROM stock_items
    WHERE product_id = ? AND location_id = ? AND opened = ?
      AND ((best_before IS NULL AND ? IS NULL) OR best_before = ?)
    LIMIT 1
  `).get(product.id, toLocationId, batch.opened, batch.best_before, batch.best_before);

  const moved = target
    ? updateRow('stock_items', target.id, { quantity: round3(target.quantity + quantity) })
    : insertRow('stock_items', {
        product_id: product.id,
        location_id: toLocationId,
        quantity: round3(quantity),
        unit: batch.unit,
        best_before: batch.best_before,
        opened: batch.opened,
        opened_at: batch.opened_at,
        price: batch.price ? round3((batch.price / batch.quantity) * quantity) : null,
        note: batch.note,
      });

  recordMovement({
    product_id: product.id,
    stock_item_id: moved.id,
    location_id: batch.location_id,
    to_location_id: toLocationId,
    type: 'move',
    quantity,
    unit: batch.unit,
    note,
  });

  return moved;
}

/**
 * Hält die automatischen Einkaufslisteneinträge am Mindestbestand ausgerichtet:
 * anlegen bei Unterschreitung, entfernen sobald wieder genug da ist.
 */
export function syncAutoShoppingItem(productId) {
  const product = getProductWithStock(productId);
  if (!product) return;

  const existing = db()
    .prepare("SELECT * FROM shopping_items WHERE product_id = ? AND source = 'auto'")
    .get(productId);

  if (!product.below_min_stock || product.archived) {
    // Bereits abgehakte Einträge bleiben stehen, bis der Einkauf verbucht ist.
    if (existing && existing.done === 0) {
      db().prepare('DELETE FROM shopping_items WHERE id = ?').run(existing.id);
    }
    return;
  }

  const missing = round3(product.min_stock - product.total_quantity);
  // Auf ganze Verpackungseinheiten aufrunden, wenn eine hinterlegt ist.
  const packages = product.package_size ? Math.ceil(missing / product.package_size) : null;
  const quantity = packages ? round3(packages * product.package_size) : Math.max(missing, 0.001);

  if (existing) {
    updateRow('shopping_items', existing.id, { quantity, unit: product.unit, name: product.name });
  } else {
    insertRow('shopping_items', {
      product_id: product.id,
      name: product.name,
      quantity,
      unit: product.unit,
      source: 'auto',
    });
  }
}

/** Nach Änderungen an Mindestbeständen alle automatischen Einträge neu bewerten. */
export function syncAllAutoShoppingItems() {
  const ids = db().prepare('SELECT id FROM products WHERE archived = 0').all();
  for (const { id } of ids) syncAutoShoppingItem(id);
}
