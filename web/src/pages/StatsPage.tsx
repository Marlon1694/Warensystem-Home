import { useState } from 'react';
import { Layout } from '../components/Layout';
import { DailyChart } from '../components/charts/DailyChart';
import { RankBars } from '../components/charts/RankBars';
import { ChipGroup, EmptyState, ErrorNotice } from '../components/ui';
import { IconChart } from '../components/Icons';
import { useActivity, useOverview, useSettings, useTopItems, useWasteReport } from '../api/hooks';
import { formatMoney, formatQuantity } from '../lib/format';

const PERIODS = [
  { value: 30, label: '30 Tage' },
  { value: 90, label: '3 Monate' },
  { value: 365, label: '1 Jahr' },
];

export function StatsPage() {
  const [days, setDays] = useState(30);

  const activity = useActivity(days);
  const consumed = useTopItems('consume', days);
  const wasted = useTopItems('waste', days);
  const waste = useWasteReport(days);
  const overview = useOverview();
  const settings = useSettings();

  const currency = settings.data?.currency ?? 'EUR';
  const hasActivity = (activity.data?.series ?? []).some((point) => point.consume + point.waste + point.purchase > 0);

  return (
    <Layout title="Auswertung" subtitle="Verbrauch, Abfall und Bestandswert">
      <div className="stack stack--loose">
        <ChipGroup label="Zeitraum" value={days} onChange={setDays} options={PERIODS} />

        {/* Kennzahlen ---------------------------------------------------- */}
        <section aria-label="Kennzahlen des Zeitraums" className="grid-2">
          <div className="stat">
            <span className="stat__value numeric">{waste.data?.consume_bookings ?? '–'}</span>
            <span className="stat__label">Verbrauchsbuchungen</span>
          </div>
          <div className="stat stat--warning">
            <span className="stat__value numeric">{waste.data?.waste_bookings ?? '–'}</span>
            <span className="stat__label">Entsorgungen</span>
          </div>
          <div className="stat">
            <span className="stat__value numeric">
              {waste.data ? `${Math.round(waste.data.waste_ratio * 100)} %` : '–'}
            </span>
            <span className="stat__label">Abfallanteil</span>
          </div>
          <div className="stat stat--brand">
            <span className="stat__value stat__value--money numeric">
              {overview.data ? formatMoney(overview.data.stock_value, currency) : '–'}
            </span>
            <span className="stat__label">Bestandswert</span>
          </div>
        </section>

        {/* Verlauf -------------------------------------------------------- */}
        <section aria-labelledby="activity-heading">
          <div className="section-title">
            <h2 id="activity-heading">Abgänge im Verlauf</h2>
          </div>

          <div className="card card--padded">
            {activity.isError ? (
              <ErrorNotice error={activity.error} onRetry={() => void activity.refetch()} />
            ) : activity.data && hasActivity ? (
              <DailyChart data={activity.data} />
            ) : (
              <EmptyState
                icon={<IconChart size={30} />}
                title="Noch keine Buchungen im Zeitraum"
                hint="Sobald Verbrauch gebucht wird, entsteht hier der Verlauf."
              />
            )}
          </div>
        </section>

        {/* Meistverbrauchte Artikel --------------------------------------- */}
        <section aria-labelledby="consumed-heading">
          <div className="section-title">
            <h2 id="consumed-heading">Am häufigsten verbraucht</h2>
          </div>

          <div className="card card--padded">
            {consumed.data && consumed.data.items.length > 0 ? (
              <RankBars
                entries={consumed.data.items.map((item) => ({
                  id: item.id,
                  label: item.name,
                  // Balkenlänge zählt Buchungen – die einzige über alle Artikel
                  // hinweg vergleichbare Größe. Die Menge steht als Text daneben.
                  sublabel: formatQuantity(item.quantity, item.unit),
                  value: item.bookings,
                  display: `${item.bookings}×`,
                }))}
              />
            ) : (
              <EmptyState title="Noch nichts verbraucht" />
            )}
          </div>
        </section>

        {/* Verschwendung --------------------------------------------------- */}
        <section aria-labelledby="waste-heading">
          <div className="section-title">
            <h2 id="waste-heading">Am häufigsten entsorgt</h2>
            {waste.data && waste.data.waste_value > 0 ? (
              <span className="small muted">{formatMoney(waste.data.waste_value, currency)} Wert</span>
            ) : null}
          </div>

          <div className="card card--padded">
            {wasted.data && wasted.data.items.length > 0 ? (
              <>
                <RankBars
                  tone="waste"
                  entries={wasted.data.items.map((item) => ({
                    id: item.id,
                    label: item.name,
                    sublabel: formatQuantity(item.quantity, item.unit),
                    value: item.bookings,
                    display: `${item.bookings}×`,
                  }))}
                />
                <p className="small muted" style={{ marginTop: 'var(--space-3)' }}>
                  Was hier oben steht, lohnt einen kleineren Einkauf oder einen früheren Blick ins Regal.
                </p>
              </>
            ) : (
              <EmptyState
                title="Nichts weggeworfen"
                hint="Im gewählten Zeitraum wurde keine Ware entsorgt."
              />
            )}
          </div>
        </section>

        {/* Bestand je Lagerort --------------------------------------------- */}
        <section aria-labelledby="locations-heading">
          <div className="section-title">
            <h2 id="locations-heading">Bestand je Lagerort</h2>
          </div>

          <div className="card card--padded">
            {overview.data && overview.data.by_location.length > 0 ? (
              <RankBars
                entries={overview.data.by_location.map((location) => ({
                  id: location.id,
                  label: location.name,
                  value: location.products,
                  display: `${location.products} Artikel`,
                }))}
              />
            ) : (
              <EmptyState title="Noch kein Bestand erfasst" />
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
}
