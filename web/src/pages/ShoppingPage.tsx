import { useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { Sheet } from '../components/Sheet';
import { CategoryDot, EmptyState, ErrorNotice, Field, ListSkeleton } from '../components/ui';
import { IconCart, IconCheck, IconPlus, IconTrash } from '../components/Icons';
import { useToast } from '../components/Toast';
import {
  useAddShoppingItem,
  useClearDoneShoppingItems,
  useDeleteShoppingItem,
  useLocations,
  useProducts,
  usePurchaseShoppingItem,
  useShoppingList,
  useUpdateShoppingItem,
} from '../api/hooks';
import { formatQuantity } from '../lib/format';
import type { ShoppingItem } from '../types';

export function ShoppingPage() {
  const list = useShoppingList();
  const locations = useLocations();
  const products = useProducts({ inStock: false });
  const addItem = useAddShoppingItem();
  const updateItem = useUpdateShoppingItem();
  const deleteItem = useDeleteShoppingItem();
  const purchaseItem = usePurchaseShoppingItem();
  const clearDone = useClearDoneShoppingItems();
  const toast = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newQuantity, setNewQuantity] = useState('1');
  const [newProductId, setNewProductId] = useState('');
  const [fallbackLocation, setFallbackLocation] = useState('');
  const [busy, setBusy] = useState(false);

  const { open, done } = useMemo(() => ({
    open: list.data?.filter((item) => !item.done) ?? [],
    done: list.data?.filter((item) => item.done) ?? [],
  }), [list.data]);

  async function toggle(item: ShoppingItem) {
    try {
      await updateItem.mutateAsync({ id: item.id, done: !item.done });
    } catch (error) {
      toast.warn(error instanceof Error ? error.message : 'Änderung fehlgeschlagen');
    }
  }

  async function addNew() {
    const payload = newProductId
      ? { product_id: Number(newProductId), quantity: Number(newQuantity.replace(',', '.')) || 1 }
      : { name: newName.trim(), quantity: Number(newQuantity.replace(',', '.')) || 1 };

    if (!newProductId && !payload.name) {
      toast.warn('Bitte einen Namen eingeben oder einen Artikel wählen.');
      return;
    }

    try {
      await addItem.mutateAsync(payload);
      setAddOpen(false);
      setNewName('');
      setNewProductId('');
      setNewQuantity('1');
    } catch (error) {
      toast.warn(error instanceof Error ? error.message : 'Hinzufügen fehlgeschlagen');
    }
  }

  /**
   * Nach dem Einkauf: alle abgehakten Einträge in den Bestand buchen. Artikel
   * ohne Standardlagerort bekommen den hier gewählten Ort.
   */
  async function storeDoneItems() {
    setBusy(true);
    let stored = 0;
    let failed = 0;

    for (const item of done) {
      try {
        await purchaseItem.mutateAsync({
          id: item.id,
          location_id: fallbackLocation ? Number(fallbackLocation) : undefined,
        });
        stored += 1;
      } catch {
        failed += 1;
      }
    }

    // Reine Freitexteinträge sind nach dem Buchen nur abgehakt, nicht entfernt.
    await clearDone.mutateAsync().catch(() => undefined);

    setBusy(false);
    setStoreOpen(false);
    toast.notify(
      failed === 0
        ? `${stored} ${stored === 1 ? 'Eintrag' : 'Einträge'} eingelagert`
        : `${stored} eingelagert, ${failed} übersprungen – dort fehlt ein Lagerort`,
    );
  }

  return (
    <Layout
      title="Einkauf"
      subtitle={open.length > 0 ? `${open.length} offen` : 'Alles erledigt'}
      actions={
        <button type="button" className="btn btn--primary btn--icon" onClick={() => setAddOpen(true)}>
          <IconPlus />
          <span className="visually-hidden">Eintrag hinzufügen</span>
        </button>
      }
    >
      <div className="stack">
        {list.isPending ? <ListSkeleton rows={5} /> : null}
        {list.isError ? <ErrorNotice error={list.error} onRetry={() => void list.refetch()} /> : null}

        {list.data && list.data.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<IconCart size={30} />}
              title="Die Liste ist leer"
              hint="Artikel mit Mindestbestand landen hier automatisch, sobald der Vorrat zur Neige geht."
              action={
                <button type="button" className="btn btn--primary" onClick={() => setAddOpen(true)}>
                  <IconPlus size={18} /> Eintrag hinzufügen
                </button>
              }
            />
          </div>
        ) : null}

        {open.length > 0 ? (
          <section aria-labelledby="open-heading">
            <div className="section-title">
              <h2 id="open-heading">Offen</h2>
            </div>
            <ul className="list">
              {open.map((item) => (
                <ShoppingRow
                  key={item.id}
                  item={item}
                  onToggle={() => void toggle(item)}
                  onDelete={() => void deleteItem.mutateAsync(item.id)}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {done.length > 0 ? (
          <section aria-labelledby="done-heading">
            <div className="section-title">
              <h2 id="done-heading">Im Wagen</h2>
              <span className="small muted">{done.length}</span>
            </div>
            <ul className="list">
              {done.map((item) => (
                <ShoppingRow
                  key={item.id}
                  item={item}
                  onToggle={() => void toggle(item)}
                  onDelete={() => void deleteItem.mutateAsync(item.id)}
                />
              ))}
            </ul>

            <button
              type="button"
              className="btn btn--primary btn--block"
              style={{ marginTop: 'var(--space-3)' }}
              onClick={() => setStoreOpen(true)}
            >
              <IconCheck size={18} /> Einkauf einlagern
            </button>
          </section>
        ) : null}
      </div>

      {/* Eintrag hinzufügen ------------------------------------------------ */}
      <Sheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Auf die Liste setzen"
        footer={
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => setAddOpen(false)}>Abbrechen</button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void addNew()}
              disabled={addItem.isPending}
            >
              Hinzufügen
            </button>
          </div>
        }
      >
        <div className="stack">
          <Field label="Bekannter Artikel" htmlFor="shopping-product">
            <select
              id="shopping-product"
              className="select"
              value={newProductId}
              onChange={(event) => setNewProductId(event.target.value)}
            >
              <option value="">– Freitext eingeben –</option>
              {products.data?.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </Field>

          {!newProductId ? (
            <Field label="Bezeichnung" htmlFor="shopping-name">
              <input
                id="shopping-name"
                className="input"
                value={newName}
                placeholder="z. B. Backpapier"
                onChange={(event) => setNewName(event.target.value)}
              />
            </Field>
          ) : null}

          <Field label="Menge" htmlFor="shopping-quantity">
            <input
              id="shopping-quantity"
              className="input"
              inputMode="decimal"
              value={newQuantity}
              onChange={(event) => setNewQuantity(event.target.value)}
            />
          </Field>
        </div>
      </Sheet>

      {/* Einkauf einlagern ------------------------------------------------- */}
      <Sheet
        open={storeOpen}
        onClose={() => setStoreOpen(false)}
        title="Einkauf einlagern"
        description={`${done.length} ${done.length === 1 ? 'Eintrag wird' : 'Einträge werden'} in den Bestand gebucht.`}
        footer={
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => setStoreOpen(false)} disabled={busy}>
              Abbrechen
            </button>
            <button type="button" className="btn btn--primary" onClick={() => void storeDoneItems()} disabled={busy}>
              {busy ? <span className="spinner" /> : 'Einlagern'}
            </button>
          </div>
        }
      >
        <div className="stack">
          <Field
            label="Lagerort"
            htmlFor="store-location"
            hint="Gilt für Artikel ohne hinterlegten Standardlagerort."
          >
            <select
              id="store-location"
              className="select"
              value={fallbackLocation}
              onChange={(event) => setFallbackLocation(event.target.value)}
            >
              <option value="">Standardlagerort des Artikels</option>
              {locations.data?.map((location) => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </select>
          </Field>

          <p className="small muted">
            Mindesthaltbarkeitsdaten lassen sich danach je Posten auf der Artikelseite nachtragen.
          </p>
        </div>
      </Sheet>
    </Layout>
  );
}

function ShoppingRow({
  item,
  onToggle,
  onDelete,
}: {
  item: ShoppingItem;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="list__item">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={item.done}
        style={{
          flex: 'none',
          width: 26,
          height: 26,
          display: 'grid',
          placeItems: 'center',
          borderRadius: 999,
          border: `2px solid ${item.done ? 'var(--brand-fill)' : 'var(--line-strong)'}`,
          background: item.done ? 'var(--brand-fill)' : 'transparent',
          color: '#fff',
        }}
      >
        {item.done ? <IconCheck size={15} /> : null}
        <span className="visually-hidden">
          {item.done ? `${item.name} wieder als offen markieren` : `${item.name} als erledigt markieren`}
        </span>
      </button>

      <div className="list__body">
        <div
          className="list__title"
          style={item.done ? { textDecoration: 'line-through', color: 'var(--ink-muted)' } : undefined}
        >
          {item.name}
        </div>
        <div className="list__meta">
          {item.category_color ? <CategoryDot color={item.category_color} /> : null}
          <span className="truncate">
            {formatQuantity(item.quantity, item.unit)}
            {/* Kurzform statt „automatisch (Bestand …)“: auf Handybreite wurde
                die lange Fassung ohnehin abgeschnitten. */}
            {item.source === 'auto' && item.min_stock
              ? ` · Bestand ${formatQuantity(item.current_quantity)} von ${formatQuantity(item.min_stock, item.unit)}`
              : ''}
          </span>
        </div>
      </div>

      <button type="button" className="btn btn--ghost btn--icon" onClick={onDelete}>
        <IconTrash size={18} />
        <span className="visually-hidden">{item.name} von der Liste entfernen</span>
      </button>
    </li>
  );
}
