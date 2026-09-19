/**
 * Zusammenstellung der Übersicht. Welche Abschnitte in welcher Reihenfolge
 * erscheinen, steht in den Einstellungen des Haushalts – also auf dem Server
 * und damit auf allen Geräten gleich.
 */

export type WidgetType =
  | 'stats'
  | 'expiring'
  | 'locations'
  | 'shopping'
  | 'low_stock'
  | 'recent'
  | 'location_stock'
  | 'note';

export interface Widget {
  id: string;
  type: WidgetType;
  options: Record<string, unknown>;
}

export type TileKey =
  | 'expired'
  | 'expiring_soon'
  | 'below_min_stock'
  | 'products_in_stock'
  | 'shopping_open'
  | 'batches'
  | 'stock_value';

interface TileInfo {
  label: string;
  tone: 'critical' | 'warning' | 'brand' | 'default';
  to?: string;
  money?: boolean;
}

/** Kennzahlen, die als Kachel angezeigt werden können. */
export const TILE_CATALOG: Record<TileKey, TileInfo> = {
  expired:           { label: 'abgelaufen',           tone: 'critical', to: '/bestand?filter=abgelaufen' },
  expiring_soon:     { label: 'läuft bald ab',        tone: 'warning',  to: '/bestand?filter=bald' },
  below_min_stock:   { label: 'unter Mindestbestand', tone: 'default',  to: '/bestand?filter=mindestbestand' },
  products_in_stock: { label: 'Artikel im Bestand',   tone: 'brand',    to: '/bestand' },
  shopping_open:     { label: 'auf der Einkaufsliste', tone: 'default', to: '/einkauf' },
  batches:           { label: 'Posten im Lager',      tone: 'default',  to: '/bestand' },
  stock_value:       { label: 'Warenwert',            tone: 'brand',    money: true },
};

export const TILE_KEYS = Object.keys(TILE_CATALOG) as TileKey[];

interface WidgetInfo {
  label: string;
  description: string;
  /** Vorgaben beim Hinzufügen. */
  defaults: Record<string, unknown>;
  /** Mehrfach sinnvoll? Lagerorte oder Notizen ja, Kennzahlen nicht. */
  repeatable: boolean;
}

export const WIDGET_CATALOG: Record<WidgetType, WidgetInfo> = {
  stats: {
    label: 'Kennzahlen',
    description: 'Kacheln mit den Zahlen, die dir wichtig sind.',
    defaults: { tiles: ['expired', 'expiring_soon', 'below_min_stock', 'products_in_stock'] },
    repeatable: false,
  },
  expiring: {
    label: 'Bald aufbrauchen',
    description: 'Was abgelaufen ist oder demnächst abläuft, mit Schnellbuchung.',
    defaults: { limit: 10 },
    repeatable: false,
  },
  locations: {
    label: 'Lagerorte',
    description: 'Alle Lagerorte als Einstieg in den Bestand.',
    defaults: {},
    repeatable: false,
  },
  shopping: {
    label: 'Einkaufsliste',
    description: 'Die nächsten offenen Einträge.',
    defaults: { limit: 5 },
    repeatable: false,
  },
  low_stock: {
    label: 'Unter Mindestbestand',
    description: 'Artikel, von denen zu wenig da ist.',
    defaults: { limit: 5 },
    repeatable: false,
  },
  recent: {
    label: 'Letzte Buchungen',
    description: 'Was zuletzt ein- oder ausgebucht wurde.',
    defaults: { limit: 5 },
    repeatable: false,
  },
  location_stock: {
    label: 'Bestand eines Lagerorts',
    description: 'Was an einem bestimmten Ort liegt – etwa im Gefrierfach.',
    defaults: { limit: 5 },
    repeatable: true,
  },
  note: {
    label: 'Notiz',
    description: 'Eigener Text, zum Beispiel eine Einkaufserinnerung.',
    defaults: { title: 'Notiz', text: '' },
    repeatable: true,
  },
};

export const WIDGET_TYPES = Object.keys(WIDGET_CATALOG) as WidgetType[];

export const DEFAULT_LAYOUT: Widget[] = [
  { id: 'stats', type: 'stats', options: { ...WIDGET_CATALOG.stats.defaults } },
  { id: 'expiring', type: 'expiring', options: { ...WIDGET_CATALOG.expiring.defaults } },
  { id: 'locations', type: 'locations', options: {} },
];

/**
 * Liest die gespeicherte Zusammenstellung. Ist sie beschädigt oder stammt sie
 * aus einer neueren Fassung mit unbekannten Abschnitten, fällt die Übersicht
 * auf die Vorgabe zurück, statt leer zu bleiben.
 */
export function parseLayout(raw: string | null | undefined): Widget[] {
  if (!raw) return DEFAULT_LAYOUT;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_LAYOUT;

    const widgets = parsed
      .filter((entry): entry is Widget =>
        Boolean(entry) && typeof entry === 'object' && (entry as Widget).type in WIDGET_CATALOG)
      .map((entry, index) => ({
        id: String(entry.id ?? `${entry.type}-${index}`),
        type: entry.type,
        options: entry.options && typeof entry.options === 'object' ? entry.options : {},
      }));

    return widgets.length > 0 ? widgets : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function serializeLayout(widgets: Widget[]): string {
  return JSON.stringify(widgets);
}

let counter = 0;

export function createWidget(type: WidgetType, options: Record<string, unknown> = {}): Widget {
  counter += 1;
  return {
    id: `${type}-${Date.now().toString(36)}-${counter}`,
    type,
    options: { ...WIDGET_CATALOG[type].defaults, ...options },
  };
}

export function moveWidget(widgets: Widget[], index: number, direction: -1 | 1): Widget[] {
  const target = index + direction;
  if (target < 0 || target >= widgets.length) return widgets;

  const next = [...widgets];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved as Widget);
  return next;
}

/**
 * Name eines Abschnitts im Bearbeitungsmodus. Wo der Abschnitt eine eigene
 * Überschrift trägt – eine Notiz oder ein bestimmter Lagerort – steht die
 * hier, sonst die Gattungsbezeichnung. Der Balken ersetzt im
 * Bearbeitungsmodus die Überschrift des Abschnitts.
 */
export function widgetLabel(widget: Widget, locationName?: string): string {
  if (widget.type === 'note') {
    const title = String(widget.options.title ?? '').trim();
    return title || WIDGET_CATALOG.note.label;
  }

  if (widget.type === 'location_stock') {
    return locationName ?? WIDGET_CATALOG.location_stock.label;
  }

  return WIDGET_CATALOG[widget.type].label;
}

/** Zahl einer Kachel aus den Kennzahlen des Servers. */
export function tileValue(key: TileKey, overview: Record<string, number> | undefined): number | null {
  if (!overview) return null;
  const value = overview[key];
  return typeof value === 'number' ? value : null;
}
