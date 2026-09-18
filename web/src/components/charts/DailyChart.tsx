import { useId, useState } from 'react';
import { formatShortDate } from '../../lib/format';
import type { ActivitySeries } from '../../types';

const WIDTH = 320;
const HEIGHT = 132;
const PADDING = { top: 10, right: 2, bottom: 18, left: 22 };

const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;
const SEGMENT_GAP = 2;

/**
 * Abgänge je Tag, gestapelt nach Verbrauch und Entsorgung. Gezählt werden
 * Buchungen – Stück, Gramm und Liter ließen sich nicht sinnvoll addieren.
 */
export function DailyChart({ data }: { data: ActivitySeries }) {
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();

  const series = data.series;
  const max = Math.max(1, ...series.map((point) => point.consume + point.waste));
  const step = PLOT_WIDTH / Math.max(series.length, 1);
  const barWidth = Math.max(3, Math.min(step - 2, 18));
  const baseline = PADDING.top + PLOT_HEIGHT;

  const scale = (value: number) => (value / max) * PLOT_HEIGHT;
  const ticks = [0, Math.round(max / 2), max].filter((value, index, all) => all.indexOf(value) === index);

  // Höchstens fünf Datumsbeschriftungen, sonst überlappen sie auf dem Handy.
  const labelEvery = Math.max(1, Math.ceil(series.length / 5));
  const activePoint = active === null ? null : series[active];

  return (
    <figure style={{ margin: 0, position: 'relative' }}>
      <svg
        className="chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={titleId}
        onMouseLeave={() => setActive(null)}
      >
        <title id={titleId}>
          Abgänge der letzten {data.days} Tage, aufgeteilt in Verbrauch und Entsorgung
        </title>

        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className="chart__grid"
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={baseline - scale(tick)}
              y2={baseline - scale(tick)}
            />
            <text className="chart__label" x={PADDING.left - 5} y={baseline - scale(tick) + 3} textAnchor="end">
              {tick}
            </text>
          </g>
        ))}

        {series.map((point, index) => {
          const x = PADDING.left + index * step + (step - barWidth) / 2;
          const consumeHeight = scale(point.consume);
          const wasteHeight = scale(point.waste);
          const radius = Math.min(3, barWidth / 2);

          return (
            <g key={point.day}>
              {point.consume > 0 ? (
                <rect
                  className="chart__bar"
                  x={x}
                  y={baseline - consumeHeight}
                  width={barWidth}
                  height={consumeHeight}
                  rx={radius}
                  fill="var(--chart-series)"
                  opacity={active === null || active === index ? 1 : 0.42}
                />
              ) : null}

              {point.waste > 0 ? (
                <rect
                  className="chart__bar"
                  x={x}
                  y={baseline - consumeHeight - (point.consume > 0 ? SEGMENT_GAP : 0) - wasteHeight}
                  width={barWidth}
                  height={wasteHeight}
                  rx={radius}
                  fill="var(--chart-series-2)"
                  opacity={active === null || active === index ? 1 : 0.42}
                />
              ) : null}

              {/* Unsichtbare, großzügige Trefferfläche für Maus und Finger */}
              <rect
                x={PADDING.left + index * step}
                y={PADDING.top}
                width={step}
                height={PLOT_HEIGHT}
                fill="transparent"
                onMouseEnter={() => setActive(index)}
                onTouchStart={() => setActive(index)}
              />

              {index % labelEvery === 0 ? (
                <text
                  className="chart__label"
                  x={PADDING.left + index * step + step / 2}
                  y={HEIGHT - 5}
                  textAnchor="middle"
                >
                  {formatShortDate(point.day)}
                </text>
              ) : null}
            </g>
          );
        })}

        <line
          className="chart__axis"
          x1={PADDING.left}
          x2={WIDTH - PADDING.right}
          y1={baseline}
          y2={baseline}
        />
      </svg>

      {activePoint ? (
        <div
          role="status"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            boxShadow: 'var(--shadow-mid)',
            fontSize: '0.75rem',
            lineHeight: 1.45,
            pointerEvents: 'none',
          }}
        >
          <strong>{formatShortDate(activePoint.day)}</strong>
          <br />
          {activePoint.consume} verbraucht · {activePoint.waste} entsorgt
        </div>
      ) : null}

      <figcaption className="chart-legend" style={{ marginTop: 'var(--space-2)' }}>
        <span className="chart-legend__item">
          <span className="chart-legend__swatch" style={{ background: 'var(--chart-series)' }} />
          Verbraucht
        </span>
        <span className="chart-legend__item">
          <span className="chart-legend__swatch" style={{ background: 'var(--chart-series-2)' }} />
          Entsorgt
        </span>
      </figcaption>

      {/* Dieselben Zahlen als Tabelle – für Bildschirmleser und zum Nachlesen. */}
      <details style={{ marginTop: 'var(--space-3)' }}>
        <summary className="small secondary" style={{ cursor: 'pointer' }}>Zahlen als Tabelle</summary>
        <table className="small numeric" style={{ width: '100%', marginTop: 'var(--space-2)', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--ink-secondary)' }}>
              <th scope="col" style={{ padding: '4px 0' }}>Tag</th>
              <th scope="col" style={{ padding: '4px 0', textAlign: 'right' }}>Verbraucht</th>
              <th scope="col" style={{ padding: '4px 0', textAlign: 'right' }}>Entsorgt</th>
            </tr>
          </thead>
          <tbody>
            {series.filter((point) => point.consume > 0 || point.waste > 0).map((point) => (
              <tr key={point.day} style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ padding: '4px 0' }}>{formatShortDate(point.day)}</td>
                <td style={{ padding: '4px 0', textAlign: 'right' }}>{point.consume}</td>
                <td style={{ padding: '4px 0', textAlign: 'right' }}>{point.waste}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
