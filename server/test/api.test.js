import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Muss vor dem Laden der Konfiguration gesetzt sein: jeder Lauf bekommt eine
// eigene Datenbank, damit Tests sich nicht gegenseitig beeinflussen.
const workDir = mkdtempSync(join(tmpdir(), 'warensystem-test-'));
process.env.DATABASE_FILE = join(workDir, 'test.db');
process.env.BACKUP_DIR = join(workDir, 'backups');
process.env.OFF_ENABLED = 'false';
process.env.TLS_MODE = 'off';

const { createApp } = await import('../src/index.js');
const { seedDefaults } = await import('../src/db/seed.js');
const { closeDatabase, db } = await import('../src/db/index.js');

let baseUrl;
let server;

async function api(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  return { status: response.status, body: payload };
}

before(async () => {
  db();
  seedDefaults();
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  closeDatabase();
  rmSync(workDir, { recursive: true, force: true });
});

describe('Stammdaten', () => {
  it('legt die typischen Lagerorte eines Haushalts an', async () => {
    const { status, body } = await api('GET', '/api/locations');
    assert.equal(status, 200);

    const names = body.map((row) => row.name);
    assert.ok(names.includes('Kühlschrank'));
    assert.ok(names.includes('Gefrierfach'));
    assert.ok(names.includes('Keller'));
    assert.ok(names.includes('Küche'));
  });

  it('weist unbekannte Einheiten ab', async () => {
    const { status } = await api('POST', '/api/products', { name: 'Test', unit: 'Eimer' });
    assert.equal(status, 400);
  });

  it('normalisiert Barcodes und verhindert Dubletten', async () => {
    const first = await api('POST', '/api/products', { name: 'Kakao', barcode: '4000 417-025005' });
    assert.equal(first.status, 201);
    assert.equal(first.body.barcode, '4000417025005');

    const duplicate = await api('POST', '/api/products', { name: 'Kakao 2', barcode: '4000417025005' });
    assert.equal(duplicate.status, 409);
  });
});

describe('Bestandsführung', () => {
  let fridgeId;
  let freezerId;
  let milk;

  before(async () => {
    const locations = (await api('GET', '/api/locations')).body;
    fridgeId = locations.find((row) => row.kind === 'fridge').id;
    freezerId = locations.find((row) => row.kind === 'freezer').id;

    milk = (await api('POST', '/api/products', {
      name: 'Vollmilch',
      unit: 'l',
      min_stock: 2,
      default_location_id: fridgeId,
    })).body;
  });

  it('bucht einen Wareneingang in den Kühlschrank', async () => {
    const { status, body } = await api('POST', '/api/stock/purchase', {
      product_id: milk.id,
      quantity: 3,
      best_before: '2099-01-01',
      price: 4.5,
    });

    assert.equal(status, 201);
    assert.equal(body.product.total_quantity, 3);
    assert.equal(body.batch.location_id, fridgeId);
  });

  it('fasst einen zweiten Eingang mit gleichem MHD zu einem Posten zusammen', async () => {
    await api('POST', '/api/stock/purchase', { product_id: milk.id, quantity: 2, best_before: '2099-01-01' });

    const detail = (await api('GET', `/api/products/${milk.id}`)).body;
    assert.equal(detail.total_quantity, 5);
    assert.equal(detail.batches.length, 1);
  });

  it('bucht Verbrauch ab und verweigert mehr als vorhanden', async () => {
    const consumed = await api('POST', '/api/stock/consume', { product_id: milk.id, quantity: 1.5 });
    assert.equal(consumed.status, 200);
    assert.equal(consumed.body.product.total_quantity, 3.5);

    const tooMuch = await api('POST', '/api/stock/consume', { product_id: milk.id, quantity: 99 });
    assert.equal(tooMuch.status, 409);
  });

  it('verbraucht nach FEFO zuerst den Posten mit dem frühesten MHD', async () => {
    const soon = (await api('POST', '/api/stock/purchase', {
      product_id: milk.id,
      quantity: 1,
      best_before: '2030-01-01',
    })).body.batch;

    await api('POST', '/api/stock/consume', { product_id: milk.id, quantity: 1 });

    const detail = (await api('GET', `/api/products/${milk.id}`)).body;
    assert.equal(detail.batches.some((batch) => batch.id === soon.id), false);
    assert.equal(detail.total_quantity, 3.5);
  });

  it('lagert zwischen zwei Orten um', async () => {
    const batch = (await api('GET', `/api/products/${milk.id}`)).body.batches[0];

    const moved = await api('POST', '/api/stock/move', {
      stock_item_id: batch.id,
      to_location_id: freezerId,
      quantity: 1,
    });

    assert.equal(moved.status, 200);
    assert.equal(moved.body.batch.location_id, freezerId);
    assert.equal(moved.body.product.total_quantity, 3.5);

    const inFreezer = (await api('GET', `/api/stock/batches?location=${freezerId}`)).body;
    assert.equal(inFreezer.length, 1);
  });
});

describe('Einkaufsliste', () => {
  it('setzt Artikel bei Unterschreitung des Mindestbestands automatisch auf die Liste', async () => {
    const butter = (await api('POST', '/api/products', {
      name: 'Butter',
      unit: 'Stk',
      min_stock: 3,
      default_location_id: (await api('GET', '/api/locations')).body[0].id,
    })).body;

    const list = (await api('GET', '/api/shopping')).body;
    const entry = list.find((row) => row.product_id === butter.id);

    assert.ok(entry, 'Butter fehlt auf der Einkaufsliste');
    assert.equal(entry.source, 'auto');
    assert.equal(entry.quantity, 3);
  });

  it('nimmt den Artikel wieder von der Liste, sobald genug da ist', async () => {
    const butter = (await api('GET', '/api/products?search=Butter')).body[0];
    await api('POST', '/api/stock/purchase', { product_id: butter.id, quantity: 4 });

    const list = (await api('GET', '/api/shopping')).body;
    assert.equal(list.some((row) => row.product_id === butter.id), false);
  });

  it('bucht einen erledigten Einkauf direkt in den Bestand', async () => {
    const item = (await api('POST', '/api/shopping', { name: 'Eier', quantity: 10 })).body;
    const purchased = await api('POST', `/api/shopping/${item.id}/purchase`, {});

    assert.equal(purchased.status, 200);
    assert.equal(purchased.body.item.done, true);
  });
});

describe('Haltbarkeit und Auswertung', () => {
  it('meldet abgelaufene Ware', async () => {
    const joghurt = (await api('POST', '/api/products', { name: 'Joghurt', unit: 'Stk' })).body;
    const fridge = (await api('GET', '/api/locations')).body.find((row) => row.kind === 'fridge');

    await api('POST', '/api/stock/purchase', {
      product_id: joghurt.id,
      location_id: fridge.id,
      quantity: 2,
      best_before: '2020-01-01',
    });

    const expiring = (await api('GET', '/api/stock/expiring?days=5')).body;
    const entry = expiring.find((row) => row.product_id === joghurt.id);

    assert.ok(entry, 'Abgelaufener Joghurt fehlt in der Warnliste');
    assert.ok(entry.days_left < 0);

    const overview = (await api('GET', '/api/stats/overview')).body;
    assert.ok(overview.expired >= 1);
  });

  it('zählt Abfall getrennt vom Verbrauch', async () => {
    const joghurt = (await api('GET', '/api/products?search=Joghurt')).body[0];
    await api('POST', '/api/stock/consume', { product_id: joghurt.id, quantity: 1, type: 'waste' });

    const waste = (await api('GET', '/api/stats/waste?days=30')).body;
    assert.ok(waste.waste_bookings >= 1);
    assert.ok(waste.waste_ratio > 0);

    const top = (await api('GET', '/api/stats/top?type=waste&days=30')).body;
    assert.equal(top.items[0].name, 'Joghurt');
  });

  it('liefert eine lückenlose Tagesreihe für den Verlauf', async () => {
    const activity = (await api('GET', '/api/stats/activity?days=7')).body;
    assert.equal(activity.series.length, 7);
    assert.ok(activity.series.at(-1).purchase >= 0);
  });
});

describe('Sicherung', () => {
  it('exportiert und spielt den Bestand vollständig wieder ein', async () => {
    const before = (await api('GET', '/api/products')).body;
    const snapshot = (await api('GET', '/api/backup/export')).body;

    assert.equal(snapshot.format, 'warensystem-home');
    assert.ok(snapshot.data.products.length > 0);

    await api('POST', '/api/backup/reset-stock', { confirm: 'BESTAND-LOESCHEN' });
    assert.equal((await api('GET', '/api/stock/batches')).body.length, 0);

    const restored = await api('POST', '/api/backup/import', snapshot);
    assert.equal(restored.status, 200);

    const after = (await api('GET', '/api/products')).body;
    assert.equal(after.length, before.length);
    assert.deepEqual(
      after.map((row) => row.total_quantity),
      before.map((row) => row.total_quantity),
    );
  });
});
