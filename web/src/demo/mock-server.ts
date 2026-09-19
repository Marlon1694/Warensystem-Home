/**
 * Ersetzt in der Browser-Demo den Server im Heimnetz: fängt alle Aufrufe an
 * /api ab und beantwortet sie aus einem Speicher im Arbeitsspeicher. Die
 * Oberfläche selbst bleibt unverändert – sie merkt keinen Unterschied.
 *
 * Die Fachregeln sind dieselben wie im Server: Wareneingänge mit gleichem MHD
 * werden zusammengefasst, Verbrauch geht nach FEFO ab, und der Mindestbestand
 * pflegt die Einkaufsliste. Eine Demo, die sich anders verhält als das echte
 * System, wäre irreführend.
 *
 * Die Daten leben nur in dieser Sitzung: ein Neuladen setzt alles zurück.
 */
import { CATEGORIES, LOCATIONS, PRODUCTS, SHOPPING_EXTRA, isoInDays } from './seed';
import { DEFAULT_LAYOUT, TILE_KEYS, WIDGET_TYPES } from '../lib/dashboard';

type Row = Record<string, any>;

const UNITS = ['Stk', 'Pck', 'g', 'kg', 'ml', 'l', 'Dose', 'Flasche', 'Glas', 'Portion'];
const LOCATION_KINDS = ['fridge', 'freezer', 'pantry', 'cellar', 'kitchen', 'other'];
const MOVEMENT_TYPES = ['purchase', 'consume', 'waste', 'move', 'correction'];

const store = {
  locations: [] as Row[],
  categories: [] as Row[],
  products: [] as Row[],
  stock: [] as Row[],
  movements: [] as Row[],
  shopping: [] as Row[],
  settings: {
    household_name: 'Zuhause',
    expiry_warn_days: '5',
    currency: 'EUR',
    dashboard_layout: JSON.stringify(DEFAULT_LAYOUT),
  } as Record<string, string>,
  revision: 0,
};

const nextId = (rows: Row[]) => rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
const round3 = (value: number) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

function stamp(offsetDays = 0, hour = 12): string {
  const date = new Date();
  date.setDate(date.getDate() - offsetDays);
  date.setHours(hour, 15, 0, 0);
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/* ------------------------------------------------------------------------ */
/* Aufbau der Beispieldaten                                                  */
/* ------------------------------------------------------------------------ */

function build() {
  store.locations = LOCATIONS.map((row) => ({ ...row }));
  store.categories = CATEGORIES.map((row) => ({ ...row }));

  for (const seed of PRODUCTS) {
    const product: Row = {
      id: store.products.length + 1,
      name: seed.name,
      brand: seed.brand ?? null,
      barcode: seed.barcode ?? null,
      category_id: seed.category,
      default_location_id: seed.location,
      unit: seed.unit,
      min_stock: seed.minStock ?? 0,
      package_size: seed.packageSize ?? null,
      default_shelf_life_days: seed.shelfLife ?? null,
      image_url: null,
      note: null,
      archived: 0,
    };
    store.products.push(product);

    for (const batch of seed.batches) {
      const item: Row = {
        id: store.stock.length + 1,
        product_id: product.id,
        location_id: batch.location,
        quantity: batch.quantity,
        unit: seed.unit,
        best_before: batch.bestBefore,
        opened: batch.opened ? 1 : 0,
        price: batch.price ?? null,
        note: null,
        created_at: stamp(20),
      };
      store.stock.push(item);

      store.movements.push({
        id: store.movements.length + 1,
        product_id: product.id,
        stock_item_id: item.id,
        location_id: batch.location,
        to_location_id: null,
        type: 'purchase',
        quantity: batch.quantity,
        unit: seed.unit,
        price: batch.price ?? null,
        note: null,
        created_at: stamp(20),
      });
    }
  }

  buildHistory();

  for (const extra of SHOPPING_EXTRA) {
    store.shopping.push({
      id: store.shopping.length + 1,
      product_id: null,
      name: extra.name,
      quantity: extra.quantity,
      unit: extra.unit,
      note: null,
      done: 0,
      source: 'manual',
    });
  }

  syncAllAutoShoppingItems();
}

/** Verbrauchsverlauf der letzten vier Wochen, damit die Auswertung trägt. */
function buildHistory() {
  for (let day = 27; day >= 0; day -= 1) {
    const count = Math.max(0, Math.round(2.4 + Math.sin(day / 3) * 1.8 + (day % 7 === 0 ? 1.6 : 0)));

    for (let index = 0; index < count; index += 1) {
      const product = store.products[(day * 7 + index * 3) % store.products.length];
      if (!product) continue;

      const waste = (day * 5 + index) % 12 === 0;
      store.movements.push({
        id: store.movements.length + 1,
        product_id: product.id,
        stock_item_id: null,
        location_id: product.default_location_id,
        to_location_id: null,
        type: waste ? 'waste' : 'consume',
        quantity: -1,
        unit: product.unit,
        price: waste ? 1.35 : 1.05,
        note: null,
        created_at: stamp(day, 11 + (index % 8)),
      });
    }
  }
}

/* ------------------------------------------------------------------------ */
/* Ableitungen                                                               */
/* ------------------------------------------------------------------------ */

const locationOf = (id: number | null) => store.locations.find((row) => row.id === id) ?? null;
const categoryOf = (id: number | null) => store.categories.find((row) => row.id === id) ?? null;
const productOf = (id: number) => store.products.find((row) => row.id === id) ?? null;

function batchesOf(productId: number) {
  return store.stock.filter((row) => row.product_id === productId && row.quantity > 0);
}

/** Verbrauchsreihenfolge: Angebrochenes zuerst, danach das älteste MHD. */
function fefo(rows: Row[]) {
  return [...rows].sort((a, b) => {
    if (a.opened !== b.opened) return b.opened - a.opened;
    if (!a.best_before && b.best_before) return 1;
    if (a.best_before && !b.best_before) return -1;
    if (a.best_before && b.best_before && a.best_before !== b.best_before) {
      return a.best_before < b.best_before ? -1 : 1;
    }
    return a.id - b.id;
  });
}

function decorate(product: Row): Row {
  const batches = batchesOf(product.id);
  const total = round3(batches.reduce((sum, row) => sum + row.quantity, 0));
  const dates = batches.map((row) => row.best_before).filter(Boolean).sort();
  const category = categoryOf(product.category_id);

  return {
    ...product,
    archived: product.archived === 1,
    category_name: category?.name ?? null,
    category_color: category?.color ?? null,
    default_location_name: locationOf(product.default_location_id)?.name ?? null,
    total_quantity: total,
    batch_count: batches.length,
    next_best_before: dates[0] ?? null,
    below_min_stock: product.min_stock > 0 && total < product.min_stock,
  };
}

function decorateBatch(batch: Row): Row {
  const location = locationOf(batch.location_id);
  return {
    ...batch,
    opened: batch.opened === 1,
    location_name: location?.name ?? 'Unbekannt',
    location_kind: location?.kind ?? 'other',
  };
}

function daysUntil(date: string) {
  const target = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function warnDays() {
  return Number(store.settings.expiry_warn_days) || 5;
}

/* ------------------------------------------------------------------------ */
/* Buchungen                                                                 */
/* ------------------------------------------------------------------------ */

function recordMovement(entry: Row) {
  store.movements.push({
    id: store.movements.length + 1,
    stock_item_id: null,
    to_location_id: null,
    price: null,
    note: null,
    created_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    ...entry,
  });
}

function bookPurchase(product: Row, input: Row) {
  const locationId = input.location_id ?? product.default_location_id;
  if (!locationId) throw new ApiFailure(400, 'Kein Lagerort angegeben und kein Standardlagerort hinterlegt');

  const quantity = round3(Number(input.quantity));
  const bestBefore = input.best_before ?? defaultBestBefore(product);

  const existing = store.stock.find((row) =>
    row.product_id === product.id &&
    row.location_id === locationId &&
    row.opened === 0 &&
    (row.best_before ?? null) === (bestBefore ?? null));

  let batch: Row;
  if (existing && !input.opened) {
    existing.quantity = round3(existing.quantity + quantity);
    existing.price = existing.price === null && input.price == null
      ? null
      : round3((existing.price ?? 0) + (input.price ?? 0));
    batch = existing;
  } else {
    batch = {
      id: nextId(store.stock),
      product_id: product.id,
      location_id: locationId,
      quantity,
      unit: product.unit,
      best_before: bestBefore ?? null,
      opened: input.opened ? 1 : 0,
      price: input.price ?? null,
      note: input.note ?? null,
      created_at: new Date().toISOString(),
    };
    store.stock.push(batch);
  }

  recordMovement({
    product_id: product.id,
    stock_item_id: batch.id,
    location_id: locationId,
    type: 'purchase',
    quantity,
    unit: product.unit,
    price: input.price ?? null,
    note: input.note ?? null,
  });

  syncAutoShoppingItem(product.id);
  return batch;
}

function defaultBestBefore(product: Row) {
  return product.default_shelf_life_days ? isoInDays(product.default_shelf_life_days) : null;
}

function bookConsumption(product: Row, input: Row) {
  const type = input.type === 'waste' ? 'waste' : 'consume';
  const quantity = round3(Number(input.quantity));

  let candidates = batchesOf(product.id);
  if (input.stock_item_id) candidates = candidates.filter((row) => row.id === input.stock_item_id);
  else if (input.location_id) candidates = candidates.filter((row) => row.location_id === input.location_id);

  const available = round3(candidates.reduce((sum, row) => sum + row.quantity, 0));
  if (available < quantity) {
    throw new ApiFailure(
      409,
      `Nicht genug Bestand: verfügbar ${available} ${product.unit}, gebucht werden sollen ${quantity} ${product.unit}`,
    );
  }

  let remaining = quantity;
  for (const batch of fefo(candidates)) {
    if (remaining <= 0) break;

    const take = Math.min(batch.quantity, remaining);
    remaining = round3(remaining - take);
    const share = batch.price ? round3((batch.price / batch.quantity) * take) : null;
    batch.quantity = round3(batch.quantity - take);

    recordMovement({
      product_id: product.id,
      stock_item_id: batch.id,
      location_id: batch.location_id,
      type,
      quantity: -take,
      unit: product.unit,
      price: share,
      note: input.note ?? null,
    });

    if (batch.quantity <= 0) store.stock = store.stock.filter((row) => row.id !== batch.id);
  }

  syncAutoShoppingItem(product.id);
  return { booked: quantity };
}

function bookMove(batch: Row, toLocationId: number, quantity: number) {
  if (batch.location_id === toLocationId) throw new ApiFailure(400, 'Quell- und Ziellagerort sind identisch');
  if (quantity > batch.quantity) throw new ApiFailure(409, `Der Posten enthält nur ${batch.quantity}`);

  const share = batch.price ? round3((batch.price / batch.quantity) * quantity) : null;
  batch.quantity = round3(batch.quantity - quantity);

  const target = store.stock.find((row) =>
    row.product_id === batch.product_id &&
    row.location_id === toLocationId &&
    row.opened === batch.opened &&
    (row.best_before ?? null) === (batch.best_before ?? null));

  let moved: Row;
  if (target) {
    target.quantity = round3(target.quantity + quantity);
    moved = target;
  } else {
    moved = { ...batch, id: nextId(store.stock), location_id: toLocationId, quantity, price: share };
    store.stock.push(moved);
  }

  if (batch.quantity <= 0) store.stock = store.stock.filter((row) => row.id !== batch.id);

  recordMovement({
    product_id: batch.product_id,
    stock_item_id: moved.id,
    location_id: batch.location_id,
    to_location_id: toLocationId,
    type: 'move',
    quantity,
    unit: batch.unit,
  });

  return moved;
}

function syncAutoShoppingItem(productId: number) {
  const product = productOf(productId);
  if (!product) return;

  const view = decorate(product);
  const existing = store.shopping.find((row) => row.product_id === productId && row.source === 'auto');

  if (!view.below_min_stock || view.archived) {
    if (existing && existing.done === 0) {
      store.shopping = store.shopping.filter((row) => row.id !== existing.id);
    }
    return;
  }

  const missing = round3(view.min_stock - view.total_quantity);
  const packages = product.package_size ? Math.ceil(missing / product.package_size) : null;
  const quantity = packages ? round3(packages * product.package_size) : Math.max(missing, 0.001);

  if (existing) {
    existing.quantity = quantity;
    existing.unit = product.unit;
    existing.name = product.name;
  } else {
    store.shopping.push({
      id: nextId(store.shopping),
      product_id: product.id,
      name: product.name,
      quantity,
      unit: product.unit,
      note: null,
      done: 0,
      source: 'auto',
    });
  }
}

function syncAllAutoShoppingItems() {
  for (const product of store.products) {
    if (product.archived === 0) syncAutoShoppingItem(product.id);
  }
}

/* ------------------------------------------------------------------------ */
/* Auswertung                                                                */
/* ------------------------------------------------------------------------ */

function startDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - (days - 1));
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function movementsSince(from: string) {
  return store.movements.filter((row) => row.created_at.slice(0, 10) >= from);
}

function overview() {
  const batches = store.stock.filter((row) => row.quantity > 0);
  const limit = isoInDays(warnDays());
  const today = isoInDays(0);

  return {
    products_total: store.products.filter((row) => row.archived === 0).length,
    products_in_stock: new Set(batches.map((row) => row.product_id)).size,
    batches: batches.length,
    stock_value: round3(batches.reduce((sum, row) => sum + (row.price ?? 0), 0)),
    expired: batches.filter((row) => row.best_before && row.best_before < today).length,
    expiring_soon: batches.filter((row) => row.best_before && row.best_before >= today && row.best_before <= limit).length,
    below_min_stock: store.products.filter((row) => decorate(row).below_min_stock).length,
    shopping_open: store.shopping.filter((row) => row.done === 0).length,
    warn_days: warnDays(),
    by_location: store.locations.map((location) => {
      const own = batches.filter((row) => row.location_id === location.id);
      return {
        id: location.id,
        name: location.name,
        kind: location.kind,
        products: new Set(own.map((row) => row.product_id)).size,
        batches: own.length,
        value: round3(own.reduce((sum, row) => sum + (row.price ?? 0), 0)),
      };
    }),
  };
}

function activity(days: number) {
  const from = startDate(days);
  const buckets = new Map<string, Row>();

  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(`${from}T00:00:00`);
    date.setDate(date.getDate() + offset);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    const day = date.toISOString().slice(0, 10);
    buckets.set(day, { day, consume: 0, waste: 0, purchase: 0, consume_value: 0, waste_value: 0 });
  }

  for (const movement of movementsSince(from)) {
    const bucket = buckets.get(movement.created_at.slice(0, 10));
    if (!bucket) continue;

    if (movement.type === 'consume') {
      bucket.consume += 1;
      bucket.consume_value = round3(bucket.consume_value + Math.abs(movement.price ?? 0));
    } else if (movement.type === 'waste') {
      bucket.waste += 1;
      bucket.waste_value = round3(bucket.waste_value + Math.abs(movement.price ?? 0));
    } else if (movement.type === 'purchase') {
      bucket.purchase += 1;
    }
  }

  return { days, from, series: [...buckets.values()] };
}

function topItems(type: string, days: number, limit: number) {
  const grouped = new Map<number, Row>();

  for (const movement of movementsSince(startDate(days))) {
    if (movement.type !== type) continue;
    const product = productOf(movement.product_id);
    if (!product) continue;

    const category = categoryOf(product.category_id);
    const entry = grouped.get(product.id) ?? {
      id: product.id,
      name: product.name,
      brand: product.brand,
      unit: product.unit,
      category_name: category?.name ?? null,
      category_color: category?.color ?? null,
      bookings: 0,
      quantity: 0,
      value: 0,
    };

    entry.bookings += 1;
    entry.quantity = round3(entry.quantity + Math.abs(movement.quantity));
    entry.value = round3(entry.value + Math.abs(movement.price ?? 0));
    grouped.set(product.id, entry);
  }

  const items = [...grouped.values()]
    .sort((a, b) => b.bookings - a.bookings || b.quantity - a.quantity)
    .slice(0, limit);

  return { days, type, items };
}

function wasteReport(days: number) {
  const from = startDate(days);
  const relevant = movementsSince(from).filter((row) => row.type === 'consume' || row.type === 'waste');

  const consume = relevant.filter((row) => row.type === 'consume');
  const waste = relevant.filter((row) => row.type === 'waste');
  const handled = consume.length + waste.length;

  const byCategory = new Map<string, Row>();
  for (const movement of waste) {
    const product = productOf(movement.product_id);
    const category = categoryOf(product?.category_id ?? null);
    const key = category?.name ?? 'Ohne Kategorie';

    const entry = byCategory.get(key) ?? {
      category_name: key,
      category_color: category?.color ?? '#6b7280',
      bookings: 0,
      value: 0,
    };
    entry.bookings += 1;
    entry.value = round3(entry.value + Math.abs(movement.price ?? 0));
    byCategory.set(key, entry);
  }

  return {
    days,
    from,
    consume_bookings: consume.length,
    waste_bookings: waste.length,
    consume_value: round3(consume.reduce((sum, row) => sum + Math.abs(row.price ?? 0), 0)),
    waste_value: round3(waste.reduce((sum, row) => sum + Math.abs(row.price ?? 0), 0)),
    waste_ratio: handled === 0 ? 0 : round3(waste.length / handled),
    by_category: [...byCategory.values()].sort((a, b) => b.bookings - a.bookings),
  };
}

/* ------------------------------------------------------------------------ */
/* Weiterleitung der Aufrufe                                                 */
/* ------------------------------------------------------------------------ */

class ApiFailure extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Handler = (parts: string[], body: Row, query: URLSearchParams) => unknown;

const routes: Array<[string, RegExp, Handler]> = [
  ['GET', /^\/locations$/, () => store.locations.map((location) => {
    const own = store.stock.filter((row) => row.location_id === location.id && row.quantity > 0);
    return {
      ...location,
      article_count: new Set(own.map((row) => row.product_id)).size,
      batch_count: own.length,
    };
  })],

  ['POST', /^\/locations$/, (_p, body) => {
    const created = {
      id: nextId(store.locations),
      name: String(body.name ?? '').trim() || 'Neuer Ort',
      kind: LOCATION_KINDS.includes(String(body.kind)) ? body.kind : 'pantry',
      note: body.note ?? null,
      sort_order: store.locations.length * 10 + 10,
    };
    store.locations.push(created);
    return created;
  }],

  ['PATCH', /^\/locations\/(\d+)$/, (parts, body) => {
    const location = locationOf(Number(parts[0]));
    if (!location) throw new ApiFailure(404, 'Lagerort nicht gefunden');
    Object.assign(location, {
      name: body.name !== undefined ? String(body.name).trim() : location.name,
      kind: body.kind !== undefined ? body.kind : location.kind,
      note: body.note !== undefined ? body.note : location.note,
    });
    return location;
  }],

  ['DELETE', /^\/locations\/(\d+)$/, (parts, _body, query) => {
    const id = Number(parts[0]);
    const used = store.stock.filter((row) => row.location_id === id && row.quantity > 0).length;
    if (used > 0 && query.get('force') !== '1') {
      throw new ApiFailure(409, `Am Lagerort liegen noch ${used} Bestandsposten.`);
    }
    store.stock = store.stock.filter((row) => row.location_id !== id);
    store.locations = store.locations.filter((row) => row.id !== id);
    return null;
  }],

  ['PUT', /^\/(locations|categories)\/order$/, (parts, body) => {
    const table = parts[0] === 'locations' ? 'locations' : 'categories';
    const rows = table === 'locations' ? store.locations : store.categories;

    const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number) : [];
    if (ids.length === 0) throw new ApiFailure(400, 'ids muss eine nicht leere Liste von IDs sein');
    if (new Set(ids).size !== ids.length) throw new ApiFailure(400, 'Doppelte IDs in der Reihenfolge');

    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered = ids.map((id) => {
      const row = byId.get(id);
      if (!row) throw new ApiFailure(400, `Unbekannte ID: ${id}`);
      return row;
    });

    ordered.forEach((row, index) => { row.sort_order = (index + 1) * 10; });
    const rest = rows.filter((row) => !ids.includes(row.id));

    if (table === 'locations') store.locations = [...ordered, ...rest];
    else store.categories = [...ordered, ...rest];

    return { ordered: ids.length };
  }],

  ['GET', /^\/categories$/, () => store.categories.map((category) => ({
    ...category,
    article_count: store.products.filter((row) => row.category_id === category.id && row.archived === 0).length,
  }))],

  ['POST', /^\/categories$/, (_p, body) => {
    const created = {
      id: nextId(store.categories),
      name: String(body.name ?? '').trim() || 'Neue Gruppe',
      color: body.color ?? '#6b7280',
      sort_order: store.categories.length * 10 + 10,
    };
    store.categories.push(created);
    return created;
  }],

  ['PATCH', /^\/categories\/(\d+)$/, (parts, body) => {
    const category = categoryOf(Number(parts[0]));
    if (!category) throw new ApiFailure(404, 'Kategorie nicht gefunden');
    Object.assign(category, {
      name: body.name !== undefined ? String(body.name).trim() : category.name,
      color: body.color !== undefined ? body.color : category.color,
    });
    return category;
  }],

  ['DELETE', /^\/categories\/(\d+)$/, (parts) => {
    const id = Number(parts[0]);
    for (const product of store.products) {
      if (product.category_id === id) product.category_id = null;
    }
    store.categories = store.categories.filter((row) => row.id !== id);
    return null;
  }],

  ['GET', /^\/products$/, (_p, _body, query) => {
    const search = (query.get('search') ?? '').toLowerCase();
    const location = query.get('location') ? Number(query.get('location')) : null;
    const category = query.get('category') ? Number(query.get('category')) : null;

    return store.products
      .filter((product) => query.get('archived') === '1' || product.archived === 0)
      .filter((product) => !category || product.category_id === category)
      .filter((product) => !search
        || product.name.toLowerCase().includes(search)
        || (product.brand ?? '').toLowerCase().includes(search)
        || product.barcode === query.get('search'))
      .filter((product) => !location
        || batchesOf(product.id).some((row) => row.location_id === location))
      .map(decorate)
      .filter((product) => query.get('inStock') !== '1' || product.total_quantity > 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }],

  ['GET', /^\/products\/by-barcode\/(\d+)$/, (parts) => {
    const product = store.products.find((row) => row.barcode === parts[0]);
    return product ? decorate(product) : null;
  }],

  ['GET', /^\/products\/(\d+)$/, (parts) => {
    const product = productOf(Number(parts[0]));
    if (!product) throw new ApiFailure(404, 'Artikel nicht gefunden');

    return {
      ...decorate(product),
      batches: fefo(batchesOf(product.id)).map(decorateBatch),
      movements: store.movements
        .filter((row) => row.product_id === product.id)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, 50)
        .map((movement) => ({
          ...movement,
          location_name: locationOf(movement.location_id)?.name ?? null,
          to_location_name: locationOf(movement.to_location_id)?.name ?? null,
        })),
    };
  }],

  ['POST', /^\/products$/, (_p, body) => {
    const name = String(body.name ?? '').trim();
    if (!name) throw new ApiFailure(400, 'Pflichtfeld fehlt: name');
    if (body.unit && !UNITS.includes(String(body.unit))) {
      throw new ApiFailure(400, `Unbekannte Einheit. Erlaubt: ${UNITS.join(', ')}`);
    }
    if (body.barcode && store.products.some((row) => row.barcode === body.barcode)) {
      throw new ApiFailure(409, 'Eintrag existiert bereits');
    }

    const created: Row = {
      id: nextId(store.products),
      name,
      brand: body.brand ?? null,
      barcode: body.barcode ?? null,
      category_id: body.category_id ?? null,
      default_location_id: body.default_location_id ?? null,
      unit: body.unit ?? 'Stk',
      min_stock: Number(body.min_stock ?? 0),
      package_size: body.package_size ?? null,
      default_shelf_life_days: body.default_shelf_life_days ?? null,
      image_url: null,
      note: body.note ?? null,
      archived: 0,
    };
    store.products.push(created);
    syncAutoShoppingItem(created.id);
    return decorate(created);
  }],

  ['PATCH', /^\/products\/(\d+)$/, (parts, body) => {
    const product = productOf(Number(parts[0]));
    if (!product) throw new ApiFailure(404, 'Artikel nicht gefunden');

    for (const key of ['name', 'brand', 'barcode', 'category_id', 'default_location_id', 'unit',
      'min_stock', 'package_size', 'default_shelf_life_days', 'note', 'archived'] as const) {
      if (body[key] !== undefined) product[key] = body[key];
    }
    if (body.unit !== undefined) {
      for (const batch of batchesOf(product.id)) batch.unit = body.unit;
    }

    syncAutoShoppingItem(product.id);
    return decorate(product);
  }],

  ['DELETE', /^\/products\/(\d+)$/, (parts) => {
    const id = Number(parts[0]);
    const product = productOf(id);
    if (!product) throw new ApiFailure(404, 'Artikel nicht gefunden');

    if (store.movements.some((row) => row.product_id === id)) {
      product.archived = 1;
      store.stock = store.stock.filter((row) => row.product_id !== id);
      store.shopping = store.shopping.filter((row) => row.product_id !== id);
      return { archived: true, product: decorate(product) };
    }

    store.products = store.products.filter((row) => row.id !== id);
    store.shopping = store.shopping.filter((row) => row.product_id !== id);
    return null;
  }],

  ['GET', /^\/stock\/expiring$/, (_p, _body, query) => {
    const days = query.get('days') === null ? warnDays() : Number(query.get('days'));
    const limit = isoInDays(days);

    return store.stock
      .filter((row) => row.quantity > 0 && row.best_before && row.best_before <= limit)
      .sort((a, b) => (a.best_before < b.best_before ? -1 : 1))
      .map((batch) => {
        const product = productOf(batch.product_id);
        const category = categoryOf(product?.category_id ?? null);
        const location = locationOf(batch.location_id);

        return {
          id: batch.id,
          product_id: batch.product_id,
          location_id: batch.location_id,
          product_name: product?.name ?? '',
          brand: product?.brand ?? null,
          quantity: batch.quantity,
          unit: batch.unit,
          best_before: batch.best_before,
          opened: batch.opened === 1,
          location_name: location?.name ?? '',
          location_kind: location?.kind ?? 'other',
          category_name: category?.name ?? null,
          category_color: category?.color ?? null,
          days_left: daysUntil(batch.best_before),
        };
      });
  }],

  ['GET', /^\/stock\/batches$/, (_p, _body, query) => {
    const location = query.get('location') ? Number(query.get('location')) : null;
    const product = query.get('product') ? Number(query.get('product')) : null;

    return store.stock
      .filter((row) => row.quantity > 0)
      .filter((row) => !location || row.location_id === location)
      .filter((row) => !product || row.product_id === product)
      .map((batch) => ({ ...decorateBatch(batch), product_name: productOf(batch.product_id)?.name ?? '' }));
  }],

  ['POST', /^\/stock\/purchase$/, (_p, body) => {
    const product = productOf(Number(body.product_id));
    if (!product) throw new ApiFailure(404, 'Artikel nicht gefunden');
    const batch = bookPurchase(product, body);
    return { batch: decorateBatch(batch), product: decorate(product) };
  }],

  ['POST', /^\/stock\/consume$/, (_p, body) => {
    const product = productOf(Number(body.product_id));
    if (!product) throw new ApiFailure(404, 'Artikel nicht gefunden');
    const result = bookConsumption(product, body);
    return { ...result, product: decorate(product) };
  }],

  ['POST', /^\/stock\/move$/, (_p, body) => {
    const batch = store.stock.find((row) => row.id === Number(body.stock_item_id));
    if (!batch) throw new ApiFailure(404, 'Bestandsposten nicht gefunden');

    const moved = bookMove(batch, Number(body.to_location_id), Number(body.quantity ?? batch.quantity));
    return { batch: decorateBatch(moved), product: decorate(productOf(batch.product_id) as Row) };
  }],

  ['PATCH', /^\/stock\/batches\/(\d+)$/, (parts, body) => {
    const batch = store.stock.find((row) => row.id === Number(parts[0]));
    if (!batch) throw new ApiFailure(404, 'Bestandsposten nicht gefunden');
    const productId = batch.product_id;

    if (body.quantity !== undefined && round3(Number(body.quantity)) !== round3(batch.quantity)) {
      recordMovement({
        product_id: productId,
        stock_item_id: batch.id,
        location_id: body.location_id ?? batch.location_id,
        type: 'correction',
        quantity: round3(Number(body.quantity) - batch.quantity),
        unit: batch.unit,
        note: body.note ?? 'Bestandskorrektur',
      });
    }

    if (Number(body.quantity) === 0) {
      store.stock = store.stock.filter((row) => row.id !== batch.id);
      syncAutoShoppingItem(productId);
      return { batch: null, product: decorate(productOf(productId) as Row) };
    }

    if (body.quantity !== undefined) batch.quantity = round3(Number(body.quantity));
    if (body.location_id !== undefined) batch.location_id = Number(body.location_id);
    if (body.best_before !== undefined) batch.best_before = body.best_before;
    if (body.opened !== undefined) batch.opened = body.opened ? 1 : 0;

    syncAutoShoppingItem(productId);
    return { batch: decorateBatch(batch), product: decorate(productOf(productId) as Row) };
  }],

  ['DELETE', /^\/stock\/batches\/(\d+)$/, (parts) => {
    const batch = store.stock.find((row) => row.id === Number(parts[0]));
    if (!batch) throw new ApiFailure(404, 'Bestandsposten nicht gefunden');

    recordMovement({
      product_id: batch.product_id,
      stock_item_id: batch.id,
      location_id: batch.location_id,
      type: 'correction',
      quantity: -batch.quantity,
      unit: batch.unit,
      note: 'Posten gelöscht',
    });

    store.stock = store.stock.filter((row) => row.id !== batch.id);
    syncAutoShoppingItem(batch.product_id);
    return null;
  }],

  ['GET', /^\/shopping$/, () => {
    syncAllAutoShoppingItems();

    return store.shopping
      .map((item): Row => {
        const product = item.product_id ? productOf(item.product_id) : null;
        const category = categoryOf(product?.category_id ?? null);
        const view = product ? decorate(product) : null;

        return {
          ...item,
          done: item.done === 1,
          product_name: product?.name ?? null,
          brand: product?.brand ?? null,
          min_stock: product?.min_stock ?? null,
          current_quantity: view?.total_quantity ?? 0,
          category_name: category?.name ?? null,
          category_color: category?.color ?? null,
        };
      })
      .sort((a, b) => Number(a.done) - Number(b.done) || a.name.localeCompare(b.name, 'de'));
  }],

  ['POST', /^\/shopping$/, (_p, body) => {
    if (body.product_id) {
      const existing = store.shopping.find((row) => row.product_id === Number(body.product_id));
      if (existing) {
        existing.quantity = Number(body.quantity ?? existing.quantity);
        existing.source = 'manual';
        existing.done = 0;
        return existing;
      }
    }

    const product = body.product_id ? productOf(Number(body.product_id)) : null;
    const created = {
      id: nextId(store.shopping),
      product_id: product?.id ?? null,
      name: product?.name ?? String(body.name ?? '').trim(),
      quantity: Number(body.quantity ?? 1),
      unit: body.unit ?? product?.unit ?? 'Stk',
      note: body.note ?? null,
      done: 0,
      source: 'manual',
    };
    if (!created.name) throw new ApiFailure(400, 'Pflichtfeld fehlt: name');

    store.shopping.push(created);
    return created;
  }],

  ['PATCH', /^\/shopping\/(\d+)$/, (parts, body) => {
    const item = store.shopping.find((row) => row.id === Number(parts[0]));
    if (!item) throw new ApiFailure(404, 'Eintrag nicht gefunden');

    if (body.name !== undefined) item.name = String(body.name).trim();
    if (body.quantity !== undefined) item.quantity = Number(body.quantity);
    if (body.unit !== undefined) item.unit = body.unit;
    if (body.done !== undefined) item.done = body.done ? 1 : 0;

    return { ...item, done: item.done === 1 };
  }],

  ['POST', /^\/shopping\/(\d+)\/purchase$/, (parts, body) => {
    const item = store.shopping.find((row) => row.id === Number(parts[0]));
    if (!item) throw new ApiFailure(404, 'Eintrag nicht gefunden');

    if (!item.product_id) {
      item.done = 1;
      return { item: { ...item, done: true }, product: null };
    }

    const product = productOf(item.product_id) as Row;
    const batch = bookPurchase(product, {
      quantity: body.quantity ?? item.quantity,
      location_id: body.location_id ?? null,
      best_before: body.best_before ?? null,
      price: body.price ?? null,
    });

    store.shopping = store.shopping.filter((row) => row.id !== item.id);
    return { batch: decorateBatch(batch), product: decorate(product) };
  }],

  ['DELETE', /^\/shopping\/(\d+)$/, (parts) => {
    store.shopping = store.shopping.filter((row) => row.id !== Number(parts[0]));
    return null;
  }],

  ['POST', /^\/shopping\/clear-done$/, () => {
    const before = store.shopping.length;
    store.shopping = store.shopping.filter((row) => row.done === 0);
    return { removed: before - store.shopping.length };
  }],

  ['GET', /^\/stats\/overview$/, () => overview()],
  ['GET', /^\/stats\/activity$/, (_p, _body, query) => activity(Number(query.get('days') ?? 30))],
  ['GET', /^\/stats\/top$/, (_p, _body, query) => topItems(
    query.get('type') === 'waste' ? 'waste' : 'consume',
    Number(query.get('days') ?? 90),
    Number(query.get('limit') ?? 10),
  )],
  ['GET', /^\/stats\/waste$/, (_p, _body, query) => wasteReport(Number(query.get('days') ?? 90))],

  ['GET', /^\/stats\/recent$/, (_p, _body, query) => {
    const limit = Math.min(Math.max(Number(query.get('limit')) || 5, 1), 50);

    return [...store.movements]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id))
      .slice(0, limit)
      .map((movement) => {
        const product = productOf(movement.product_id);
        const category = categoryOf(product?.category_id ?? null);

        return {
          ...movement,
          product_name: product?.name ?? '',
          category_name: category?.name ?? null,
          category_color: category?.color ?? null,
          location_name: locationOf(movement.location_id)?.name ?? null,
          to_location_name: locationOf(movement.to_location_id)?.name ?? null,
        };
      });
  }],

  ['GET', /^\/barcode\/(\d+)$/, (parts) => {
    const barcode = parts[0] as string;
    const known = store.products.find((row) => row.barcode === barcode);
    if (known) return { source: 'local', barcode, product: decorate(known), suggestion: null };

    // In der Demo gibt es keinen Zugriff auf Open Food Facts – der Vorschlag
    // ist fest hinterlegt, damit der Ablauf trotzdem nachvollziehbar bleibt.
    const samples: Record<string, Row> = {
      '4311501044179': { name: 'Bio-Haferdrink', brand: 'dmBio', package_text: '1 l', image_url: null },
      '4337256128773': { name: 'Passierte Tomaten', brand: 'Cucina', package_text: '500 g', image_url: null },
    };
    const suggestion = samples[barcode] ?? null;
    return { source: suggestion ? 'openfoodfacts' : 'none', barcode, product: null, suggestion };
  }],

  ['GET', /^\/settings$/, () => ({ ...store.settings })],
  ['PUT', /^\/settings$/, (_p, body) => {
    for (const [key, value] of Object.entries(body)) {
      if (key in store.settings) store.settings[key] = String(value);
    }
    return { ...store.settings };
  }],
  ['GET', /^\/settings\/meta$/, () => ({
    units: UNITS,
    location_kinds: LOCATION_KINDS,
    movement_types: MOVEMENT_TYPES,
    dashboard_widgets: WIDGET_TYPES,
    dashboard_tiles: TILE_KEYS,
    default_dashboard: DEFAULT_LAYOUT,
    revision: store.revision,
  })],

  ['GET', /^\/health$/, () => ({ status: 'ok', demo: true })],

  ['POST', /^\/backup\/reset-stock$/, () => {
    store.stock = [];
    store.movements = [];
    store.shopping = [];
    return { removed: { stock_items: 0, movements: 0, shopping_items: 0 } };
  }],
];

function dispatch(method: string, path: string, body: Row, query: URLSearchParams) {
  for (const [routeMethod, pattern, handler] of routes) {
    if (routeMethod !== method) continue;
    const match = pattern.exec(path);
    if (match) return handler(match.slice(1), body, query);
  }
  throw new ApiFailure(404, `Unbekannter Endpunkt: ${method} /api${path}`);
}

/**
 * Hängt sich vor window.fetch. Alles außerhalb von /api geht unverändert
 * weiter – die Demo soll sich nur dort einmischen, wo sonst der Server steht.
 */
export function installDemoServer() {
  build();

  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      window.location.href,
    );

    if (!url.pathname.startsWith('/api')) return original(input as RequestInfo, init);

    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const path = url.pathname.replace(/^\/api/, '');
    const body: Row = init?.body ? JSON.parse(String(init.body)) : {};

    // Kurze Verzögerung, damit Ladezustände sichtbar bleiben wie im Betrieb.
    await new Promise((resolve) => setTimeout(resolve, 90));

    try {
      const result = dispatch(method, path, body, url.searchParams);
      if (result === null && method === 'DELETE') return new Response(null, { status: 204 });

      return new Response(JSON.stringify(result), {
        status: method === 'POST' && /^\/(products|locations|categories|shopping)$/.test(path) ? 201 : 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      const failure = error instanceof ApiFailure ? error : new ApiFailure(500, 'Fehler in der Demo');
      return new Response(JSON.stringify({ error: failure.message }), {
        status: failure.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
}
