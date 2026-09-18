import { db, closeDatabase } from './index.js';

/**
 * Typische Lagerorte eines Haushalts. "kind" steuert Symbol und Sortierung in
 * der Oberfläche und liefert die Vorgabe für die Haltbarkeitswarnung.
 */
const DEFAULT_LOCATIONS = [
  { name: 'Kühlschrank', kind: 'fridge', sort_order: 10, note: 'Frischwaren, angebrochene Packungen' },
  { name: 'Gefrierfach', kind: 'freezer', sort_order: 20, note: 'Tiefgekühltes' },
  { name: 'Vorratskammer', kind: 'pantry', sort_order: 30, note: 'Trockenwaren und Konserven' },
  { name: 'Küche', kind: 'kitchen', sort_order: 40, note: 'Schränke und Arbeitsfläche' },
  { name: 'Keller', kind: 'cellar', sort_order: 50, note: 'Getränkekisten, Großpackungen, Eingemachtes' },
];

/**
 * Farben stammen aus einer auf Farbfehlsichtigkeit geprüften Palette. Sie
 * dienen nur als Wiedererkennungsmerkmal – der Name steht immer daneben.
 */
const DEFAULT_CATEGORIES = [
  { name: 'Obst & Gemüse', color: '#008300', sort_order: 10 },
  { name: 'Molkereiprodukte', color: '#2a78d6', sort_order: 20 },
  { name: 'Fleisch & Fisch', color: '#e34948', sort_order: 30 },
  { name: 'Brot & Backwaren', color: '#eda100', sort_order: 40 },
  { name: 'Tiefkühlkost', color: '#1baf7a', sort_order: 50 },
  { name: 'Konserven & Vorräte', color: '#eb6834', sort_order: 60 },
  { name: 'Getränke', color: '#4a3aa7', sort_order: 70 },
  { name: 'Süßes & Snacks', color: '#e87ba4', sort_order: 80 },
  { name: 'Gewürze & Saucen', color: '#6b7280', sort_order: 90 },
  { name: 'Haushalt & Sonstiges', color: '#6b7280', sort_order: 100 },
];

const DEFAULT_SETTINGS = [
  ['household_name', 'Zuhause'],
  ['expiry_warn_days', '5'],
  ['currency', 'EUR'],
];

/**
 * Legt Grunddaten an, sofern noch keine vorhanden sind. Mehrfaches Aufrufen
 * ändert nichts – bereits angelegte oder umbenannte Einträge bleiben erhalten.
 */
export function seedDefaults(handle = db()) {
  const summary = { locations: 0, categories: 0, settings: 0 };

  const locationCount = handle.prepare('SELECT COUNT(*) AS n FROM locations').get().n;
  if (locationCount === 0) {
    const insert = handle.prepare(
      'INSERT INTO locations (name, kind, note, sort_order) VALUES (?, ?, ?, ?)',
    );
    for (const item of DEFAULT_LOCATIONS) {
      insert.run(item.name, item.kind, item.note, item.sort_order);
      summary.locations += 1;
    }
  }

  const categoryCount = handle.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
  if (categoryCount === 0) {
    const insert = handle.prepare(
      'INSERT INTO categories (name, color, sort_order) VALUES (?, ?, ?)',
    );
    for (const item of DEFAULT_CATEGORIES) {
      insert.run(item.name, item.color, item.sort_order);
      summary.categories += 1;
    }
  }

  const insertSetting = handle.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
  );
  for (const [key, value] of DEFAULT_SETTINGS) {
    summary.settings += insertSetting.run(key, value).changes;
  }

  return summary;
}

// Direkter Aufruf: node server/src/db/seed.js
if (import.meta.url === `file://${process.argv[1]}`) {
  const summary = seedDefaults();
  console.log(
    `[seed] ${summary.locations} Lagerorte, ${summary.categories} Kategorien, ` +
    `${summary.settings} Einstellungen angelegt.`,
  );
  closeDatabase();
}
