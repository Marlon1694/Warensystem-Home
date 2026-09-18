import { Router } from 'express';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, transaction } from '../db/index.js';
import { config } from '../config.js';
import { HttpError } from '../lib/http.js';
import { seedDefaults } from '../db/seed.js';

export const backupRouter = Router();

/** Reihenfolge ist wichtig: beim Einspielen müssen Verweise schon existieren. */
const TABLES = ['locations', 'categories', 'products', 'stock_items', 'movements', 'shopping_items', 'settings'];

/** Vollständiger Datenbestand als JSON – die Sicherung für den Haushalt. */
export function exportSnapshot() {
  const data = {};
  for (const table of TABLES) {
    data[table] = db().prepare(`SELECT * FROM ${table}`).all().map((row) => ({ ...row }));
  }

  return {
    format: 'warensystem-home',
    version: 1,
    exported_at: new Date().toISOString(),
    data,
  };
}

backupRouter.get('/export', (req, res) => {
  const snapshot = exportSnapshot();
  const stamp = snapshot.exported_at.slice(0, 19).replace(/[:T]/g, '-');

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="warensystem-${stamp}.json"`);
  res.send(JSON.stringify(snapshot, null, 2));
});

/**
 * Spielt eine Sicherung ein und ersetzt dabei den gesamten Bestand.
 * Läuft in einer Transaktion: bricht etwas ab, bleiben die alten Daten stehen.
 */
backupRouter.post('/import', (req, res) => {
  const snapshot = req.body;
  if (snapshot?.format !== 'warensystem-home' || !snapshot?.data) {
    throw HttpError.badRequest('Keine gültige Sicherungsdatei dieses Systems');
  }

  const counts = transaction((handle) => {
    handle.exec('PRAGMA foreign_keys = OFF');
    try {
      for (const table of [...TABLES].reverse()) {
        handle.exec(`DELETE FROM ${table}`);
      }

      const inserted = {};
      for (const table of TABLES) {
        const rows = snapshot.data[table] ?? [];
        inserted[table] = 0;

        for (const row of rows) {
          const keys = Object.keys(row).filter((key) => row[key] !== undefined);
          if (keys.length === 0) continue;

          handle.prepare(
            `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
          ).run(...keys.map((key) => (typeof row[key] === 'boolean' ? Number(row[key]) : row[key])));

          inserted[table] += 1;
        }
      }
      return inserted;
    } finally {
      handle.exec('PRAGMA foreign_keys = ON');
    }
  });

  seedDefaults();
  res.json({ imported: counts });
});

/** Setzt den Bestand zurück, behält aber Lagerorte und Kategorien. */
backupRouter.post('/reset-stock', (req, res) => {
  if (req.body?.confirm !== 'BESTAND-LOESCHEN') {
    throw HttpError.badRequest('Zum Zurücksetzen confirm="BESTAND-LOESCHEN" mitsenden');
  }

  const removed = transaction((handle) => ({
    stock_items: handle.prepare('DELETE FROM stock_items').run().changes,
    movements: handle.prepare('DELETE FROM movements').run().changes,
    shopping_items: handle.prepare('DELETE FROM shopping_items').run().changes,
  }));

  res.json({ removed });
});

/**
 * Tägliche Sicherung auf die Festplatte. Auf einem Raspberry Pi ohne Monitor
 * merkt sonst niemand, dass es nie eine Sicherung gab.
 */
export function scheduleBackups({ intervalHours = 24, keep = 14 } = {}) {
  const writeSnapshot = () => {
    try {
      mkdirSync(config.backupDir, { recursive: true });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      writeFileSync(
        join(config.backupDir, `warensystem-${stamp}.json`),
        JSON.stringify(exportSnapshot()),
        'utf8',
      );

      const files = readdirSync(config.backupDir)
        .filter((name) => name.startsWith('warensystem-') && name.endsWith('.json'))
        .sort();

      for (const stale of files.slice(0, Math.max(files.length - keep, 0))) {
        rmSync(join(config.backupDir, stale), { force: true });
      }
    } catch (error) {
      console.warn(`[backup] Sicherung fehlgeschlagen: ${error.message}`);
    }
  };

  writeSnapshot();
  const timer = setInterval(writeSnapshot, intervalHours * 60 * 60 * 1000);
  timer.unref();
  return timer;
}
