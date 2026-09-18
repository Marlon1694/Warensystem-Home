import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Projektwurzel (…/Warensystem-Home), unabhängig vom Arbeitsverzeichnis. */
export const rootDir = resolve(here, '..', '..');

function fromEnv(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function asPath(value, fallback) {
  const raw = fromEnv(value, fallback);
  return isAbsolute(raw) ? raw : resolve(rootDir, raw);
}

export const config = {
  /** Port des Servers im Heimnetz. */
  port: Number(fromEnv('PORT', '4000')),
  /** 0.0.0.0 macht den Server für alle Geräte im Heimnetz erreichbar. */
  host: fromEnv('HOST', '0.0.0.0'),
  /** Ablage der SQLite-Datenbank. */
  databaseFile: asPath('DATABASE_FILE', 'data/warensystem.db'),
  /** Verzeichnis für automatische Backups. */
  backupDir: asPath('BACKUP_DIR', 'data/backups'),
  /** Gebaute PWA, die der Server mit ausliefert. */
  webDir: asPath('WEB_DIR', 'web/dist'),
  /**
   * HTTPS ist im Heimnetz nötig, damit iOS Safari die Kamera für den
   * Barcode-Scanner freigibt – über http:// verweigert iOS den Zugriff.
   */
  tls: {
    keyFile: asPath('TLS_KEY_FILE', 'certs/server.key'),
    certFile: asPath('TLS_CERT_FILE', 'certs/server.crt'),
    /** 'auto' aktiviert HTTPS, sobald Zertifikate vorhanden sind. */
    mode: fromEnv('TLS_MODE', 'auto'),
  },
  /** Produktdaten-Lookup für gescannte Barcodes. */
  openFoodFacts: {
    enabled: fromEnv('OFF_ENABLED', 'true') !== 'false',
    baseUrl: fromEnv('OFF_BASE_URL', 'https://world.openfoodfacts.org'),
    timeoutMs: Number(fromEnv('OFF_TIMEOUT_MS', '6000')),
  },
  /** Vorwarnzeit für Mindesthaltbarkeitsdaten in Tagen. */
  expiryWarnDays: Number(fromEnv('EXPIRY_WARN_DAYS', '5')),
};
