import { HttpError } from './http.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function missing(field) {
  return HttpError.badRequest(`Pflichtfeld fehlt: ${field}`);
}

function invalid(field, expectation) {
  return HttpError.badRequest(`Ungültiger Wert für ${field}: ${expectation}`);
}

function isBlank(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

export function requireText(body, field, { max = 200 } = {}) {
  if (isBlank(body?.[field])) throw missing(field);
  const value = String(body[field]).trim();
  if (value.length > max) throw invalid(field, `höchstens ${max} Zeichen`);
  return value;
}

export function optionalText(body, field, { max = 500 } = {}) {
  if (isBlank(body?.[field])) return null;
  const value = String(body[field]).trim();
  if (value.length > max) throw invalid(field, `höchstens ${max} Zeichen`);
  return value;
}

export function requireNumber(body, field, { min = -Infinity, max = Infinity } = {}) {
  if (isBlank(body?.[field])) throw missing(field);
  const value = Number(body[field]);
  if (!Number.isFinite(value)) throw invalid(field, 'eine Zahl');
  if (value < min || value > max) throw invalid(field, `zwischen ${min} und ${max}`);
  return value;
}

export function optionalNumber(body, field, { min = -Infinity, max = Infinity } = {}) {
  if (isBlank(body?.[field])) return null;
  return requireNumber(body, field, { min, max });
}

export function optionalInteger(body, field, { min = -Infinity, max = Infinity } = {}) {
  const value = optionalNumber(body, field, { min, max });
  if (value === null) return null;
  if (!Number.isInteger(value)) throw invalid(field, 'eine ganze Zahl');
  return value;
}

/** Datum im Format JJJJ-MM-TT, wie es <input type="date"> liefert. */
export function optionalDate(body, field) {
  if (isBlank(body?.[field])) return null;
  const value = String(body[field]).trim();
  if (!DATE_PATTERN.test(value)) throw invalid(field, 'ein Datum im Format JJJJ-MM-TT');
  if (Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw invalid(field, 'ein gültiges Datum');
  return value;
}

export function requireEnum(body, field, allowed) {
  if (isBlank(body?.[field])) throw missing(field);
  const value = String(body[field]).trim();
  if (!allowed.includes(value)) throw invalid(field, `einer von: ${allowed.join(', ')}`);
  return value;
}

export function optionalEnum(body, field, allowed, fallback = null) {
  if (isBlank(body?.[field])) return fallback;
  return requireEnum(body, field, allowed);
}

export function optionalBoolean(body, field) {
  const value = body?.[field];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === 1 || value === 0) return value;
  if (value === 'true' || value === '1') return 1;
  if (value === 'false' || value === '0') return 0;
  throw invalid(field, 'ja oder nein');
}

/** Pfad- oder Query-Parameter als positive ganze Zahl (Datensatz-ID). */
export function parseId(raw, field = 'id') {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw invalid(field, 'eine gültige ID');
  return value;
}
