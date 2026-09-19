/**
 * Beispieldaten der Browser-Demo. Sie bilden einen Haushalt ab, wie er nach
 * ein paar Wochen Nutzung aussieht – mit Abgelaufenem, knappen Beständen und
 * einem Verbrauchsverlauf, damit die Auswertung etwas zu zeigen hat.
 */

export function isoInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

export const LOCATIONS = [
  { id: 1, name: 'Kühlschrank', kind: 'fridge', note: 'Frischwaren, angebrochene Packungen', sort_order: 10 },
  { id: 2, name: 'Gefrierfach', kind: 'freezer', note: 'Tiefgekühltes', sort_order: 20 },
  { id: 3, name: 'Vorratskammer', kind: 'pantry', note: 'Trockenwaren und Konserven', sort_order: 30 },
  { id: 4, name: 'Küche', kind: 'kitchen', note: 'Schränke und Arbeitsfläche', sort_order: 40 },
  { id: 5, name: 'Keller', kind: 'cellar', note: 'Getränkekisten, Großpackungen, Eingemachtes', sort_order: 50 },
];

export const CATEGORIES = [
  { id: 1, name: 'Obst & Gemüse', color: '#008300', sort_order: 10 },
  { id: 2, name: 'Molkereiprodukte', color: '#2a78d6', sort_order: 20 },
  { id: 3, name: 'Fleisch & Fisch', color: '#e34948', sort_order: 30 },
  { id: 4, name: 'Brot & Backwaren', color: '#eda100', sort_order: 40 },
  { id: 5, name: 'Tiefkühlkost', color: '#1baf7a', sort_order: 50 },
  { id: 6, name: 'Konserven & Vorräte', color: '#eb6834', sort_order: 60 },
  { id: 7, name: 'Getränke', color: '#4a3aa7', sort_order: 70 },
  { id: 8, name: 'Süßes & Snacks', color: '#e87ba4', sort_order: 80 },
  { id: 9, name: 'Gewürze & Saucen', color: '#6b7280', sort_order: 90 },
  { id: 10, name: 'Haushalt & Sonstiges', color: '#6b7280', sort_order: 100 },
];

interface SeedBatch {
  location: number;
  quantity: number;
  bestBefore: string | null;
  price?: number;
  opened?: boolean;
}

interface SeedProduct {
  name: string;
  brand?: string;
  barcode?: string;
  category: number;
  location: number;
  unit: string;
  minStock?: number;
  packageSize?: number;
  shelfLife?: number;
  batches: SeedBatch[];
}

export const PRODUCTS: SeedProduct[] = [
  { name: 'Vollmilch 3,5 %', brand: 'Weihenstephan', barcode: '4008452010002', category: 2, location: 1, unit: 'l', minStock: 3, shelfLife: 9,
    batches: [{ location: 1, quantity: 1, bestBefore: isoInDays(2), price: 1.29, opened: true }, { location: 1, quantity: 1, bestBefore: isoInDays(8), price: 1.29 }] },
  { name: 'Butter', brand: 'Kerrygold', barcode: '5011038001414', category: 2, location: 1, unit: 'Stk', minStock: 2,
    batches: [{ location: 1, quantity: 1, bestBefore: isoInDays(-3), price: 2.79 }] },
  { name: 'Naturjoghurt', brand: 'Andechser', category: 2, location: 1, unit: 'Stk', minStock: 4,
    batches: [{ location: 1, quantity: 3, bestBefore: isoInDays(1), price: 2.97 }] },
  { name: 'Gouda am Stück', category: 2, location: 1, unit: 'g',
    batches: [{ location: 1, quantity: 280, bestBefore: isoInDays(13), price: 3.2, opened: true }] },
  { name: 'Eier', category: 2, location: 1, unit: 'Stk', minStock: 10, packageSize: 10,
    batches: [{ location: 1, quantity: 6, bestBefore: isoInDays(10), price: 2.1 }] },
  { name: 'Hackfleisch gemischt', category: 3, location: 2, unit: 'g',
    batches: [{ location: 2, quantity: 1000, bestBefore: isoInDays(118), price: 7.9 }] },
  { name: 'Hähnchenbrust', category: 3, location: 2, unit: 'g',
    batches: [{ location: 2, quantity: 600, bestBefore: isoInDays(94), price: 6.2 }] },
  { name: 'Erbsen', brand: 'Iglo', category: 5, location: 2, unit: 'Pck', minStock: 2,
    batches: [{ location: 2, quantity: 2, bestBefore: isoInDays(208), price: 2.98 }] },
  { name: 'Blattspinat', brand: 'Iglo', category: 5, location: 2, unit: 'Pck', minStock: 1,
    batches: [{ location: 2, quantity: 1, bestBefore: isoInDays(178), price: 1.79 }] },
  { name: 'Spaghetti', brand: 'Barilla', barcode: '8076809513753', category: 6, location: 3, unit: 'Pck', minStock: 3,
    batches: [{ location: 3, quantity: 4, bestBefore: isoInDays(398), price: 4.76 }] },
  { name: 'Passierte Tomaten', brand: 'Mutti', category: 6, location: 3, unit: 'Flasche', minStock: 4,
    batches: [{ location: 3, quantity: 4, bestBefore: isoInDays(498), price: 4.36 }] },
  { name: 'Kidneybohnen', category: 6, location: 3, unit: 'Dose', minStock: 3,
    batches: [{ location: 3, quantity: 4, bestBefore: isoInDays(598), price: 3.56 }] },
  { name: 'Basmatireis', category: 6, location: 3, unit: 'kg', minStock: 1,
    batches: [{ location: 3, quantity: 2, bestBefore: isoInDays(428), price: 6.98 }] },
  { name: 'Mehl Type 405', category: 6, location: 3, unit: 'kg', minStock: 2,
    batches: [{ location: 3, quantity: 1, bestBefore: isoInDays(148), price: 0.79 }] },
  { name: 'Haferflocken', brand: 'Kölln', category: 6, location: 3, unit: 'Pck', minStock: 2,
    batches: [{ location: 3, quantity: 1, bestBefore: isoInDays(188), price: 2.19 }] },
  { name: 'Zwiebeln', category: 1, location: 3, unit: 'kg', minStock: 1,
    batches: [{ location: 3, quantity: 1, bestBefore: isoInDays(23), price: 1.49 }] },
  { name: 'Olivenöl', brand: 'Monini', category: 9, location: 4, unit: 'Flasche', minStock: 1,
    batches: [{ location: 4, quantity: 1, bestBefore: isoInDays(318), price: 6.99, opened: true }] },
  { name: 'Äpfel', category: 1, location: 4, unit: 'kg', minStock: 1,
    batches: [{ location: 4, quantity: 1.5, bestBefore: isoInDays(5), price: 2.99 }] },
  { name: 'Vollkorntoast', brand: 'Harry', category: 4, location: 4, unit: 'Pck', minStock: 1, shelfLife: 7,
    batches: [{ location: 4, quantity: 1, bestBefore: isoInDays(3), price: 1.69, opened: true }] },
  { name: 'Zartbitterschokolade', brand: 'Ritter Sport', barcode: '4000417025005', category: 8, location: 4, unit: 'Stk', minStock: 2,
    batches: [{ location: 4, quantity: 3, bestBefore: isoInDays(218), price: 3.87 }] },
  { name: 'Mineralwasser', brand: 'Gerolsteiner', category: 7, location: 5, unit: 'Flasche', minStock: 12, packageSize: 6,
    batches: [{ location: 5, quantity: 11, bestBefore: isoInDays(298), price: 4.95 }] },
  { name: 'Apfelsaft', brand: 'Van Nahmen', category: 7, location: 5, unit: 'Flasche', minStock: 4,
    batches: [{ location: 5, quantity: 5, bestBefore: isoInDays(248), price: 16.0 }] },
  { name: 'Kartoffeln', category: 1, location: 5, unit: 'kg', minStock: 3,
    batches: [{ location: 5, quantity: 3, bestBefore: isoInDays(28), price: 3.49 }] },
  { name: 'Eingekochte Kirschen', category: 6, location: 5, unit: 'Glas',
    batches: [{ location: 5, quantity: 8, bestBefore: isoInDays(698) }] },
];

/** Freitexteintrag, damit die Einkaufsliste nicht nur Automatik zeigt. */
export const SHOPPING_EXTRA = [
  { name: 'Backpapier', quantity: 1, unit: 'Pck' },
  { name: 'Spülmaschinentabs', quantity: 1, unit: 'Pck' },
];
