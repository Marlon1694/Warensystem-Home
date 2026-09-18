import { Router } from 'express';
import { db } from '../db/index.js';
import { HttpError, orNotFound } from '../lib/http.js';
import { deleteRow, insertRow, requireRow, updateRow } from '../lib/repository.js';
import {
  UNITS,
  getProductWithStock,
  listBatches,
  listProductsWithStock,
  syncAutoShoppingItem,
} from '../lib/domain.js';
import {
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalText,
  parseId,
  requireText,
} from '../lib/validate.js';

export const productsRouter = Router();

/** Barcodes enthalten je nach Scanner Leerzeichen oder Bindestriche. */
function normalizeBarcode(raw) {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).replace(/[\s-]/g, '');
  if (value === '') return null;
  if (!/^\d{6,14}$/.test(value)) throw HttpError.badRequest('Barcode muss aus 6 bis 14 Ziffern bestehen');
  return value;
}

function readUnit(body, fallback = 'Stk') {
  const value = optionalText(body, 'unit', { max: 20 });
  if (value === null) return fallback;
  if (!UNITS.includes(value)) {
    throw HttpError.badRequest(`Unbekannte Einheit. Erlaubt: ${UNITS.join(', ')}`);
  }
  return value;
}

function readReference(body, field, table, label) {
  const value = optionalInteger(body, field, { min: 1 });
  if (value !== null) requireRow(table, value, label);
  return value;
}

productsRouter.get('/', (req, res) => {
  const products = listProductsWithStock({
    locationId: req.query.location ? parseId(req.query.location, 'location') : null,
    categoryId: req.query.category ? parseId(req.query.category, 'category') : null,
    search: req.query.search ? String(req.query.search).trim() : null,
    includeArchived: req.query.archived === '1',
    onlyInStock: req.query.inStock === '1',
  });

  res.json(products);
});

/** Nachschlagen eines gescannten Barcodes im eigenen Artikelstamm. */
productsRouter.get('/by-barcode/:code', (req, res) => {
  const barcode = normalizeBarcode(req.params.code);
  const row = db().prepare('SELECT id FROM products WHERE barcode = ?').get(barcode);
  res.json(row ? getProductWithStock(row.id) : null);
});

productsRouter.get('/:id', (req, res) => {
  const id = parseId(req.params.id);
  const product = orNotFound(getProductWithStock(id), 'Artikel nicht gefunden');

  const movements = db().prepare(`
    SELECT m.*, l.name AS location_name, t.name AS to_location_name
    FROM movements m
    LEFT JOIN locations l ON l.id = m.location_id
    LEFT JOIN locations t ON t.id = m.to_location_id
    WHERE m.product_id = ?
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 50
  `).all(id);

  res.json({ ...product, batches: listBatches(id), movements });
});

productsRouter.post('/', (req, res) => {
  const created = insertRow('products', {
    name: requireText(req.body, 'name', { max: 160 }),
    brand: optionalText(req.body, 'brand', { max: 120 }),
    barcode: normalizeBarcode(req.body?.barcode),
    category_id: readReference(req.body, 'category_id', 'categories', 'Kategorie'),
    default_location_id: readReference(req.body, 'default_location_id', 'locations', 'Lagerort'),
    unit: readUnit(req.body),
    min_stock: optionalNumber(req.body, 'min_stock', { min: 0 }) ?? 0,
    package_size: optionalNumber(req.body, 'package_size', { min: 0.001 }),
    default_shelf_life_days: optionalInteger(req.body, 'default_shelf_life_days', { min: 1, max: 3650 }),
    image_url: optionalText(req.body, 'image_url', { max: 500 }),
    note: optionalText(req.body, 'note', { max: 1000 }),
  });

  syncAutoShoppingItem(created.id);
  res.status(201).json(getProductWithStock(created.id));
});

productsRouter.patch('/:id', (req, res) => {
  const id = parseId(req.params.id);
  const current = requireRow('products', id, 'Artikel');
  const body = req.body ?? {};

  updateRow('products', id, {
    name: 'name' in body ? requireText(body, 'name', { max: 160 }) : undefined,
    brand: 'brand' in body ? optionalText(body, 'brand', { max: 120 }) : undefined,
    barcode: 'barcode' in body ? normalizeBarcode(body.barcode) : undefined,
    category_id: 'category_id' in body ? readReference(body, 'category_id', 'categories', 'Kategorie') : undefined,
    default_location_id: 'default_location_id' in body
      ? readReference(body, 'default_location_id', 'locations', 'Lagerort')
      : undefined,
    unit: 'unit' in body ? readUnit(body, current.unit) : undefined,
    min_stock: 'min_stock' in body ? optionalNumber(body, 'min_stock', { min: 0 }) ?? 0 : undefined,
    package_size: 'package_size' in body ? optionalNumber(body, 'package_size', { min: 0.001 }) : undefined,
    default_shelf_life_days: 'default_shelf_life_days' in body
      ? optionalInteger(body, 'default_shelf_life_days', { min: 1, max: 3650 })
      : undefined,
    image_url: 'image_url' in body ? optionalText(body, 'image_url', { max: 500 }) : undefined,
    note: 'note' in body ? optionalText(body, 'note', { max: 1000 }) : undefined,
    archived: 'archived' in body ? optionalBoolean(body, 'archived') : undefined,
  });

  // Die Einheit gilt für alle Posten des Artikels – sonst würden Summen unsinnig.
  if ('unit' in body) {
    const unit = readUnit(body, current.unit);
    db().prepare('UPDATE stock_items SET unit = ? WHERE product_id = ?').run(unit, id);
  }

  syncAutoShoppingItem(id);
  res.json(getProductWithStock(id));
});

/**
 * Artikel mit Bestand werden archiviert statt gelöscht, damit das
 * Bewegungsjournal und damit die Statistik vollständig bleibt.
 */
productsRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  requireRow('products', id, 'Artikel');

  const hasHistory = db()
    .prepare('SELECT COUNT(*) AS n FROM movements WHERE product_id = ?')
    .get(id).n > 0;

  if (hasHistory && req.query.force !== '1') {
    const archived = updateRow('products', id, { archived: 1 });
    db().prepare("DELETE FROM shopping_items WHERE product_id = ? AND source = 'auto'").run(id);
    return res.json({ archived: true, product: archived });
  }

  deleteRow('products', id);
  return res.status(204).end();
});
