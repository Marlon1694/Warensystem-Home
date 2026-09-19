import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CategoryDot, EmptyState, ExpiryBadge, ListSkeleton } from '../ui';
import {
  IconCart,
  IconCheck,
  IconChevron,
  IconClock,
  IconStock,
  IconTrash,
  LocationIcon,
} from '../Icons';
import { useToast } from '../Toast';
import {
  useBatches,
  useConsume,
  useExpiring,
  useLocations,
  useOverview,
  useProducts,
  useRecentMovements,
  useShoppingList,
} from '../../api/hooks';
import { MOVEMENT_LABELS, formatDateTime, formatMoney, formatQuantity } from '../../lib/format';
import { TILE_CATALOG, type TileKey, type Widget } from '../../lib/dashboard';
import type { ExpiringBatch } from '../../types';

interface WidgetProps {
  widget: Widget;
  currency: string;
  warnDays: number;
}

/** Überschrift plus Inhalt – alle Abschnitte sehen gleich aus. */
function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="section-title">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function limitOf(widget: Widget, fallback = 5): number {
  const value = Number(widget.options.limit);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/* ------------------------------------------------------------------------ */
/* Kennzahlen                                                                */
/* ------------------------------------------------------------------------ */

function StatsWidget({ widget, currency }: WidgetProps) {
  const overview = useOverview();
  const tiles = (Array.isArray(widget.options.tiles) ? widget.options.tiles : []) as TileKey[];
  const chosen = tiles.filter((tile) => tile in TILE_CATALOG);

  if (chosen.length === 0) {
    return <p className="small muted">Keine Kennzahl ausgewählt – über das Zahnrad eine hinzufügen.</p>;
  }

  return (
    <div className="grid-2">
      {chosen.map((key) => {
        const info = TILE_CATALOG[key];
        const raw = overview.data?.[key];
        const value = typeof raw === 'number'
          ? (info.money ? formatMoney(raw, currency) : String(raw))
          : '–';

        const className = [
          'stat',
          info.tone === 'critical' ? 'stat--critical' : '',
          info.tone === 'warning' ? 'stat--warning' : '',
          info.tone === 'brand' ? 'stat--brand' : '',
        ].filter(Boolean).join(' ');

        const body = (
          <>
            <span className={info.money ? 'stat__value stat__value--money numeric' : 'stat__value numeric'}>
              {value}
            </span>
            <span className="stat__label">{info.label}</span>
          </>
        );

        return info.to
          ? <Link key={key} to={info.to} className={className}>{body}</Link>
          : <div key={key} className={className}>{body}</div>;
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Bald aufbrauchen                                                          */
/* ------------------------------------------------------------------------ */

function ExpiringWidget({ widget, warnDays }: WidgetProps) {
  const days = Number.isInteger(Number(widget.options.days)) ? Number(widget.options.days) : undefined;
  const expiring = useExpiring(days);
  const consume = useConsume();
  const toast = useToast();
  const navigate = useNavigate();

  const limit = limitOf(widget, 10);
  const effectiveWarnDays = days ?? warnDays;

  /** Ganzer Posten in einem Schritt – der Regelfall bei ablaufender Ware. */
  async function bookWholeBatch(batch: ExpiringBatch, type: 'consume' | 'waste') {
    try {
      await consume.mutateAsync({
        product_id: batch.product_id,
        stock_item_id: batch.id,
        quantity: batch.quantity,
        type,
      });
      toast.notify(
        `${formatQuantity(batch.quantity, batch.unit)} ${batch.product_name} ` +
        `${type === 'consume' ? 'verbraucht' : 'entsorgt'}`,
      );
    } catch (error) {
      toast.warn(error instanceof Error ? error.message : 'Buchung fehlgeschlagen');
    }
  }

  return (
    <Section
      title="Bald aufbrauchen"
      action={<span className="small muted">Vorwarnung {effectiveWarnDays} Tage</span>}
    >
      {expiring.isPending ? <ListSkeleton /> : null}

      {expiring.data?.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<IconCheck size={30} />}
            title="Nichts läuft demnächst ab"
            hint="Alle Mindesthaltbarkeitsdaten liegen außerhalb der Vorwarnzeit."
          />
        </div>
      ) : null}

      {expiring.data && expiring.data.length > 0 ? (
        <>
          <ul className="list">
            {expiring.data.slice(0, limit).map((batch) => (
              <li key={batch.id}>
                <div className="list__item">
                  <button
                    type="button"
                    className="list__body"
                    style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }}
                    onClick={() => navigate(`/artikel/${batch.product_id}`)}
                  >
                    <div className="list__title">{batch.product_name}</div>
                    <div className="list__meta">
                      <CategoryDot color={batch.category_color} />
                      <span className="truncate">
                        {formatQuantity(batch.quantity, batch.unit)} · {batch.location_name}
                        {batch.opened ? ' · angebrochen' : ''}
                      </span>
                    </div>
                    <div style={{ marginTop: 5 }}>
                      <ExpiryBadge bestBefore={batch.best_before} warnDays={effectiveWarnDays} />
                    </div>
                  </button>

                  <div className="row" style={{ gap: 'var(--space-1)', flex: 'none' }}>
                    <button
                      type="button"
                      className="btn btn--ghost btn--icon"
                      onClick={() => void bookWholeBatch(batch, 'consume')}
                      disabled={consume.isPending}
                      title="Komplett verbraucht"
                    >
                      <IconCheck />
                      <span className="visually-hidden">{batch.product_name} komplett als verbraucht buchen</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--icon"
                      onClick={() => void bookWholeBatch(batch, 'waste')}
                      disabled={consume.isPending}
                      title="Entsorgt"
                    >
                      <IconTrash />
                      <span className="visually-hidden">{batch.product_name} komplett als entsorgt buchen</span>
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {expiring.data.length > limit ? (
            <Link to="/bestand?filter=bald" className="btn btn--block" style={{ marginTop: 'var(--space-2)' }}>
              Alle {expiring.data.length} anzeigen
            </Link>
          ) : null}
        </>
      ) : null}
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* Lagerorte                                                                 */
/* ------------------------------------------------------------------------ */

function LocationsWidget() {
  const locations = useLocations();

  return (
    <Section title="Lagerorte" action={<Link to="/einstellungen" className="small">Verwalten</Link>}>
      {locations.isPending ? <ListSkeleton rows={3} /> : (
        <ul className="list">
          {locations.data?.map((location) => (
            <li key={location.id}>
              <Link to={`/bestand?ort=${location.id}`} className="list__item">
                <LocationIcon kind={location.kind} size={22} style={{ color: 'var(--ink-secondary)' }} />
                <div className="list__body">
                  <div className="list__title">{location.name}</div>
                  {location.note ? (
                    <div className="list__meta"><span className="truncate">{location.note}</span></div>
                  ) : null}
                </div>
                <span className="list__value numeric">
                  {location.article_count}
                  <span className="small muted"> Art.</span>
                </span>
                <IconChevron size={16} className="list__chevron" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* Einkaufsliste                                                             */
/* ------------------------------------------------------------------------ */

function ShoppingWidget({ widget }: WidgetProps) {
  const list = useShoppingList();
  const limit = limitOf(widget);
  const open = list.data?.filter((item) => !item.done) ?? [];

  return (
    <Section
      title="Einkaufsliste"
      action={<Link to="/einkauf" className="small">Öffnen</Link>}
    >
      {list.isPending ? <ListSkeleton rows={3} /> : open.length === 0 ? (
        <div className="card">
          <EmptyState icon={<IconCart size={28} />} title="Nichts offen" />
        </div>
      ) : (
        <ul className="list">
          {open.slice(0, limit).map((item) => (
            <li key={item.id} className="list__item">
              <CategoryDot color={item.category_color} />
              <div className="list__body">
                <div className="list__title">{item.name}</div>
                {item.source === 'auto' ? (
                  <div className="list__meta"><span className="truncate">automatisch ergänzt</span></div>
                ) : null}
              </div>
              <span className="list__value">{formatQuantity(item.quantity, item.unit)}</span>
            </li>
          ))}
        </ul>
      )}

      {open.length > limit ? (
        <Link to="/einkauf" className="btn btn--block" style={{ marginTop: 'var(--space-2)' }}>
          Alle {open.length} anzeigen
        </Link>
      ) : null}
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* Unter Mindestbestand                                                      */
/* ------------------------------------------------------------------------ */

function LowStockWidget({ widget }: WidgetProps) {
  const products = useProducts({});
  const limit = limitOf(widget);
  const low = products.data?.filter((product) => product.below_min_stock) ?? [];

  return (
    <Section title="Unter Mindestbestand">
      {products.isPending ? <ListSkeleton rows={3} /> : low.length === 0 ? (
        <div className="card">
          <EmptyState icon={<IconCheck size={28} />} title="Alle Mindestbestände erfüllt" />
        </div>
      ) : (
        <ul className="list">
          {low.slice(0, limit).map((product) => (
            <li key={product.id}>
              <Link to={`/artikel/${product.id}`} className="list__item">
                <CategoryDot color={product.category_color} />
                <div className="list__body">
                  <div className="list__title">{product.name}</div>
                  <div className="list__meta">
                    <span className="truncate">
                      {formatQuantity(product.total_quantity, product.unit)} von {formatQuantity(product.min_stock, product.unit)}
                    </span>
                  </div>
                </div>
                <IconChevron size={16} className="list__chevron" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {low.length > limit ? (
        <Link to="/bestand?filter=mindestbestand" className="btn btn--block" style={{ marginTop: 'var(--space-2)' }}>
          Alle {low.length} anzeigen
        </Link>
      ) : null}
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* Letzte Buchungen                                                          */
/* ------------------------------------------------------------------------ */

function RecentWidget({ widget }: WidgetProps) {
  const limit = limitOf(widget);
  const recent = useRecentMovements(limit);

  return (
    <Section title="Letzte Buchungen">
      {recent.isPending ? <ListSkeleton rows={3} /> : recent.data?.length === 0 ? (
        <div className="card">
          <EmptyState icon={<IconClock size={28} />} title="Noch nichts gebucht" />
        </div>
      ) : (
        <ul className="list">
          {recent.data?.map((movement) => (
            <li key={movement.id}>
              <Link to={`/artikel/${movement.product_id}`} className="list__item">
                <CategoryDot color={movement.category_color} />
                <div className="list__body">
                  <div className="list__title">{movement.product_name}</div>
                  <div className="list__meta">
                    <span className="truncate">
                      {MOVEMENT_LABELS[movement.type] ?? movement.type} · {formatDateTime(movement.created_at)}
                    </span>
                  </div>
                </div>
                <span className="list__value">
                  {movement.quantity > 0 ? '+' : ''}
                  {formatQuantity(movement.quantity, movement.unit)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* Bestand eines Lagerorts                                                   */
/* ------------------------------------------------------------------------ */

function LocationStockWidget({ widget, warnDays }: WidgetProps) {
  const locationId = Number(widget.options.location_id) || null;
  const locations = useLocations();
  const batches = useBatches({ location: locationId });
  const limit = limitOf(widget);

  const location = locations.data?.find((row) => row.id === locationId);

  if (!locationId) {
    return (
      <Section title="Bestand eines Lagerorts">
        <p className="small muted">Kein Lagerort gewählt – über das Zahnrad einen auswählen.</p>
      </Section>
    );
  }

  return (
    <Section
      title={location?.name ?? 'Lagerort'}
      action={<Link to={`/bestand?ort=${locationId}`} className="small">Alle anzeigen</Link>}
    >
      {batches.isPending ? <ListSkeleton rows={3} /> : batches.data?.length === 0 ? (
        <div className="card">
          <EmptyState icon={<IconStock size={28} />} title="Hier liegt gerade nichts" />
        </div>
      ) : (
        <ul className="list">
          {batches.data?.slice(0, limit).map((batch) => (
            <li key={batch.id}>
              <Link to={`/artikel/${batch.product_id}`} className="list__item">
                <div className="list__body">
                  <div className="list__title">{batch.product_name}</div>
                  <div style={{ marginTop: 4 }}>
                    <ExpiryBadge bestBefore={batch.best_before} warnDays={warnDays} />
                  </div>
                </div>
                <span className="list__value">{formatQuantity(batch.quantity, batch.unit)}</span>
                <IconChevron size={16} className="list__chevron" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* Notiz                                                                     */
/* ------------------------------------------------------------------------ */

function NoteWidget({ widget }: WidgetProps) {
  const title = String(widget.options.title ?? 'Notiz');
  const text = String(widget.options.text ?? '');

  return (
    <Section title={title}>
      <div className="card card--padded">
        {text ? (
          <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
        ) : (
          <p className="small muted">Noch kein Text – über das Zahnrad einen schreiben.</p>
        )}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------ */

const RENDERERS = {
  stats: StatsWidget,
  expiring: ExpiringWidget,
  locations: LocationsWidget,
  shopping: ShoppingWidget,
  low_stock: LowStockWidget,
  recent: RecentWidget,
  location_stock: LocationStockWidget,
  note: NoteWidget,
} as const;

export function DashboardWidget(props: WidgetProps) {
  const Renderer = RENDERERS[props.widget.type];
  return <Renderer {...props} />;
}
