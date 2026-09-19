import { Router } from 'express';
import { db, transaction } from '../db/index.js';
import { deleteRow, insertRow, now, requireRow, updateRow } from '../lib/repository.js';
import { optionalInteger, optionalText, parseId, requireText } from '../lib/validate.js';
import { HttpError } from '../lib/http.js';

export const categoriesRouter = Router();

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function readColor(body, fallback = '#6b7280') {
  const value = optionalText(body, 'color', { max: 7 });
  if (value === null) return fallback;
  if (!HEX_COLOR.test(value)) throw HttpError.badRequest('Farbe muss ein Hexwert wie #2a78d6 sein');
  return value.toLowerCase();
}

categoriesRouter.get('/', (req, res) => {
  const rows = db().prepare(`
    SELECT c.*, COUNT(p.id) AS article_count
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id AND p.archived = 0
    GROUP BY c.id
    ORDER BY c.sort_order, c.name COLLATE NOCASE
  `).all();

  res.json(rows);
});

categoriesRouter.post('/', (req, res) => {
  const created = insertRow('categories', {
    name: requireText(req.body, 'name', { max: 80 }),
    color: readColor(req.body),
    sort_order: optionalInteger(req.body, 'sort_order') ?? nextSortOrder(),
  });

  res.status(201).json(created);
});

/**
 * Reihenfolge festlegen. Die Oberfläche schickt alle IDs in der gewünschten
 * Folge; hier werden daraus saubere Abstände (10, 20, 30 …), sodass sich
 * später bequem etwas dazwischenschieben lässt.
 */
categoriesRouter.put('/order', (req, res) => {
  const raw = req.body?.ids;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw HttpError.badRequest('ids muss eine nicht leere Liste von IDs sein');
  }

  const ids = raw.map((id) => parseId(id, 'ids'));
  if (new Set(ids).size !== ids.length) throw HttpError.badRequest('Doppelte IDs in der Reihenfolge');

  transaction((handle) => {
    const statement = handle.prepare('UPDATE categories SET sort_order = ?, updated_at = ? WHERE id = ?');

    ids.forEach((id, index) => {
      // Innerhalb der Transaktion prüfen: bei einer unbekannten ID wird alles
      // zurückgerollt, statt eine halb umsortierte Liste zu hinterlassen.
      const result = statement.run((index + 1) * 10, now(), id);
      if (result.changes === 0) throw HttpError.badRequest(`Unbekannte ID: ${id}`);
    });
  });

  res.json({ ordered: ids.length });
});

categoriesRouter.patch('/:id', (req, res) => {
  const id = parseId(req.params.id);
  const current = requireRow('categories', id, 'Kategorie');

  const updated = updateRow('categories', id, {
    name: 'name' in req.body ? requireText(req.body, 'name', { max: 80 }) : undefined,
    color: 'color' in req.body ? readColor(req.body, current.color) : undefined,
    sort_order: 'sort_order' in req.body ? optionalInteger(req.body, 'sort_order') : undefined,
  });

  res.json(updated);
});

// Artikel der Kategorie bleiben erhalten (ON DELETE SET NULL).
categoriesRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  requireRow('categories', id, 'Kategorie');
  deleteRow('categories', id);
  res.status(204).end();
});

function nextSortOrder() {
  return (db().prepare('SELECT COALESCE(MAX(sort_order), 0) AS max FROM categories').get().max ?? 0) + 10;
}
