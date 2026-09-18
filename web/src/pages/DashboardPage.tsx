import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { CategoryDot, EmptyState, ErrorNotice, ExpiryBadge, ListSkeleton } from '../components/ui';
import {
  IconCheck,
  IconChevron,
  IconClock,
  IconMoon,
  IconSettings,
  IconSun,
  IconTrash,
  LocationIcon,
} from '../components/Icons';
import { useToast } from '../components/Toast';
import { useConsume, useExpiring, useLocations, useOverview, useSettings } from '../api/hooks';
import { useTheme } from '../lib/theme';
import { formatQuantity } from '../lib/format';
import type { ExpiringBatch } from '../types';

export function DashboardPage() {
  const overview = useOverview();
  const expiring = useExpiring();
  const locations = useLocations();
  const settings = useSettings();
  const consume = useConsume();
  const toast = useToast();
  const navigate = useNavigate();
  const { preference, cycle } = useTheme();

  const warnDays = overview.data?.warn_days ?? 5;
  const householdName = settings.data?.household_name ?? 'Zuhause';

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
    <Layout
      title={householdName}
      subtitle="Vorräte im Blick"
      actions={
        <div className="row" style={{ gap: 'var(--space-1)' }}>
          <button type="button" className="btn btn--ghost btn--icon" onClick={cycle}>
            {preference === 'dark' ? <IconMoon /> : <IconSun />}
            <span className="visually-hidden">
              Darstellung umschalten (aktuell: {preference === 'system' ? 'automatisch' : preference === 'dark' ? 'dunkel' : 'hell'})
            </span>
          </button>
          <Link to="/einstellungen" className="btn btn--ghost btn--icon">
            <IconSettings />
            <span className="visually-hidden">Einstellungen</span>
          </Link>
        </div>
      }
    >
      <div className="stack stack--loose">
        <section aria-label="Kennzahlen">
          {overview.isError ? (
            <ErrorNotice error={overview.error} onRetry={() => void overview.refetch()} />
          ) : (
            <div className="grid-2">
              <Link to="/bestand?filter=abgelaufen" className="stat stat--critical">
                <span className="stat__value numeric">{overview.data?.expired ?? '–'}</span>
                <span className="stat__label">abgelaufen</span>
              </Link>
              <Link to="/bestand?filter=bald" className="stat stat--warning">
                <span className="stat__value numeric">{overview.data?.expiring_soon ?? '–'}</span>
                <span className="stat__label">läuft bald ab</span>
              </Link>
              <Link to="/bestand?filter=mindestbestand" className="stat">
                <span className="stat__value numeric">{overview.data?.below_min_stock ?? '–'}</span>
                <span className="stat__label">unter Mindestbestand</span>
              </Link>
              <Link to="/bestand" className="stat stat--brand">
                <span className="stat__value numeric">{overview.data?.products_in_stock ?? '–'}</span>
                <span className="stat__label">Artikel im Bestand</span>
              </Link>
            </div>
          )}
        </section>

        <section aria-labelledby="expiring-heading">
          <div className="section-title">
            <h2 id="expiring-heading">Bald aufbrauchen</h2>
            <span className="small muted">Vorwarnung {warnDays} Tage</span>
          </div>

          {expiring.isPending ? <ListSkeleton /> : null}
          {expiring.isError ? <ErrorNotice error={expiring.error} onRetry={() => void expiring.refetch()} /> : null}

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
            <ul className="list">
              {expiring.data.slice(0, 10).map((batch) => (
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
                        <ExpiryBadge bestBefore={batch.best_before} warnDays={warnDays} />
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
                        <span className="visually-hidden">
                          {batch.product_name} komplett als verbraucht buchen
                        </span>
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--icon"
                        onClick={() => void bookWholeBatch(batch, 'waste')}
                        disabled={consume.isPending}
                        title="Entsorgt"
                      >
                        <IconTrash />
                        <span className="visually-hidden">
                          {batch.product_name} komplett als entsorgt buchen
                        </span>
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {expiring.data && expiring.data.length > 10 ? (
            <Link to="/bestand?filter=bald" className="btn btn--block" style={{ marginTop: 'var(--space-2)' }}>
              Alle {expiring.data.length} anzeigen
            </Link>
          ) : null}
        </section>

        <section aria-labelledby="locations-heading">
          <div className="section-title">
            <h2 id="locations-heading">Lagerorte</h2>
            <Link to="/einstellungen" className="small">Verwalten</Link>
          </div>

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
        </section>

        {overview.data && overview.data.stock_value > 0 ? (
          <p className="small muted row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            <IconClock size={14} />
            Erfasster Warenwert: {new Intl.NumberFormat('de-DE', {
              style: 'currency',
              currency: settings.data?.currency ?? 'EUR',
            }).format(overview.data.stock_value)}
          </p>
        ) : null}
      </div>
    </Layout>
  );
}
