import { useEffect, useState } from 'react';
import { Sheet } from '../Sheet';
import { Field } from '../ui';
import { useLocations } from '../../api/hooks';
import { TILE_CATALOG, TILE_KEYS, WIDGET_CATALOG, type TileKey, type Widget } from '../../lib/dashboard';

interface Props {
  widget: Widget | null;
  open: boolean;
  onClose: () => void;
  onSave: (options: Record<string, unknown>) => void;
}

/** Einstellungen eines einzelnen Abschnitts der Übersicht. */
export function WidgetOptionsSheet({ widget, open, onClose, onSave }: Props) {
  const locations = useLocations();
  const [options, setOptions] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (open && widget) setOptions({ ...widget.options });
  }, [open, widget]);

  if (!widget) return null;

  const info = WIDGET_CATALOG[widget.type];
  const set = (key: string, value: unknown) => setOptions((current) => ({ ...current, [key]: value }));

  const tiles = (Array.isArray(options.tiles) ? options.tiles : []) as TileKey[];
  const toggleTile = (key: TileKey) => {
    set('tiles', tiles.includes(key) ? tiles.filter((tile) => tile !== key) : [...tiles, key]);
  };

  const hasLimit = ['expiring', 'shopping', 'low_stock', 'recent', 'location_stock'].includes(widget.type);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={info.label}
      description={info.description}
      footer={
        <div className="btn-row">
          <button type="button" className="btn" onClick={onClose}>Abbrechen</button>
          <button type="button" className="btn btn--primary" onClick={() => onSave(options)}>
            Übernehmen
          </button>
        </div>
      }
    >
      <div className="stack">
        {widget.type === 'stats' ? (
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field__label" style={{ padding: 0, marginBottom: 'var(--space-2)' }}>
              Kacheln (höchstens sechs)
            </legend>
            <div className="stack stack--tight">
              {TILE_KEYS.map((key) => {
                const checked = tiles.includes(key);
                return (
                  <label key={key} className="row" style={{ gap: 'var(--space-2)' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && tiles.length >= 6}
                      onChange={() => toggleTile(key)}
                      style={{ width: 20, height: 20 }}
                    />
                    <span>{TILE_CATALOG[key].label}</span>
                  </label>
                );
              })}
            </div>
            {tiles.length === 0 ? (
              <p className="field__hint" style={{ marginTop: 'var(--space-2)' }}>
                Ohne Auswahl bleibt der Abschnitt leer.
              </p>
            ) : null}
          </fieldset>
        ) : null}

        {widget.type === 'location_stock' ? (
          <Field label="Lagerort" htmlFor="widget-location">
            <select
              id="widget-location"
              className="select"
              value={String(options.location_id ?? '')}
              onChange={(event) => set('location_id', Number(event.target.value) || undefined)}
            >
              <option value="">Bitte wählen</option>
              {locations.data?.map((location) => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </select>
          </Field>
        ) : null}

        {hasLimit ? (
          <Field label="Wie viele Einträge" htmlFor="widget-limit">
            <select
              id="widget-limit"
              className="select"
              value={String(options.limit ?? 5)}
              onChange={(event) => set('limit', Number(event.target.value))}
            >
              {[3, 5, 10, 15, 20].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </Field>
        ) : null}

        {widget.type === 'expiring' ? (
          <Field
            label="Vorwarnzeit"
            htmlFor="widget-days"
            hint="Leer lassen, um die Einstellung des Haushalts zu übernehmen."
          >
            <input
              id="widget-days"
              className="input"
              inputMode="numeric"
              placeholder="Vorgabe des Haushalts"
              value={options.days === undefined ? '' : String(options.days)}
              onChange={(event) => {
                const raw = event.target.value.trim();
                set('days', raw === '' ? undefined : Number(raw));
              }}
            />
          </Field>
        ) : null}

        {widget.type === 'note' ? (
          <>
            <Field label="Überschrift" htmlFor="widget-title">
              <input
                id="widget-title"
                className="input"
                value={String(options.title ?? '')}
                placeholder="z. B. Nicht vergessen"
                onChange={(event) => set('title', event.target.value)}
              />
            </Field>
            <Field label="Text" htmlFor="widget-text">
              <textarea
                id="widget-text"
                className="textarea"
                style={{ minHeight: 140 }}
                value={String(options.text ?? '')}
                onChange={(event) => set('text', event.target.value)}
              />
            </Field>
          </>
        ) : null}

        {widget.type === 'locations' ? (
          <p className="small muted">Dieser Abschnitt hat keine Einstellungen.</p>
        ) : null}
      </div>
    </Sheet>
  );
}
