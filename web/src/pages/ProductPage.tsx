import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { BookingSheet, type BookingMode } from '../components/BookingSheet';
import { BatchSheet } from '../components/BatchSheet';
import { CategoryDot, EmptyState, ErrorNotice, ExpiryBadge, ListSkeleton } from '../components/ui';
import {
  IconBack,
  IconCheck,
  IconEdit,
  IconMove,
  IconPlus,
  IconTrash,
  LocationIcon,
} from '../components/Icons';
import { useToast } from '../components/Toast';
import { useDeleteProduct, useOverview, useProduct, useSettings } from '../api/hooks';
import { MOVEMENT_LABELS, formatDateTime, formatMoney, formatQuantity } from '../lib/format';
import type { StockBatch } from '../types';

export function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const productId = id ? Number(id) : null;

  const product = useProduct(productId);
  const overview = useOverview();
  const settings = useSettings();
  const deleteProduct = useDeleteProduct();
  const toast = useToast();
  const navigate = useNavigate();

  const [booking, setBooking] = useState<BookingMode | null>(null);
  const [activeBatch, setActiveBatch] = useState<StockBatch | null>(null);

  const warnDays = overview.data?.warn_days ?? 5;
  const currency = settings.data?.currency ?? 'EUR';
  const data = product.data;

  async function removeProduct() {
    if (!data) return;
    if (!window.confirm(
      `„${data.name}“ löschen? Artikel mit Buchungsverlauf werden archiviert, ` +
      'damit die Auswertung vollständig bleibt.',
    )) return;

    try {
      await deleteProduct.mutateAsync(data.id);
      toast.notify(`„${data.name}“ entfernt`);
      navigate('/bestand');
    } catch (error) {
      toast.warn(error instanceof Error ? error.message : 'Löschen fehlgeschlagen');
    }
  }

  return (
    <Layout
      title={data?.name ?? 'Artikel'}
      subtitle={data?.brand ?? undefined}
      leading={
        <button type="button" className="btn btn--ghost btn--icon" onClick={() => navigate(-1)}>
          <IconBack />
          <span className="visually-hidden">Zurück</span>
        </button>
      }
      actions={
        data ? (
          <Link to={`/artikel/${data.id}/bearbeiten`} className="btn btn--ghost btn--icon">
            <IconEdit />
            <span className="visually-hidden">Artikel bearbeiten</span>
          </Link>
        ) : null
      }
    >
      {product.isPending ? <ListSkeleton rows={5} /> : null}
      {product.isError ? <ErrorNotice error={product.error} onRetry={() => void product.refetch()} /> : null}

      {data ? (
        <div className="stack stack--loose">
          <section className="card card--padded">
            <div className="row row--between">
              <div>
                <p className="stat__value numeric" style={{ fontSize: '2rem' }}>
                  {formatQuantity(data.total_quantity, data.unit)}
                </p>
                <p className="small secondary">
                  {data.batch_count === 0
                    ? 'Nicht vorrätig'
                    : `${data.batch_count} ${data.batch_count === 1 ? 'Posten' : 'Posten'} im Lager`}
                </p>
              </div>
              {data.category_name ? (
                <span className="badge">
                  <CategoryDot color={data.category_color} />
                  {data.category_name}
                </span>
              ) : null}
            </div>

            {data.below_min_stock ? (
              <p className="notice notice--warning" style={{ marginTop: 'var(--space-3)' }}>
                Unter Mindestbestand von {formatQuantity(data.min_stock, data.unit)} – steht auf der Einkaufsliste.
              </p>
            ) : null}

            {/* Eingang steht allein in der ersten Zeile: drei Beschriftungen
                nebeneinander passen auf Handybreite nicht ohne Abschneiden. */}
            <div className="stack stack--tight" style={{ marginTop: 'var(--space-4)' }}>
              <button
                type="button"
                className="btn btn--primary btn--block"
                onClick={() => setBooking('purchase')}
              >
                <IconPlus size={18} /> Eingang buchen
              </button>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setBooking('consume')}
                  disabled={data.total_quantity <= 0}
                >
                  <IconCheck size={18} /> Verbraucht
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setBooking('waste')}
                  disabled={data.total_quantity <= 0}
                >
                  <IconTrash size={18} /> Entsorgt
                </button>
              </div>
            </div>
          </section>

          <section aria-labelledby="batches-heading">
            <div className="section-title">
              <h2 id="batches-heading">Posten im Lager</h2>
            </div>

            {data.batches.length === 0 ? (
              <div className="card">
                <EmptyState
                  title="Kein Bestand"
                  hint="Über „Eingang“ buchen, sobald etwas eingekauft wurde."
                />
              </div>
            ) : (
              <ul className="list">
                {data.batches.map((batch) => (
                  <li key={batch.id}>
                    <button type="button" className="list__item" onClick={() => setActiveBatch(batch)}>
                      <LocationIcon
                        kind={batch.location_kind}
                        size={20}
                        style={{ color: 'var(--ink-secondary)' }}
                      />
                      <div className="list__body">
                        <div className="list__title">{batch.location_name}</div>
                        <div style={{ marginTop: 4 }} className="row row--wrap" >
                          <ExpiryBadge bestBefore={batch.best_before} warnDays={warnDays} />
                          {batch.opened ? <span className="badge badge--info">angebrochen</span> : null}
                        </div>
                      </div>
                      <span className="list__value">{formatQuantity(batch.quantity, batch.unit)}</span>
                      <IconMove size={16} className="list__chevron" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="details-heading">
            <div className="section-title">
              <h2 id="details-heading">Stammdaten</h2>
            </div>
            <div className="list">
              <DetailRow label="Einheit" value={data.unit} />
              <DetailRow
                label="Mindestbestand"
                value={data.min_stock > 0 ? formatQuantity(data.min_stock, data.unit) : 'nicht gesetzt'}
              />
              <DetailRow label="Standardlagerort" value={data.default_location_name ?? 'nicht gesetzt'} />
              <DetailRow
                label="Übliche Haltbarkeit"
                value={data.default_shelf_life_days ? `${data.default_shelf_life_days} Tage` : 'nicht gesetzt'}
              />
              <DetailRow label="Barcode" value={data.barcode ?? 'nicht hinterlegt'} />
              {data.note ? <DetailRow label="Notiz" value={data.note} /> : null}
            </div>
          </section>

          <section aria-labelledby="history-heading">
            <div className="section-title">
              <h2 id="history-heading">Verlauf</h2>
            </div>

            {data.movements.length === 0 ? (
              <div className="card">
                <EmptyState title="Noch keine Buchungen" />
              </div>
            ) : (
              <ul className="list">
                {data.movements.slice(0, 20).map((movement) => (
                  <li key={movement.id} className="list__item">
                    <div className="list__body">
                      <div className="list__title">{MOVEMENT_LABELS[movement.type] ?? movement.type}</div>
                      <div className="list__meta">
                        {formatDateTime(movement.created_at)}
                        {movement.location_name ? ` · ${movement.location_name}` : ''}
                        {movement.to_location_name ? ` → ${movement.to_location_name}` : ''}
                      </div>
                    </div>
                    <span className="list__value">
                      {movement.quantity > 0 ? '+' : ''}
                      {formatQuantity(movement.quantity, movement.unit)}
                      {movement.price ? (
                        <span className="small muted"><br />{formatMoney(Math.abs(movement.price), currency)}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <button
            type="button"
            className="btn btn--danger btn--block"
            onClick={removeProduct}
            disabled={deleteProduct.isPending}
          >
            <IconTrash size={18} /> Artikel löschen
          </button>
        </div>
      ) : null}

      <BookingSheet
        product={data ?? null}
        mode={booking ?? 'purchase'}
        open={booking !== null}
        onClose={() => setBooking(null)}
      />

      <BatchSheet
        batch={activeBatch}
        open={activeBatch !== null}
        onClose={() => setActiveBatch(null)}
      />
    </Layout>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="list__item">
      <div className="list__body">
        <div className="list__meta" style={{ marginTop: 0 }}>{label}</div>
      </div>
      <span className="list__value" style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}
