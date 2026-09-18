import { db } from '../db/index.js';
import { HttpError } from './http.js';

/** Zeitstempel im gleichen Format wie die Vorgabewerte des Schemas. */
export function now() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * node:sqlite akzeptiert nur null, Zahlen, Strings und Buffer als Bindewerte.
 * Booleans und undefined kommen aus JSON-Bodies regelmäßig vor.
 */
function bindable(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function columns(data) {
  return Object.keys(data).filter((key) => data[key] !== undefined);
}

export function insertRow(table, data) {
  const keys = columns(data);
  if (keys.length === 0) throw HttpError.badRequest('Keine Daten übergeben');

  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
  const result = db().prepare(sql).run(...keys.map((key) => bindable(data[key])));
  return getRow(table, Number(result.lastInsertRowid));
}

/**
 * Aktualisiert nur die übergebenen Felder. updated_at wird hier gesetzt und
 * nicht per Trigger, damit jede Änderung genau einen Protokolleintrag erzeugt.
 */
export function updateRow(table, id, data) {
  const keys = columns(data);
  if (keys.length === 0) return getRow(table, id);

  const assignments = [...keys.map((key) => `${key} = ?`), 'updated_at = ?'];
  const values = [...keys.map((key) => bindable(data[key])), now(), id];

  const sql = `UPDATE ${table} SET ${assignments.join(', ')} WHERE id = ?`;
  const result = db().prepare(sql).run(...values);
  if (result.changes === 0) throw HttpError.notFound('Eintrag nicht gefunden');

  return getRow(table, id);
}

export function deleteRow(table, id) {
  const result = db().prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  if (result.changes === 0) throw HttpError.notFound('Eintrag nicht gefunden');
}

export function getRow(table, id) {
  return db().prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) ?? null;
}

export function requireRow(table, id, label = 'Eintrag') {
  const row = getRow(table, id);
  if (!row) throw HttpError.notFound(`${label} nicht gefunden`);
  return row;
}

/** SQLite kennt kein Boolean – für die API wandeln wir 0/1 in true/false. */
export function toBool(value) {
  return value === 1 || value === true;
}
