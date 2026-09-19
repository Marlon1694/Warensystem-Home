export type LocationKind = 'fridge' | 'freezer' | 'pantry' | 'cellar' | 'kitchen' | 'other';

export type MovementType = 'purchase' | 'consume' | 'waste' | 'move' | 'correction';

export interface StorageLocation {
  id: number;
  name: string;
  kind: LocationKind;
  note: string | null;
  sort_order: number;
  article_count: number;
  batch_count: number;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  sort_order: number;
  article_count: number;
}

export interface Product {
  id: number;
  name: string;
  brand: string | null;
  barcode: string | null;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  default_location_id: number | null;
  default_location_name: string | null;
  unit: string;
  min_stock: number;
  package_size: number | null;
  default_shelf_life_days: number | null;
  image_url: string | null;
  note: string | null;
  archived: boolean;
  total_quantity: number;
  batch_count: number;
  next_best_before: string | null;
  below_min_stock: boolean;
}

export interface StockBatch {
  id: number;
  product_id: number;
  location_id: number;
  location_name: string;
  location_kind: LocationKind;
  quantity: number;
  unit: string;
  best_before: string | null;
  opened: boolean;
  price: number | null;
  note: string | null;
  created_at: string;
  product_name?: string;
  brand?: string | null;
}

export interface Movement {
  id: number;
  product_id: number;
  type: MovementType;
  quantity: number;
  unit: string;
  price: number | null;
  note: string | null;
  created_at: string;
  location_name: string | null;
  to_location_name: string | null;
}

export interface ProductDetail extends Product {
  batches: StockBatch[];
  movements: Movement[];
}

export interface ExpiringBatch {
  id: number;
  product_id: number;
  location_id: number;
  product_name: string;
  brand: string | null;
  quantity: number;
  unit: string;
  best_before: string;
  opened: boolean;
  location_name: string;
  location_kind: LocationKind;
  category_name: string | null;
  category_color: string | null;
  days_left: number;
}

export interface ShoppingItem {
  id: number;
  product_id: number | null;
  product_name: string | null;
  brand: string | null;
  name: string;
  quantity: number;
  unit: string;
  note: string | null;
  done: boolean;
  source: 'manual' | 'auto';
  min_stock: number | null;
  current_quantity: number;
  category_name: string | null;
  category_color: string | null;
}

export interface Overview {
  products_total: number;
  products_in_stock: number;
  batches: number;
  stock_value: number;
  expired: number;
  expiring_soon: number;
  below_min_stock: number;
  shopping_open: number;
  warn_days: number;
  by_location: Array<{
    id: number;
    name: string;
    kind: LocationKind;
    products: number;
    batches: number;
    value: number;
  }>;
}

export interface ActivitySeries {
  days: number;
  from: string;
  series: Array<{
    day: string;
    consume: number;
    waste: number;
    purchase: number;
    consume_value: number;
    waste_value: number;
  }>;
}

export interface TopItems {
  days: number;
  type: 'consume' | 'waste';
  items: Array<{
    id: number;
    name: string;
    brand: string | null;
    unit: string;
    category_name: string | null;
    category_color: string | null;
    bookings: number;
    quantity: number;
    value: number;
  }>;
}

export interface WasteReport {
  days: number;
  from: string;
  consume_bookings: number;
  waste_bookings: number;
  consume_value: number;
  waste_value: number;
  waste_ratio: number;
  by_category: Array<{
    category_name: string;
    category_color: string;
    bookings: number;
    value: number;
  }>;
}

export interface BarcodeLookup {
  source: 'local' | 'openfoodfacts' | 'none';
  barcode: string;
  product: Product | null;
  suggestion: {
    name: string;
    brand: string | null;
    package_text: string | null;
    image_url: string | null;
  } | null;
}

export interface Settings {
  household_name: string;
  expiry_warn_days: string;
  currency: string;
  /** Zusammenstellung der Übersicht als JSON, siehe lib/dashboard.ts. */
  dashboard_layout?: string;
}

/** Jüngste Buchungen über alle Artikel hinweg. */
export interface RecentMovement {
  id: number;
  product_id: number;
  product_name: string;
  type: MovementType;
  quantity: number;
  unit: string;
  price: number | null;
  note: string | null;
  created_at: string;
  category_name: string | null;
  category_color: string | null;
  location_name: string | null;
  to_location_name: string | null;
}

export interface Meta {
  units: string[];
  location_kinds: LocationKind[];
  movement_types: MovementType[];
  dashboard_widgets: string[];
  dashboard_tiles: string[];
  default_dashboard: Array<{ id: string; type: string; options: Record<string, unknown> }>;
  revision: number;
}
