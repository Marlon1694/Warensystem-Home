import { Router } from 'express';
import { db } from '../db/index.js';
import { HttpError } from '../lib/http.js';
import { round3 } from '../lib/domain.js';

export const statsRouter = Router();

function period(raw, fallback = 30) {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 730) {
    throw HttpError.badRequest('days muss zwischen 1 und 730 liegen');
  }
  return value;
}

function startDate(days) {
  const date = new Date();
  date.setDate(date.getDate() - (days - 1));
  return date.toISOString().slice(0, 10);
}

/** Kennzahlen für das Dashboard. */
statsRouter.get('/overview', (req, res) => {
  const warnDays = Number(
    db().prepare("SELECT value FROM settings WHERE key = 'expiry_warn_days'").get()?.value ?? 5,
  );

  const totals = db().prepare(`
    SELECT
      COUNT(DISTINCT s.product_id) AS products_in_stock,
      COUNT(*)                     AS batches,
      COALESCE(SUM(s.price), 0)    AS stock_value
    FROM stock_items s WHERE s.quantity > 0
  `).get();

  const expiry = db().prepare(`
    SELECT
      SUM(CASE WHEN best_before < date('now') THEN 1 ELSE 0 END) AS expired,
      SUM(CASE WHEN best_before >= date('now')
                AND best_before <= date('now', '+' || ? || ' days') THEN 1 ELSE 0 END) AS expiring_soon
    FROM stock_items
    WHERE quantity > 0 AND best_before IS NOT NULL
  `).get(warnDays);

  const belowMin = db().prepare(`
    SELECT COUNT(*) AS n FROM products p
    WHERE p.archived = 0 AND p.min_stock > 0
      AND COALESCE((SELECT SUM(quantity) FROM stock_items WHERE product_id = p.id), 0) < p.min_stock
  `).get().n;

  const byLocation = db().prepare(`
    SELECT
      l.id, l.name, l.kind,
      COUNT(DISTINCT s.product_id) AS products,
      COUNT(s.id)                  AS batches,
      COALESCE(SUM(s.price), 0)    AS value
    FROM locations l
    LEFT JOIN stock_items s ON s.location_id = l.id AND s.quantity > 0
    GROUP BY l.id
    ORDER BY l.sort_order, l.name COLLATE NOCASE
  `).all();

  res.json({
    products_total: db().prepare('SELECT COUNT(*) AS n FROM products WHERE archived = 0').get().n,
    products_in_stock: totals.products_in_stock,
    batches: totals.batches,
    stock_value: round3(totals.stock_value),
    expired: expiry.expired ?? 0,
    expiring_soon: expiry.expiring_soon ?? 0,
    below_min_stock: belowMin,
    shopping_open: db().prepare('SELECT COUNT(*) AS n FROM shopping_items WHERE done = 0').get().n,
    warn_days: warnDays,
    by_location: byLocation.map((row) => ({ ...row, value: round3(row.value) })),
  });
});

/**
 * Tagesverlauf von Verbrauch und Abfall. Gezählt werden Buchungen und Werte,
 * nicht Mengen: Stück, Gramm und Liter lassen sich nicht sinnvoll addieren.
 */
statsRouter.get('/activity', (req, res) => {
  const days = period(req.query.days, 30);
  const from = startDate(days);

  const rows = db().prepare(`
    SELECT
      substr(created_at, 1, 10) AS day,
      type,
      COUNT(*)                        AS bookings,
      COALESCE(SUM(ABS(price)), 0)    AS value
    FROM movements
    WHERE substr(created_at, 1, 10) >= ?
    GROUP BY day, type
  `).all(from);

  const byDay = new Map();
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(`${from}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    const day = date.toISOString().slice(0, 10);
    byDay.set(day, { day, consume: 0, waste: 0, purchase: 0, consume_value: 0, waste_value: 0 });
  }

  for (const row of rows) {
    const bucket = byDay.get(row.day);
    if (!bucket) continue;
    if (row.type === 'consume') {
      bucket.consume = row.bookings;
      bucket.consume_value = round3(row.value);
    } else if (row.type === 'waste') {
      bucket.waste = row.bookings;
      bucket.waste_value = round3(row.value);
    } else if (row.type === 'purchase') {
      bucket.purchase = row.bookings;
    }
  }

  res.json({ days, from, series: [...byDay.values()] });
});

/**
 * Am häufigsten verbrauchte bzw. weggeworfene Artikel. Sortiert wird nach der
 * Zahl der Buchungen: Mengen verschiedener Artikel stehen in verschiedenen
 * Einheiten und lassen sich nicht auf einer Skala vergleichen. Die Menge je
 * Artikel wird trotzdem mitgeliefert – sie ist in sich stimmig.
 */
statsRouter.get('/top', (req, res) => {
  const days = period(req.query.days, 90);
  const type = req.query.type === 'waste' ? 'waste' : 'consume';
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);

  const rows = db().prepare(`
    SELECT
      p.id, p.name, p.unit, p.brand,
      c.name  AS category_name,
      c.color AS category_color,
      COUNT(*)                     AS bookings,
      SUM(ABS(m.quantity))         AS quantity,
      COALESCE(SUM(ABS(m.price)), 0) AS value
    FROM movements m
    JOIN products p ON p.id = m.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE m.type = ? AND substr(m.created_at, 1, 10) >= ?
    GROUP BY p.id
    ORDER BY bookings DESC, quantity DESC
    LIMIT ?
  `).all(type, startDate(days), limit);

  res.json({
    days,
    type,
    items: rows.map((row) => ({ ...row, quantity: round3(row.quantity), value: round3(row.value) })),
  });
});

/** Wie viel wird weggeworfen statt verbraucht? */
statsRouter.get('/waste', (req, res) => {
  const days = period(req.query.days, 90);
  const from = startDate(days);

  const totals = db().prepare(`
    SELECT
      SUM(CASE WHEN type = 'consume' THEN 1 ELSE 0 END)            AS consume_bookings,
      SUM(CASE WHEN type = 'waste'   THEN 1 ELSE 0 END)            AS waste_bookings,
      COALESCE(SUM(CASE WHEN type = 'consume' THEN ABS(price) END), 0) AS consume_value,
      COALESCE(SUM(CASE WHEN type = 'waste'   THEN ABS(price) END), 0) AS waste_value
    FROM movements
    WHERE substr(created_at, 1, 10) >= ? AND type IN ('consume', 'waste')
  `).get(from);

  const consumeBookings = totals.consume_bookings ?? 0;
  const wasteBookings = totals.waste_bookings ?? 0;
  const handled = consumeBookings + wasteBookings;

  const byCategory = db().prepare(`
    SELECT
      COALESCE(c.name, 'Ohne Kategorie') AS category_name,
      COALESCE(c.color, '#6b7280')       AS category_color,
      COUNT(*)                           AS bookings,
      COALESCE(SUM(ABS(m.price)), 0)     AS value
    FROM movements m
    JOIN products p ON p.id = m.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE m.type = 'waste' AND substr(m.created_at, 1, 10) >= ?
    GROUP BY c.id
    ORDER BY bookings DESC
  `).all(from);

  res.json({
    days,
    from,
    consume_bookings: consumeBookings,
    waste_bookings: wasteBookings,
    consume_value: round3(totals.consume_value),
    waste_value: round3(totals.waste_value),
    waste_ratio: handled === 0 ? 0 : round3(wasteBookings / handled),
    by_category: byCategory.map((row) => ({ ...row, value: round3(row.value) })),
  });
});
