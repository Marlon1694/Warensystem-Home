import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Tabellen, deren Änderungen für einen späteren Sync protokolliert werden. */
const TRACKED_TABLES = [
  'locations',
  'categories',
  'products',
  'stock_items',
  'movements',
  'shopping_items',
];

/**
 * Trigger, die jede Änderung nach change_log schreiben. Als SQL erzeugt statt
 * von Hand geschrieben, damit alle Tabellen garantiert gleich behandelt werden.
 *
 * Die Trigger schreiben bewusst kein updated_at: eine UPDATE-Anweisung im
 * Trigger-Rumpf würde je nach PRAGMA recursive_triggers erneut protokolliert.
 * updated_at setzen stattdessen die Schreib-Helfer in lib/repository.js.
 */
function changeTrackingSql() {
  return TRACKED_TABLES.flatMap((table) => [
    `DROP TRIGGER IF EXISTS trg_${table}_insert;`,
    `CREATE TRIGGER trg_${table}_insert AFTER INSERT ON ${table} BEGIN
       INSERT INTO change_log (entity, entity_id, op) VALUES ('${table}', NEW.id, 'insert');
     END;`,
    `DROP TRIGGER IF EXISTS trg_${table}_update;`,
    `CREATE TRIGGER trg_${table}_update AFTER UPDATE ON ${table} BEGIN
       INSERT INTO change_log (entity, entity_id, op) VALUES ('${table}', NEW.id, 'update');
     END;`,
    `DROP TRIGGER IF EXISTS trg_${table}_delete;`,
    `CREATE TRIGGER trg_${table}_delete AFTER DELETE ON ${table} BEGIN
       INSERT INTO change_log (entity, entity_id, op) VALUES ('${table}', OLD.id, 'delete');
     END;`,
  ]).join('\n');
}

/**
 * Migrationen laufen über PRAGMA user_version. Neue Schritte werden hinten
 * angehängt – bestehende dürfen nie verändert werden.
 */
const migrations = [
  {
    version: 1,
    name: 'Grundschema',
    up: (db) => db.exec(readFileSync(join(here, 'schema.sql'), 'utf8')),
  },
  {
    version: 2,
    name: 'Änderungsprotokoll per Trigger',
    up: (db) => db.exec(changeTrackingSql()),
  },
];

let instance = null;

/** Öffnet die Datenbank und bringt sie auf den aktuellen Schemastand. */
export function openDatabase(file = config.databaseFile) {
  mkdirSync(dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  // WAL erlaubt gleichzeitige Leser, während ein Gerät schreibt – im Heimnetz
  // greifen mehrere Handys parallel zu.
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');

  runMigrations(db);
  return db;
}

function runMigrations(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version ?? 0;

  for (const migration of migrations) {
    if (migration.version <= current) continue;

    db.exec('BEGIN');
    try {
      migration.up(db);
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec('COMMIT');
      console.log(`[db] Migration ${migration.version} angewendet: ${migration.name}`);
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(
        `Migration ${migration.version} (${migration.name}) fehlgeschlagen: ${error.message}`,
        { cause: error },
      );
    }
  }
}

/** Gemeinsame Datenbankverbindung des Servers. */
export function db() {
  if (!instance) instance = openDatabase();
  return instance;
}

/** Führt mehrere Schreibvorgänge als eine Einheit aus. */
export function transaction(fn) {
  const handle = db();
  handle.exec('BEGIN');
  try {
    const result = fn(handle);
    handle.exec('COMMIT');
    return result;
  } catch (error) {
    handle.exec('ROLLBACK');
    throw error;
  }
}

export function closeDatabase() {
  if (instance) {
    instance.close();
    instance = null;
  }
}
