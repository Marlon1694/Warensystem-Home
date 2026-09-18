import { Router } from 'express';
import { db } from '../db/index.js';
import { deleteRow, insertRow, requireRow, updateRow } from '../lib/repository.js';
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
