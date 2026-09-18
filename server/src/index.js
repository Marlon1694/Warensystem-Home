import express from 'express';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { existsSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { config } from './config.js';
import { closeDatabase, db } from './db/index.js';
import { seedDefaults } from './db/seed.js';
import { errorHandler } from './lib/http.js';
import { locationsRouter } from './routes/locations.js';
import { categoriesRouter } from './routes/categories.js';
import { productsRouter } from './routes/products.js';
import { stockRouter } from './routes/stock.js';
import { shoppingRouter } from './routes/shopping.js';
import { statsRouter } from './routes/stats.js';
import { barcodeRouter } from './routes/barcode.js';
import { settingsRouter } from './routes/settings.js';
import { backupRouter, scheduleBackups } from './routes/backup.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.use('/api/locations', locationsRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/stock', stockRouter);
  app.use('/api/shopping', shoppingRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/barcode', barcodeRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/backup', backupRouter);

  app.use('/api', (req, res) => {
    res.status(404).json({ error: `Unbekannter Endpunkt: ${req.method} /api${req.url}` });
  });

  serveWebApp(app);
  app.use(errorHandler);

  return app;
}

/** Liefert die gebaute PWA aus, damit Server und Oberfläche ein Dienst sind. */
function serveWebApp(app) {
  if (!existsSync(config.webDir)) {
    console.warn(
      `[web] Kein Frontend-Build unter ${config.webDir}. ` +
      'Mit "npm run build" erzeugen oder im Entwicklungsmodus "npm run dev:web" nutzen.',
    );
    return;
  }

  // Assets tragen einen Hash im Namen und dürfen lange im Cache bleiben,
  // index.html und der Service Worker niemals.
  app.use(express.static(config.webDir, {
    index: false,
    setHeaders: (res, path) => {
      const immutable = path.includes(`${'assets'}/`) && !path.endsWith('.html');
      res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  }));

  // Alle übrigen GET-Anfragen beantwortet die Single-Page-App selbst.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.setHeader('Cache-Control', 'no-cache');
    return res.sendFile(join(config.webDir, 'index.html'));
  });
}

/**
 * HTTPS wird verwendet, sobald ein Zertifikat vorliegt. iOS Safari gibt die
 * Kamera – und damit den Barcode-Scanner – nur in einem sicheren Kontext frei;
 * über http:// funktioniert im Heimnetz alles außer dem Scannen.
 */
function createServerInstance(app) {
  const { mode, keyFile, certFile } = config.tls;
  const available = existsSync(keyFile) && existsSync(certFile);

  if (mode === 'off' || (mode === 'auto' && !available)) {
    if (mode === 'auto') {
      console.warn(
        '[tls] Kein Zertifikat gefunden – Start über HTTP. Der Barcode-Scanner ' +
        'bleibt auf iPhone und iPad gesperrt. Zertifikat erzeugen: npm run cert',
      );
    }
    return { server: createHttpServer(app), protocol: 'http' };
  }

  if (!available) {
    throw new Error(`TLS_MODE=on, aber ${keyFile} oder ${certFile} fehlt. Erzeugen mit: npm run cert`);
  }

  return {
    server: createHttpsServer({ key: readFileSync(keyFile), cert: readFileSync(certFile) }, app),
    protocol: 'https',
  };
}

/** IPv4-Adressen im Heimnetz, damit die Adresse nicht gesucht werden muss. */
function localAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface.address);
}

function start() {
  db();
  seedDefaults();
  scheduleBackups();

  const app = createApp();
  const { server, protocol } = createServerInstance(app);

  server.listen(config.port, config.host, () => {
    console.log('\nWarensystem Home läuft.');
    console.log(`  Auf diesem Gerät:  ${protocol}://localhost:${config.port}`);
    for (const address of localAddresses()) {
      console.log(`  Im Heimnetz:       ${protocol}://${address}:${config.port}`);
    }
    console.log(`  Datenbank:         ${config.databaseFile}`);
    console.log(`  Sicherungen:       ${config.backupDir}\n`);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      console.log(`\n[server] ${signal} empfangen – fahre herunter.`);
      server.close(() => {
        closeDatabase();
        process.exit(0);
      });
    });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) start();
