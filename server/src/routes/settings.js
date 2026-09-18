import { Router } from 'express';
import { db } from '../db/index.js';
import { HttpError } from '../lib/http.js';
import { LOCATION_KINDS, MOVEMENT_TYPES, UNITS } from '../lib/domain.js';

export const settingsRouter = Router();

/** Einstellungen, die über die Oberfläche geändert werden dürfen. */
const EDITABLE = {
  household_name: (value) => String(value).trim().slice(0, 80) || 'Zuhause',
  expiry_warn_days: (value) => {
    const days = Number(value);
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      throw HttpError.badRequest('expiry_warn_days muss zwischen 0 und 365 liegen');
    }
    return String(days);
  },
  currency: (value) => String(value).trim().toUpperCase().slice(0, 3) || 'EUR',
};

settingsRouter.get('/', (req, res) => {
  const rows = db().prepare('SELECT key, value FROM settings').all();
  res.json(Object.fromEntries(rows.map((row) => [row.key, row.value])));
});

settingsRouter.put('/', (req, res) => {
  const body = req.body ?? {};
  const unknown = Object.keys(body).filter((key) => !(key in EDITABLE));
  if (unknown.length > 0) {
    throw HttpError.badRequest(`Unbekannte Einstellung: ${unknown.join(', ')}`);
  }

  const statement = db().prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  for (const [key, raw] of Object.entries(body)) {
    statement.run(key, EDITABLE[key](raw));
  }

  const rows = db().prepare('SELECT key, value FROM settings').all();
  res.json(Object.fromEntries(rows.map((row) => [row.key, row.value])));
});

/** Auswahllisten, damit die Oberfläche sie nicht doppelt pflegen muss. */
settingsRouter.get('/meta', (req, res) => {
  res.json({
    units: UNITS,
    location_kinds: LOCATION_KINDS,
    movement_types: MOVEMENT_TYPES,
    revision: db().prepare('SELECT COALESCE(MAX(rev), 0) AS rev FROM change_log').get().rev,
  });
});
