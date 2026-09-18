/** Fehler mit HTTP-Statuscode, den die zentrale Fehlerbehandlung ausliefert. */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }

  static badRequest(message, details) {
    return new HttpError(400, message, details);
  }

  static notFound(message = 'Nicht gefunden') {
    return new HttpError(404, message);
  }

  static conflict(message, details) {
    return new HttpError(409, message, details);
  }
}

/** Liefert eine Ressource oder bricht mit 404 ab. */
export function orNotFound(value, message) {
  if (value === undefined || value === null) throw HttpError.notFound(message);
  return value;
}

/** Zentrale Fehlerbehandlung: übersetzt bekannte Fehler in saubere Antworten. */
export function errorHandler(error, req, res, _next) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message, details: error.details });
  }

  const sqlite = String(error?.message ?? '');
  if (sqlite.includes('UNIQUE constraint failed')) {
    return res.status(409).json({ error: 'Eintrag existiert bereits', details: sqlite });
  }
  if (sqlite.includes('FOREIGN KEY constraint failed')) {
    return res.status(400).json({ error: 'Verweis auf einen nicht vorhandenen Eintrag' });
  }
  if (sqlite.includes('CHECK constraint failed')) {
    return res.status(400).json({ error: 'Wert außerhalb des zulässigen Bereichs', details: sqlite });
  }

  console.error(`[api] ${req.method} ${req.originalUrl}`, error);
  return res.status(500).json({ error: 'Interner Serverfehler' });
}
