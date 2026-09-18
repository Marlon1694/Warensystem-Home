import { Router } from 'express';
import { db, transaction } from '../db/index.js';
import { deleteRow, insertRow, requireRow, updateRow } from '../lib/repository.js';
import { UNITS, bookPurchase, getProductWithStock, syncAllAutoShoppingItems } from '../lib/domain.js';
import { HttpError } from '../lib/http.js';
import {
  optionalBoolean,
  optionalDate,
  optionalInteger,
  optionalNumber,
  optionalText,
  parseId,
  requireNumber,
  requireText,
} from '../lib/validate.js';

export const shoppingRouter = Router();

shoppingRouter.get('/', (req, res) => {
  // Mindestbestände können sich seit dem letzten Aufruf geändert haben.
  syncAllAutoShoppingItems();

  const rows = db().prepare(`
    SELECT
      i.*,
      p.name  AS product_name,
      p.brand,
      p.min_stock,
      c.name  AS category_name,
      c.color AS category_color,
      COALESCE(s.total_quantity, 0) AS current_quantity
    FROM shopping_items i
    LEFT JOIN products   p ON p.id = i.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN (
      SELECT product_id, SUM(quantity) AS total_quantity
      FROM stock_items WHERE quantity > 0 GROUP BY product_id
    ) s ON s.product_id = i.product_id
    ORDER BY i.done, c.sort_order, i.name COLLATE NOCASE
  `).all();

  res.json(rows.map((row) => ({ ...row, done: row.done === 1 })));
});

shoppingRouter.post('/', (req, res) => {
  const productId = optionalInteger(req.body, 'product_id', { min: 1 });
  const product = productId ? requireRow('products', productId, 'Artikel') : null;

  // Steht der Artikel schon automatisch auf der Liste, wird daraus ein
  // manueller Eintrag statt eines zweiten Postens.
  if (product) {
    const existing = db()
      .prepare('SELECT * FROM shopping_items WHERE product_id = ?')
      .get(product.id);

    if (existing) {
      const updated = updateRow('shopping_items', existing.id, {
        quantity: optionalNumber(req.body, 'quantity', { min: 0.001 }) ?? existing.quantity,
        source: 'manual',
        done: 0,
      });
      return res.status(200).json(updated);
    }
  }

  const unit = optionalText(req.body, 'unit', { max: 20 }) ?? product?.unit ?? 'Stk';
  if (!UNITS.includes(unit)) {
    throw HttpError.badRequest(`Unbekannte Einheit. Erlaubt: ${UNITS.join(', ')}`);
  }

  const created = insertRow('shopping_items', {
    product_id: product?.id ?? null,
    name: product?.name ?? requireText(req.body, 'name', { max: 160 }),
    quantity: optionalNumber(req.body, 'quantity', { min: 0.001 }) ?? 1,
    unit,
    note: optionalText(req.body, 'note'),
    source: 'manual',
  });

  return res.status(201).json(created);
});

shoppingRouter.patch('/:id', (req, res) => {
  const id = parseId(req.params.id);
  requireRow('shopping_items', id, 'Einkaufslisteneintrag');
  const body = req.body ?? {};

  const updated = updateRow('shopping_items', id, {
    name: 'name' in body ? requireText(body, 'name', { max: 160 }) : undefined,
    quantity: 'quantity' in body ? requireNumber(body, 'quantity', { min: 0.001 }) : undefined,
    unit: 'unit' in body ? optionalText(body, 'unit', { max: 20 }) : undefined,
    note: 'note' in body ? optionalText(body, 'note') : undefined,
    done: 'done' in body ? optionalBoolean(body, 'done') : undefined,
  });

  res.json({ ...updated, done: updated.done === 1 });
});

/**
 * Eingekauft: bucht die Menge in den Bestand und nimmt den Eintrag von der
 * Liste. Freitext-Einträge ohne Artikelbezug werden nur abgehakt.
 */
shoppingRouter.post('/:id/purchase', (req, res) => {
  const id = parseId(req.params.id);
  const item = requireRow('shopping_items', id, 'Einkaufslisteneintrag');

  if (!item.product_id) {
    const updated = updateRow('shopping_items', id, { done: 1 });
    return res.json({ item: { ...updated, done: true }, product: null });
  }

  const product = requireRow('products', item.product_id, 'Artikel');

  const result = transaction(() => {
    const batch = bookPurchase({
      product,
      locationId: optionalInteger(req.body, 'location_id', { min: 1 }),
      quantity: optionalNumber(req.body, 'quantity', { min: 0.001 }) ?? item.quantity,
      bestBefore: optionalDate(req.body, 'best_before'),
      price: optionalNumber(req.body, 'price', { min: 0 }),
      note: optionalText(req.body, 'note'),
      opened: false,
    });

    // bookPurchase hat den Automatikeintrag ggf. schon entfernt.
    const stillThere = db().prepare('SELECT id FROM shopping_items WHERE id = ?').get(id);
    if (stillThere) deleteRow('shopping_items', id);

    return batch;
  });

  return res.json({ batch: result, product: getProductWithStock(product.id) });
});

shoppingRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  requireRow('shopping_items', id, 'Einkaufslisteneintrag');
  deleteRow('shopping_items', id);
  res.status(204).end();
});

/** Abgehakte Einträge sammeln sich an – hier werden sie in einem Rutsch entfernt. */
shoppingRouter.post('/clear-done', (req, res) => {
  const result = db().prepare('DELETE FROM shopping_items WHERE done = 1').run();
  res.json({ removed: result.changes });
});
