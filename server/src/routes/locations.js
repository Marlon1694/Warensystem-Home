import { Router } from 'express';
import { db } from '../db/index.js';
import { HttpError } from '../lib/http.js';
import { deleteRow, insertRow, requireRow, updateRow } from '../lib/repository.js';
import { LOCATION_KINDS } from '../lib/domain.js';
import { optionalEnum, optionalInteger, optionalText, parseId, requireText } from '../lib/validate.js';

export const locationsRouter = Router();

locationsRouter.get('/', (req, res) => {
  const rows = db().prepare(`
    SELECT
      l.*,
      COALESCE(s.article_count, 0) AS article_count,
      COALESCE(s.batch_count, 0)   AS batch_count
    FROM locations l
    LEFT JOIN (
      SELECT location_id,
             COUNT(DISTINCT product_id) AS article_count,
             COUNT(*)                   AS batch_count
      FROM stock_items
      WHERE quantity > 0
      GROUP BY location_id
    ) s ON s.location_id = l.id
    ORDER BY l.sort_order, l.name COLLATE NOCASE
  `).all();

  res.json(rows);
});

locationsRouter.post('/', (req, res) => {
  const created = insertRow('locations', {
    name: requireText(req.body, 'name', { max: 80 }),
    kind: optionalEnum(req.body, 'kind', LOCATION_KINDS, 'pantry'),
    note: optionalText(req.body, 'note'),
    sort_order: optionalInteger(req.body, 'sort_order') ?? nextSortOrder(),
  });

  res.status(201).json(created);
});

locationsRouter.patch('/:id', (req, res) => {
  const id = parseId(req.params.id);
  requireRow('locations', id, 'Lagerort');

  const updated = updateRow('locations', id, {
    name: 'name' in req.body ? requireText(req.body, 'name', { max: 80 }) : undefined,
    kind: 'kind' in req.body ? optionalEnum(req.body, 'kind', LOCATION_KINDS, 'pantry') : undefined,
    note: 'note' in req.body ? optionalText(req.body, 'note') : undefined,
    sort_order: 'sort_order' in req.body ? optionalInteger(req.body, 'sort_order') : undefined,
  });

  res.json(updated);
});

/**
 * Ein Lagerort mit Bestand wird nur mit ?force=1 gelöscht – sonst würden die
 * Bestandsposten per ON DELETE CASCADE unbemerkt mit verschwinden.
 */
locationsRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  requireRow('locations', id, 'Lagerort');

  const inUse = db()
    .prepare('SELECT COUNT(*) AS n FROM stock_items WHERE location_id = ? AND quantity > 0')
    .get(id).n;

  if (inUse > 0 && req.query.force !== '1') {
    throw HttpError.conflict(
      `Am Lagerort liegen noch ${inUse} Bestandsposten. Zum Löschen samt Bestand force=1 mitgeben.`,
      { batch_count: inUse },
    );
  }

  deleteRow('locations', id);
  res.status(204).end();
});

function nextSortOrder() {
  return (db().prepare('SELECT COALESCE(MAX(sort_order), 0) AS max FROM locations').get().max ?? 0) + 10;
}
