import type { ChangeEvent, ReactNode } from 'react';
import { IconAlert, IconMinus, IconPlus, IconSearch } from './Icons';
import { expiryLevel, expiryText, parseDecimal } from '../lib/format';

/* Formularfeld mit Beschriftung und optionalem Hinweis ---------------------- */

interface FieldProps {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}

export function Field({ label, hint, htmlFor, children }: FieldProps) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}

/* Suchfeld ----------------------------------------------------------------- */

export function SearchInput({
  value,
  onChange,
  placeholder = 'Suchen …',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search">
      <IconSearch size={18} className="search__icon" />
      <input
        type="search"
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        aria-label={placeholder}
      />
    </div>
  );
}

/* Mengeneingabe mit großen Tippflächen ------------------------------------- */

export function QuantityStepper({
  value,
  unit,
  step = 1,
  min = 0,
  onChange,
}: {
  value: number;
  unit?: string;
  step?: number;
  min?: number;
  onChange: (value: number) => void;
}) {
  const clamp = (next: number) => Math.max(min, Math.round(next * 1000) / 1000);

  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper__btn"
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
      >
        <IconMinus size={18} />
        <span className="visually-hidden">Menge verringern</span>
      </button>

      <input
        className="input"
        type="text"
        inputMode="decimal"
        value={String(value).replace('.', ',')}
        aria-label={unit ? `Menge in ${unit}` : 'Menge'}
        onChange={(event) => {
          const parsed = parseDecimal(event.target.value);
          if (parsed !== null) onChange(clamp(parsed));
          else if (event.target.value === '') onChange(min);
        }}
      />

      <button type="button" className="stepper__btn" onClick={() => onChange(clamp(value + step))}>
        <IconPlus size={18} />
        <span className="visually-hidden">Menge erhöhen</span>
      </button>
    </div>
  );
}

/* Haltbarkeitsplakette ----------------------------------------------------- */

const EXPIRY_BADGE_CLASS = {
  expired: 'badge badge--critical',
  today: 'badge badge--serious',
  soon: 'badge badge--warning',
  ok: 'badge',
  none: 'badge',
} as const;

export function ExpiryBadge({ bestBefore, warnDays }: { bestBefore: string | null; warnDays: number }) {
  const level = expiryLevel(bestBefore, warnDays);
  const text = expiryText(bestBefore);

  return (
    <span className={EXPIRY_BADGE_CLASS[level]}>
      {level === 'expired' || level === 'today' ? <IconAlert size={12} /> : null}
      {text}
    </span>
  );
}

/* Warengruppenpunkt -------------------------------------------------------- */

export function CategoryDot({ color }: { color: string | null }) {
  return <span className="dot" style={color ? { background: color } : undefined} />;
}

/* Leerzustand -------------------------------------------------------------- */

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon ? <div className="empty__icon">{icon}</div> : null}
      <p style={{ fontWeight: 600, color: 'var(--ink)' }}>{title}</p>
      {hint ? <p className="small">{hint}</p> : null}
      {action ? <div style={{ marginTop: 'var(--space-2)' }}>{action}</div> : null}
    </div>
  );
}

/* Ladezustand -------------------------------------------------------------- */

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="list" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="list__item">
          <div className="list__body">
            <div className="skeleton" style={{ width: '52%', height: 15 }} />
            <div className="skeleton" style={{ width: '32%', height: 12, marginTop: 6 }} />
          </div>
          <div className="skeleton" style={{ width: 48, height: 15 }} />
        </div>
      ))}
    </div>
  );
}

/* Fehlermeldung ------------------------------------------------------------ */

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Unbekannter Fehler';

  return (
    <div className="notice notice--critical" role="alert">
      <IconAlert size={18} style={{ flex: 'none', marginTop: 1 }} />
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 600 }}>{message}</p>
        {onRetry ? (
          <button type="button" className="btn btn--small" style={{ marginTop: 8 }} onClick={onRetry}>
            Erneut versuchen
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* Auswahlchips ------------------------------------------------------------- */

export function ChipGroup<T extends string | number | null>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className="chip"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
