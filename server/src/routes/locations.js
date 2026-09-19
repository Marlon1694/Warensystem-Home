import { Router } from 'express';
import { db, transaction } from '../db/index.js';
import { HttpError } from '../lib/http.js';
import { deleteRow, insertRow, now, requireRow, updateRow } from '../lib/repository.js';
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

/**
 * Reihenfolge festlegen. Die Oberfläche schickt alle IDs in der gewünschten
 * Folge; hier werden daraus saubere Abstände (10, 20, 30 …), sodass sich
 * später bequem etwas dazwischenschieben lässt.
 */
locationsRouter.put('/order', (req, res) => {
  const raw = req.body?.ids;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw HttpError.badRequest('ids muss eine nicht leere Liste von IDs sein');
  }

  const ids = raw.map((id) => parseId(id, 'ids'));
  if (new Set(ids).size !== ids.length) throw HttpError.badRequest('Doppelte IDs in der Reihenfolge');

  transaction((handle) => {
    const statement = handle.prepare('UPDATE locations SET sort_order = ?, updated_at = ? WHERE id = ?');

    ids.forEach((id, index) => {
      // Innerhalb der Transaktion prüfen: bei einer unbekannten ID wird alles
      // zurückgerollt, statt eine halb umsortierte Liste zu hinterlassen.
      const result = statement.run((index + 1) * 10, now(), id);
      if (result.changes === 0) throw HttpError.badRequest(`Unbekannte ID: ${id}`);
    });
  });

  res.json({ ordered: ids.length });
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
