export interface RankEntry {
  id: number | string;
  label: string;
  sublabel?: string;
  value: number;
  display: string;
}

/**
 * Rangliste als waagerechte Balken. Eine Reihe, daher ohne Legende – der Wert
 * steht als Zahl direkt neben jedem Balken.
 */
export function RankBars({ entries, tone = 'default' }: { entries: RankEntry[]; tone?: 'default' | 'waste' }) {
  const max = Math.max(1, ...entries.map((entry) => entry.value));

  return (
    <ul>
      {entries.map((entry) => (
        <li key={entry.id} className="bar-row">
          <span className="truncate" style={{ fontWeight: 600 }}>
            {entry.label}
            {entry.sublabel ? <span className="small muted"> · {entry.sublabel}</span> : null}
          </span>
          <span className="numeric small" style={{ fontWeight: 640 }}>{entry.display}</span>
          <span className="bar-row__track">
            <span
              className={tone === 'waste' ? 'bar-row__fill bar-row__fill--waste' : 'bar-row__fill'}
              style={{ width: `${Math.max(3, (entry.value / max) * 100)}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
