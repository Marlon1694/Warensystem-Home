import { Router } from 'express';
import { db } from '../db/index.js';
import { HttpError } from '../lib/http.js';
import {
  DASHBOARD_TILES,
  DASHBOARD_WIDGETS,
  DEFAULT_DASHBOARD,
  LOCATION_KINDS,
  MOVEMENT_TYPES,
  UNITS,
} from '../lib/domain.js';

export const settingsRouter = Router();

/**
 * Die Zusammenstellung der Übersicht wird als JSON abgelegt. Geprüft wird sie
 * hier und nicht erst in der Oberfläche: der Wert kommt aus einem Browser und
 * wird später von jedem Gerät im Haushalt gelesen.
 */
function parseDashboard(value) {
  const layout = typeof value === 'string' ? safeParse(value) : value;

  if (!Array.isArray(layout)) throw HttpError.badRequest('dashboard_layout muss eine Liste von Abschnitten sein');
  if (layout.length > 24) throw HttpError.badRequest('Höchstens 24 Abschnitte');

  const seen = new Set();
  const clean = layout.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw HttpError.badRequest(`Abschnitt ${index + 1} ist kein Objekt`);
    }
    if (!DASHBOARD_WIDGETS.includes(entry.type)) {
      throw HttpError.badRequest(`Unbekannter Abschnitt: ${entry.type}`);
    }

    const id = String(entry.id ?? `${entry.type}-${index}`).slice(0, 64);
    if (seen.has(id)) throw HttpError.badRequest(`Doppelte Abschnitts-ID: ${id}`);
    seen.add(id);

    return { id, type: entry.type, options: cleanOptions(entry.type, entry.options) };
  });

  return JSON.stringify(clean);
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    throw HttpError.badRequest('dashboard_layout ist kein gültiges JSON');
  }
}

/** Nur bekannte Einstellungen je Abschnitt übernehmen. */
function cleanOptions(type, raw) {
  const options = raw && typeof raw === 'object' ? raw : {};
  const result = {};

  if (type === 'stats') {
    const tiles = Array.isArray(options.tiles) ? options.tiles.filter((tile) => DASHBOARD_TILES.includes(tile)) : [];
    result.tiles = tiles.length > 0 ? tiles.slice(0, 6) : DASHBOARD_TILES.slice(0, 4);
  }

  if (['expiring', 'shopping', 'low_stock', 'recent', 'location_stock'].includes(type)) {
    const limit = Number(options.limit);
    result.limit = Number.isInteger(limit) && limit >= 1 && limit <= 50 ? limit : 5;
  }

  if (type === 'expiring') {
    const days = Number(options.days);
    if (Number.isInteger(days) && days >= 0 && days <= 365) result.days = days;
  }

  if (type === 'location_stock') {
    const locationId = Number(options.location_id);
    if (!Number.isInteger(locationId) || locationId <= 0) {
      throw HttpError.badRequest('Für den Abschnitt "Bestand eines Lagerorts" fehlt der Lagerort');
    }
    result.location_id = locationId;
  }

  if (type === 'note') {
    result.title = String(options.title ?? 'Notiz').trim().slice(0, 80) || 'Notiz';
    result.text = String(options.text ?? '').trim().slice(0, 2000);
  }

  return result;
}

/** Einstellungen, die über die Oberfläche geändert werden dürfen. */
const EDITABLE = {
  dashboard_layout: parseDashboard,
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
    dashboard_widgets: DASHBOARD_WIDGETS,
    dashboard_tiles: DASHBOARD_TILES,
    default_dashboard: DEFAULT_DASHBOARD,
    revision: db().prepare('SELECT COALESCE(MAX(rev), 0) AS rev FROM change_log').get().rev,
  });
});
