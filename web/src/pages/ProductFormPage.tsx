import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { ErrorNotice, Field, ListSkeleton } from '../components/ui';
import { IconBack } from '../components/Icons';
import { useToast } from '../components/Toast';
import {
  useCategories,
  useCreateProduct,
  useLocations,
  useMeta,
  useProduct,
  useUpdateProduct,
} from '../api/hooks';
import { parseDecimal } from '../lib/format';

interface FormState {
  name: string;
  brand: string;
  barcode: string;
  category_id: string;
  default_location_id: string;
  unit: string;
  min_stock: string;
  package_size: string;
  default_shelf_life_days: string;
  note: string;
}

const EMPTY: FormState = {
  name: '',
  brand: '',
  barcode: '',
  category_id: '',
  default_location_id: '',
  unit: 'Stk',
  min_stock: '',
  package_size: '',
  default_shelf_life_days: '',
  note: '',
};

export function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const productId = id ? Number(id) : null;
  const existing = useProduct(productId);
  const locations = useLocations();
  const categories = useCategories();
  const meta = useMeta();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  // Beim Anlegen kommen Name, Marke und Barcode häufig aus dem Scanner.
  useEffect(() => {
    if (productId) return;
    setForm((current) => ({
      ...current,
      name: params.get('name') ?? current.name,
      brand: params.get('brand') ?? current.brand,
      barcode: params.get('barcode') ?? current.barcode,
    }));
  }, [productId, params]);

  useEffect(() => {
    const data = existing.data;
    if (!productId || !data) return;

    setForm({
      name: data.name,
      brand: data.brand ?? '',
      barcode: data.barcode ?? '',
      category_id: data.category_id ? String(data.category_id) : '',
      default_location_id: data.default_location_id ? String(data.default_location_id) : '',
      unit: data.unit,
      min_stock: data.min_stock ? String(data.min_stock).replace('.', ',') : '',
      package_size: data.package_size ? String(data.package_size).replace('.', ',') : '',
      default_shelf_life_days: data.default_shelf_life_days ? String(data.default_shelf_life_days) : '',
      note: data.note ?? '',
    });
  }, [productId, existing.data]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    setError(null);

    const payload = {
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      barcode: form.barcode.trim() || null,
      category_id: form.category_id ? Number(form.category_id) : null,
      default_location_id: form.default_location_id ? Number(form.default_location_id) : null,
      unit: form.unit,
      min_stock: parseDecimal(form.min_stock) ?? 0,
      package_size: parseDecimal(form.package_size),
      default_shelf_life_days: form.default_shelf_life_days ? Number(form.default_shelf_life_days) : null,
      note: form.note.trim() || null,
    };

    if (!payload.name) {
      setError('Bitte einen Namen angeben.');
      return;
    }

    try {
      if (productId) {
        await updateProduct.mutateAsync({ id: productId, ...payload });
        toast.notify('Artikel gespeichert');
        navigate(`/artikel/${productId}`, { replace: true });
      } else {
        const created = await createProduct.mutateAsync(payload);
        toast.notify(`„${created.name}“ angelegt`);
        navigate(`/artikel/${created.id}`, { replace: true });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Speichern fehlgeschlagen');
    }
  }

  const pending = createProduct.isPending || updateProduct.isPending;

  return (
    <Layout
      title={productId ? 'Artikel bearbeiten' : 'Neuer Artikel'}
      leading={
        <button type="button" className="btn btn--ghost btn--icon" onClick={() => navigate(-1)}>
          <IconBack />
          <span className="visually-hidden">Zurück</span>
        </button>
      }
    >
      {productId && existing.isPending ? <ListSkeleton rows={6} /> : (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field label="Name" htmlFor="product-name">
            <input
              id="product-name"
              className="input"
              value={form.name}
              autoFocus={!productId}
              onChange={(event) => update('name', event.target.value)}
              placeholder="z. B. Vollmilch 3,5 %"
            />
          </Field>

          <div className="field-row">
            <Field label="Marke" htmlFor="product-brand">
              <input
                id="product-brand"
                className="input"
                value={form.brand}
                onChange={(event) => update('brand', event.target.value)}
              />
            </Field>

            <Field label="Einheit" htmlFor="product-unit">
              <select
                id="product-unit"
                className="select"
                value={form.unit}
                onChange={(event) => update('unit', event.target.value)}
              >
                {(meta.data?.units ?? ['Stk']).map((unit) => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="field-row">
            <Field label="Kategorie" htmlFor="product-category">
              <select
                id="product-category"
                className="select"
                value={form.category_id}
                onChange={(event) => update('category_id', event.target.value)}
              >
                <option value="">Ohne Kategorie</option>
                {categories.data?.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Standardlagerort" htmlFor="product-location">
              <select
                id="product-location"
                className="select"
                value={form.default_location_id}
                onChange={(event) => update('default_location_id', event.target.value)}
              >
                <option value="">Kein fester Ort</option>
                {locations.data?.map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="field-row">
            <Field
              label="Mindestbestand"
              htmlFor="product-min"
              hint="Unterschreitung landet automatisch auf der Einkaufsliste"
            >
              <input
                id="product-min"
                className="input"
                inputMode="decimal"
                value={form.min_stock}
                placeholder="0"
                onChange={(event) => update('min_stock', event.target.value)}
              />
            </Field>

            <Field label="Packungsgröße" htmlFor="product-package" hint="Schrittweite beim Buchen">
              <input
                id="product-package"
                className="input"
                inputMode="decimal"
                value={form.package_size}
                placeholder="z. B. 1"
                onChange={(event) => update('package_size', event.target.value)}
              />
            </Field>
          </div>

          <div className="field-row">
            <Field
              label="Übliche Haltbarkeit"
              htmlFor="product-shelf"
              hint="Tage ab Einkauf – setzt das MHD vor"
            >
              <input
                id="product-shelf"
                className="input"
                inputMode="numeric"
                value={form.default_shelf_life_days}
                placeholder="z. B. 7"
                onChange={(event) => update('default_shelf_life_days', event.target.value)}
              />
            </Field>

            <Field label="Barcode" htmlFor="product-barcode">
              <input
                id="product-barcode"
                className="input"
                inputMode="numeric"
                value={form.barcode}
                onChange={(event) => update('barcode', event.target.value)}
              />
            </Field>
          </div>

          <Field label="Notiz" htmlFor="product-note">
            <textarea
              id="product-note"
              className="textarea"
              value={form.note}
              onChange={(event) => update('note', event.target.value)}
            />
          </Field>

          {error ? <ErrorNotice error={new Error(error)} /> : null}

          <button type="submit" className="btn btn--primary btn--block" disabled={pending}>
            {pending ? <span className="spinner" /> : productId ? 'Änderungen speichern' : 'Artikel anlegen'}
          </button>
        </form>
      )}
    </Layout>
  );
}
