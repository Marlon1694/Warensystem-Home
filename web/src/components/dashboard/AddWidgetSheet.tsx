import { Sheet } from '../Sheet';
import { WIDGET_CATALOG, WIDGET_TYPES, type WidgetType } from '../../lib/dashboard';

interface Props {
  open: boolean;
  /** Bereits vorhandene Abschnitte – Einmaliges wird ausgegraut. */
  present: WidgetType[];
  onClose: () => void;
  onAdd: (type: WidgetType) => void;
}

export function AddWidgetSheet({ open, present, onClose, onAdd }: Props) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Abschnitt hinzufügen"
      description="Die Übersicht setzt sich aus diesen Bausteinen zusammen."
    >
      <div className="stack stack--tight">
        {WIDGET_TYPES.map((type) => {
          const info = WIDGET_CATALOG[type];
          const used = !info.repeatable && present.includes(type);

          return (
            <button
              key={type}
              type="button"
              className="list__item"
              style={{
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                opacity: used ? 0.5 : 1,
              }}
              disabled={used}
              onClick={() => onAdd(type)}
            >
              <div className="list__body">
                <div className="list__title">{info.label}</div>
                <div className="list__meta">
                  <span className="truncate">{used ? 'bereits enthalten' : info.description}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
