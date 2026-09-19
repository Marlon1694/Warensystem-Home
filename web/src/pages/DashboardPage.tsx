import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { ErrorNotice } from '../components/ui';
import { DashboardWidget } from '../components/dashboard/widgets';
import { WidgetOptionsSheet } from '../components/dashboard/WidgetOptionsSheet';
import { AddWidgetSheet } from '../components/dashboard/AddWidgetSheet';
import {
  IconCheck,
  IconClose,
  IconEdit,
  IconMoon,
  IconPlus,
  IconRefresh,
  IconSettings,
  IconSun,
  IconTrash,
} from '../components/Icons';
import { useToast } from '../components/Toast';
import { useLocations, useOverview, useSaveSettings, useSettings } from '../api/hooks';
import { useTheme } from '../lib/theme';
import {
  DEFAULT_LAYOUT,
  createWidget,
  moveWidget,
  parseLayout,
  serializeLayout,
  widgetLabel,
  type Widget,
  type WidgetType,
} from '../lib/dashboard';

export function DashboardPage() {
  const settings = useSettings();
  const overview = useOverview();
  const locations = useLocations();
  const saveSettings = useSaveSettings();
  const toast = useToast();
  const { preference, cycle } = useTheme();

  /** Solange bearbeitet wird, gilt der Entwurf; gespeichert wird erst am Ende. */
  const [draft, setDraft] = useState<Widget[] | null>(null);
  const [optionsFor, setOptionsFor] = useState<Widget | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const saved = parseLayout(settings.data?.dashboard_layout);
  const layout = draft ?? saved;
  const editing = draft !== null;

  const warnDays = overview.data?.warn_days ?? 5;
  const currency = settings.data?.currency ?? 'EUR';
  const householdName = settings.data?.household_name ?? 'Zuhause';

  function update(next: Widget[]) {
    setDraft(next);
  }

  async function save() {
    if (!draft) return;

    try {
      await saveSettings.mutateAsync({ dashboard_layout: serializeLayout(draft) });
      setDraft(null);
      toast.notify('Übersicht gespeichert');
    } catch (error) {
      toast.warn(error instanceof Error ? error.message : 'Speichern fehlgeschlagen');
    }
  }

  function addWidget(type: WidgetType) {
    update([...layout, createWidget(type)]);
    setAddOpen(false);
  }

  function removeWidget(index: number) {
    update(layout.filter((_, position) => position !== index));
  }

  function applyOptions(options: Record<string, unknown>) {
    if (!optionsFor) return;
    update(layout.map((widget) => (widget.id === optionsFor.id ? { ...widget, options } : widget)));
    setOptionsFor(null);
  }

  return (
    <Layout
      title={editing ? 'Anpassen' : householdName}
      subtitle={editing ? 'Sortieren, einstellen, entfernen' : 'Vorräte im Blick'}
      actions={
        editing ? (
          <div className="row" style={{ gap: 'var(--space-1)' }}>
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              onClick={() => setDraft(null)}
              disabled={saveSettings.isPending}
            >
              <IconClose />
              <span className="visually-hidden">Anpassen abbrechen</span>
            </button>
            <button
              type="button"
              className="btn btn--primary btn--small"
              onClick={() => void save()}
              disabled={saveSettings.isPending}
            >
              {saveSettings.isPending ? <span className="spinner" /> : <><IconCheck size={16} /> Fertig</>}
            </button>
          </div>
        ) : (
          <div className="row" style={{ gap: 'var(--space-1)' }}>
            <button type="button" className="btn btn--ghost btn--icon" onClick={() => setDraft(saved)}>
              <IconEdit />
              <span className="visually-hidden">Übersicht anpassen</span>
            </button>
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
        )
      }
    >
      <div className="stack stack--loose">
        {settings.isError ? (
          <ErrorNotice error={settings.error} onRetry={() => void settings.refetch()} />
        ) : null}

        {layout.map((widget, index) => (
          <div key={widget.id}>
            {editing ? (
              <div className="widget-edit">
                <div className="widget-edit__bar">
                  <span className="widget-edit__name">
                    {widgetLabel(
                      widget,
                      locations.data?.find((row) => row.id === Number(widget.options.location_id))?.name,
                    )}
                  </span>

                  <button
                    type="button"
                    className="btn btn--ghost btn--small btn--icon"
                    onClick={() => update(moveWidget(layout, index, -1))}
                    disabled={index === 0}
                  >
                    <span aria-hidden="true">↑</span>
                    <span className="visually-hidden">Nach oben</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn--ghost btn--small btn--icon"
                    onClick={() => update(moveWidget(layout, index, 1))}
                    disabled={index === layout.length - 1}
                  >
                    <span aria-hidden="true">↓</span>
                    <span className="visually-hidden">Nach unten</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn--ghost btn--small btn--icon"
                    onClick={() => setOptionsFor(widget)}
                  >
                    <IconSettings size={17} />
                    <span className="visually-hidden">Abschnitt einstellen</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn--ghost btn--small btn--icon"
                    onClick={() => removeWidget(index)}
                  >
                    <IconTrash size={17} />
                    <span className="visually-hidden">Abschnitt entfernen</span>
                  </button>
                </div>

                <div className="widget-edit__body">
                  <DashboardWidget widget={widget} currency={currency} warnDays={warnDays} />
                </div>
              </div>
            ) : (
              <DashboardWidget widget={widget} currency={currency} warnDays={warnDays} />
            )}
          </div>
        ))}

        {editing ? (
          <div className="stack stack--tight">
            <button type="button" className="btn btn--block" onClick={() => setAddOpen(true)}>
              <IconPlus size={18} /> Abschnitt hinzufügen
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={() => update(DEFAULT_LAYOUT.map((widget) => ({ ...widget, options: { ...widget.options } })))}
            >
              <IconRefresh size={18} /> Auf Vorgabe zurücksetzen
            </button>
          </div>
        ) : null}

        {!editing && layout.length === 0 ? (
          <button type="button" className="btn btn--primary btn--block" onClick={() => setDraft(saved)}>
            <IconPlus size={18} /> Übersicht zusammenstellen
          </button>
        ) : null}
      </div>

      <AddWidgetSheet
        open={addOpen}
        present={layout.map((widget) => widget.type)}
        onClose={() => setAddOpen(false)}
        onAdd={addWidget}
      />

      <WidgetOptionsSheet
        widget={optionsFor}
        open={optionsFor !== null}
        onClose={() => setOptionsFor(null)}
        onSave={applyOptions}
      />
    </Layout>
  );
}
