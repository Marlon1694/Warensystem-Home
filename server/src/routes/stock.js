import { Router } from 'express';
import { db, transaction } from '../db/index.js';
import { config } from '../config.js';
import { HttpError } from '../lib/http.js';
import { deleteRow, now, requireRow, updateRow } from '../lib/repository.js';
import {
  bookConsumption,
  bookMove,
  bookPurchase,
  getProductWithStock,
  listExpiring,
  round3,
  syncAutoShoppingItem,
} from '../lib/domain.js';
import {
  optionalBoolean,
  optionalDate,
  optionalInteger,
  optionalNumber,
  optionalText,
  parseId,
  requireNumber,
} from '../lib/validate.js';

export const stockRouter = Router();

function warnDays(raw) {
  if (raw === undefined || raw === '') return settingWarnDays();
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 365) {
    throw HttpError.badRequest('days muss zwischen 0 und 365 liegen');
  }
  return value;
}

function settingWarnDays() {
  const row = db().prepare("SELECT value FROM settings WHERE key = 'expiry_warn_days'").get();
  const value = Number(row?.value);
  return Number.isInteger(value) && value >= 0 ? value : config.expiryWarnDays;
}

/** Bestandsposten, die ablaufen – Grundlage der Warnungen auf dem Dashboard. */
stockRouter.get('/expiring', (req, res) => {
  res.json(listExpiring(warnDays(req.query.days)));
});

/** Alle Posten eines Lagerorts, für die Lagerortansicht. */
stockRouter.get('/batches', (req, res) => {
  const where = ['s.quantity > 0'];
  const params = [];

  if (req.query.location) {
    where.push('s.location_id = ?');
    params.push(parseId(req.query.location, 'location'));
  }
  if (req.query.product) {
    where.push('s.product_id = ?');
    params.push(parseId(req.query.product, 'product'));
  }

  const rows = db().prepare(`
    SELECT s.*, p.name AS product_name, p.brand, l.name AS location_name, l.kind AS location_kind
    FROM stock_items s
    JOIN products  p ON p.id = s.product_id
    JOIN locations l ON l.id = s.location_id
    WHERE ${where.join(' AND ')}
    ORDER BY (s.best_before IS NULL), s.best_before ASC, p.name COLLATE NOCASE
  `).all(...params);

  res.json(rows.map((row) => ({ ...row, opened: row.opened === 1 })));
});

/**
 * Wareneingang. Ohne MHD im Body wird – falls am Artikel hinterlegt – die
 * übliche Haltbarkeit ab heute gerechnet.
 */
stockRouter.post('/purchase', (req, res) => {
  const product = requireRow('products', parseId(req.body?.product_id, 'product_id'), 'Artikel');
  const quantity = requireNumber(req.body, 'quantity', { min: 0.001 });

  const batch = transaction(() => bookPurchase({
    product,
    locationId: optionalInteger(req.body, 'location_id', { min: 1 }),
    quantity,
    bestBefore: optionalDate(req.body, 'best_before') ?? defaultBestBefore(product),
    price: optionalNumber(req.body, 'price', { min: 0 }),
    note: optionalText(req.body, 'note'),
    opened: optionalBoolean(req.body, 'opened') === 1,
  }));

  res.status(201).json({ batch, product: getProductWithStock(product.id) });
});

function defaultBestBefore(product) {
  if (!product.default_shelf_life_days) return null;
  const date = new Date();
  date.setDate(date.getDate() + product.default_shelf_life_days);
  return date.toISOString().slice(0, 10);
}

/** Verbrauch oder Entsorgung, standardmäßig nach FEFO über alle Posten. */
stockRouter.post('/consume', (req, res) => {
  const product = requireRow('products', parseId(req.body?.product_id, 'product_id'), 'Artikel');
  const type = req.body?.type === 'waste' ? 'waste' : 'consume';

  const result = transaction(() => bookConsumption({
    product,
    quantity: requireNumber(req.body, 'quantity', { min: 0.001 }),
    locationId: optionalInteger(req.body, 'location_id', { min: 1 }),
    stockItemId: optionalInteger(req.body, 'stock_item_id', { min: 1 }),
    type,
    note: optionalText(req.body, 'note'),
  }));

  res.json({ ...result, product: getProductWithStock(product.id) });
});

/** Umlagern zwischen zwei Lagerorten, z. B. Gefrierfach → Kühlschrank. */
stockRouter.post('/move', (req, res) => {
  const batch = requireRow('stock_items', parseId(req.body?.stock_item_id, 'stock_item_id'), 'Bestandsposten');
  const product = requireRow('products', batch.product_id, 'Artikel');
  const quantity = optionalNumber(req.body, 'quantity', { min: 0.001 }) ?? batch.quantity;

  const moved = transaction(() => bookMove({
    product,
    batch,
    toLocationId: parseId(req.body?.to_location_id, 'to_location_id'),
    quantity,
    note: optionalText(req.body, 'note'),
  }));

  res.json({ batch: moved, product: getProductWithStock(product.id) });
});

/** Posten korrigieren: Menge, MHD, Ort oder Anbruch direkt bearbeiten. */
stockRouter.patch('/batches/:id', (req, res) => {
  const id = parseId(req.params.id);
  const batch = requireRow('stock_items', id, 'Bestandsposten');
  const body = req.body ?? {};

  const quantity = 'quantity' in body ? requireNumber(body, 'quantity', { min: 0 }) : undefined;
  const opened = 'opened' in body ? optionalBoolean(body, 'opened') : undefined;
  const locationId = 'location_id' in body ? parseId(body.location_id, 'location_id') : undefined;
  if (locationId !== undefined) requireRow('locations', locationId, 'Lagerort');

  const result = transaction(() => {
    if (quantity !== undefined && round3(quantity) !== round3(batch.quantity)) {
      db().prepare(`
        INSERT INTO movements (product_id, stock_item_id, location_id, type, quantity, unit, note)
        VALUES (?, ?, ?, 'correction', ?, ?, ?)
      `).run(
        batch.product_id,
        batch.id,
        locationId ?? batch.location_id,
        round3(quantity - batch.quantity),
        batch.unit,
        optionalText(body, 'note') ?? 'Bestandskorrektur',
      );
    }

    if (quantity === 0) {
      deleteRow('stock_items', id);
      syncAutoShoppingItem(batch.product_id);
      return null;
    }

    const updated = updateRow('stock_items', id, {
      quantity: quantity === undefined ? undefined : round3(quantity),
      location_id: locationId,
      best_before: 'best_before' in body ? optionalDate(body, 'best_before') : undefined,
      opened: opened === undefined ? undefined : opened,
      opened_at: opened === 1 && batch.opened === 0 ? now() : undefined,
      price: 'price' in body ? optionalNumber(body, 'price', { min: 0 }) : undefined,
      note: 'note' in body ? optionalText(body, 'note') : undefined,
    });

    syncAutoShoppingItem(batch.product_id);
    return updated;
  });

  res.json({ batch: result, product: getProductWithStock(batch.product_id) });
});

/** Posten ersatzlos entfernen, ohne ihn als Verbrauch oder Abfall zu werten. */
stockRouter.delete('/batches/:id', (req, res) => {
  const id = parseId(req.params.id);
  const batch = requireRow('stock_items', id, 'Bestandsposten');

  transaction(() => {
    db().prepare(`
      INSERT INTO movements (product_id, stock_item_id, location_id, type, quantity, unit, note)
      VALUES (?, ?, ?, 'correction', ?, ?, 'Posten gelöscht')
    `).run(batch.product_id, batch.id, batch.location_id, -batch.quantity, batch.unit);

    deleteRow('stock_items', id);
    syncAutoShoppingItem(batch.product_id);
  });

  res.status(204).end();
});
