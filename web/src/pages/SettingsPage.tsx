import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Sheet } from '../components/Sheet';
import { CategoryDot, ChipGroup, ErrorNotice, Field } from '../components/ui';
import { IconBack, IconDownload, IconPlus, IconTrash, IconUpload, LocationIcon } from '../components/Icons';
import { useToast } from '../components/Toast';
import {
  useCategories,
  useDeleteCategory,
  useDeleteLocation,
  useImportBackup,
  useLocations,
  useReorderCategories,
  useReorderLocations,
  useSaveCategory,
  useSaveLocation,
  useSaveSettings,
  useSettings,
} from '../api/hooks';
import { LOCATION_LABELS } from '../lib/format';
import { moveItem } from '../lib/list';
import { useTheme, type ThemePreference } from '../lib/theme';
import type { Category, LocationKind, StorageLocation } from '../types';

const KIND_OPTIONS: LocationKind[] = ['fridge', 'freezer', 'pantry', 'cellar', 'kitchen', 'other'];

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'Automatisch' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { preference, setPreference } = useTheme();

  const settings = useSettings();
  const locations = useLocations();
  const categories = useCategories();
  const saveSettings = useSaveSettings();
  const saveLocation = useSaveLocation();
  const deleteLocation = useDeleteLocation();
  const saveCategory = useSaveCategory();
  const deleteCategory = useDeleteCategory();
  const importBackup = useImportBackup();
  const reorderLocations = useReorderLocations();
  const reorderCategories = useReorderCategories();

  const [householdName, setHouseholdName] = useState('');
  const [warnDays, setWarnDays] = useState('5');
  const [editingLocation, setEditingLocation] = useState<Partial<StorageLocation> | null>(null);
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!settings.data) return;
    setHouseholdName(settings.data.household_name ?? 'Zuhause');
    setWarnDays(settings.data.expiry_warn_days ?? '5');
  }, [settings.data]);

  async function persistSettings() {
    try {
      await saveSettings.mutateAsync({
        household_name: householdName,
        expiry_warn_days: warnDays,
      });
      toast.notify('Einstellungen gespeichert');
    } catch (error) {
      toast.warn(error instanceof Error ? error.message : 'Speichern fehlgeschlagen');
    }
  }

  /** Verschiebt einen Eintrag und schickt die vollständige neue Folge. */
  function move<T extends { id: number }>(
    rows: T[] | undefined,
    index: number,
    direction: -1 | 1,
    save: (ids: number[]) => void,
  ) {
    if (!rows) return;
    const next = moveItem(rows, index, direction);
    if (next !== rows) save(next.map((row) => row.id));
  }

  async function persistLocation() {
    if (!editingLocation?.name?.trim()) return;

    try {
      await saveLocation.mutateAsync({
        id: editingLocation.id,
        name: editingLocation.name.trim(),
        kind: editingLocation.kind ?? 'pantry',
        note: editingLocation.note ?? null,
      });
      setEditingLocation(null);
      toast.notify('Lagerort gespeichert');
    } catch (error) {
      toast.warn(error instanceof Error ? error.message : 'Speichern fehlgeschlagen');
    }
  }

  async function removeLocation(location: StorageLocation) {
    const hasStock = location.batch_count > 0;
    const question = hasStock
      ? `„${location.name}“ enthält noch ${location.batch_count} Posten. Ort samt Bestand löschen?`
      : `„${location.name}“ löschen?`;

    if (!window.confirm(question)) return;

    try {
      await deleteLocation.mutateAsync({ id: location.id, force: hasStock });
      toast.notify('Lagerort gelöscht');
    } catch (error) {
      toast.warn(error instanceof Error ? error.message : 'Löschen fehlgeschlagen');
    }
  }

  async function persistCategory() {
    if (!editingCategory?.name?.trim()) return;

    try {
      await saveCategory.mutateAsync({
        id: editingCategory.id,
        name: editingCategory.name.trim(),
        color: editingCategory.color ?? '#6b7280',
      });
      setEditingCategory(null);
      toast.notify('Kategorie gespeichert');
    } catch (error) {
      toast.warn(error instanceof Error ? error.message : 'Speichern fehlgeschlagen');
    }
  }

  async function restoreBackup(file: File) {
    if (!window.confirm(
      'Die Sicherung ersetzt den gesamten aktuellen Bestand. Fortfahren?',
    )) return;

    try {
      const snapshot = JSON.parse(await file.text());
      await importBackup.mutateAsync(snapshot);
      toast.notify('Sicherung eingespielt');
    } catch (error) {
      toast.warn(error instanceof Error ? error.message : 'Die Datei konnte nicht gelesen werden');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <Layout
      title="Einstellungen"
      leading={
        <button type="button" className="btn btn--ghost btn--icon" onClick={() => navigate(-1)}>
          <IconBack />
          <span className="visually-hidden">Zurück</span>
        </button>
      }
    >
      <div className="stack stack--loose">
        {settings.isError ? <ErrorNotice error={settings.error} onRetry={() => void settings.refetch()} /> : null}

        {/* Haushalt ------------------------------------------------------- */}
        <section className="stack" aria-labelledby="household-heading">
          <div className="section-title"><h2 id="household-heading">Haushalt</h2></div>

          <Field label="Name" htmlFor="household-name" hint="Erscheint als Titel auf der Übersicht">
            <input
              id="household-name"
              className="input"
              value={householdName}
              onChange={(event) => setHouseholdName(event.target.value)}
            />
          </Field>

          <Field
            label="Vorwarnzeit für Mindesthaltbarkeit"
            htmlFor="warn-days"
            hint="Ab wie vielen Tagen vor dem MHD gewarnt wird"
          >
            <input
              id="warn-days"
              className="input"
              inputMode="numeric"
              value={warnDays}
              onChange={(event) => setWarnDays(event.target.value)}
            />
          </Field>

          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={() => void persistSettings()}
            disabled={saveSettings.isPending}
          >
            Speichern
          </button>
        </section>

        {/* Darstellung ---------------------------------------------------- */}
        <section className="stack stack--tight" aria-labelledby="theme-heading">
          <div className="section-title"><h2 id="theme-heading">Darstellung</h2></div>
          <ChipGroup label="Farbschema" value={preference} onChange={setPreference} options={THEME_OPTIONS} />
          <p className="small muted">Die Auswahl gilt nur auf diesem Gerät.</p>
        </section>

        {/* Lagerorte ------------------------------------------------------ */}
        <section aria-labelledby="locations-heading">
          <div className="section-title">
            <h2 id="locations-heading">Lagerorte</h2>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => setEditingLocation({ kind: 'pantry' })}
            >
              <IconPlus size={15} /> Neu
            </button>
          </div>

          <ul className="list">
            {locations.data?.map((location, index) => (
              <li key={location.id} className="list__item">
                <LocationIcon kind={location.kind} size={20} style={{ color: 'var(--ink-secondary)' }} />
                <button
                  type="button"
                  className="list__body"
                  style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }}
                  onClick={() => setEditingLocation(location)}
                >
                  <div className="list__title">{location.name}</div>
                  <div className="list__meta">
                    <span className="truncate">
                      {LOCATION_LABELS[location.kind]} · {location.article_count} Artikel
                    </span>
                  </div>
                </button>

                <ReorderButtons
                  label={location.name}
                  index={index}
                  count={locations.data?.length ?? 0}
                  onMove={(direction) =>
                    move(locations.data, index, direction, reorderLocations.mutate)}
                />

                <button
                  type="button"
                  className="btn btn--ghost btn--icon"
                  onClick={() => void removeLocation(location)}
                >
                  <IconTrash size={18} />
                  <span className="visually-hidden">{location.name} löschen</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Kategorien ----------------------------------------------------- */}
        <section aria-labelledby="categories-heading">
          <div className="section-title">
            <h2 id="categories-heading">Warengruppen</h2>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => setEditingCategory({ color: '#6b7280' })}
            >
              <IconPlus size={15} /> Neu
            </button>
          </div>

          <ul className="list">
            {categories.data?.map((category, index) => (
              <li key={category.id} className="list__item">
                <CategoryDot color={category.color} />
                <button
                  type="button"
                  className="list__body"
                  style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }}
                  onClick={() => setEditingCategory(category)}
                >
                  <div className="list__title">{category.name}</div>
                  <div className="list__meta">{category.article_count} Artikel</div>
                </button>

                <ReorderButtons
                  label={category.name}
                  index={index}
                  count={categories.data?.length ?? 0}
                  onMove={(direction) =>
                    move(categories.data, index, direction, reorderCategories.mutate)}
                />

                <button
                  type="button"
                  className="btn btn--ghost btn--icon"
                  onClick={() => {
                    if (window.confirm(`„${category.name}“ löschen? Artikel bleiben erhalten.`)) {
                      void deleteCategory.mutateAsync(category.id);
                    }
                  }}
                >
                  <IconTrash size={18} />
                  <span className="visually-hidden">{category.name} löschen</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Sicherung ------------------------------------------------------ */}
        <section className="stack stack--tight" aria-labelledby="backup-heading">
          <div className="section-title"><h2 id="backup-heading">Sicherung</h2></div>

          <a className="btn btn--block" href="/api/backup/export" download>
            <IconDownload size={18} /> Alles als Datei sichern
          </a>

          <button type="button" className="btn btn--block" onClick={() => fileInput.current?.click()}>
            <IconUpload size={18} /> Sicherung einspielen
          </button>

          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void restoreBackup(file);
            }}
          />

          <p className="small muted">
            Der Server legt zusätzlich täglich eine Sicherung im Ordner <code>data/backups</code> ab
            und behält die letzten 14.
          </p>
        </section>
      </div>

      {/* Lagerort bearbeiten --------------------------------------------- */}
      <Sheet
        open={editingLocation !== null}
        onClose={() => setEditingLocation(null)}
        title={editingLocation?.id ? 'Lagerort bearbeiten' : 'Neuer Lagerort'}
        footer={
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => setEditingLocation(null)}>Abbrechen</button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void persistLocation()}
              disabled={saveLocation.isPending}
            >
              Speichern
            </button>
          </div>
        }
      >
        <div className="stack">
          <Field label="Name" htmlFor="location-name">
            <input
              id="location-name"
              className="input"
              value={editingLocation?.name ?? ''}
              placeholder="z. B. Gefriertruhe Keller"
              onChange={(event) =>
                setEditingLocation((current) => ({ ...current, name: event.target.value }))}
            />
          </Field>

          <Field label="Art" htmlFor="location-kind" hint="Bestimmt das Symbol in den Listen">
            <select
              id="location-kind"
              className="select"
              value={editingLocation?.kind ?? 'pantry'}
              onChange={(event) =>
                setEditingLocation((current) => ({ ...current, kind: event.target.value as LocationKind }))}
            >
              {KIND_OPTIONS.map((kind) => (
                <option key={kind} value={kind}>{LOCATION_LABELS[kind]}</option>
              ))}
            </select>
          </Field>

          <Field label="Notiz" htmlFor="location-note">
            <input
              id="location-note"
              className="input"
              value={editingLocation?.note ?? ''}
              onChange={(event) =>
                setEditingLocation((current) => ({ ...current, note: event.target.value }))}
            />
          </Field>
        </div>
      </Sheet>

      {/* Kategorie bearbeiten --------------------------------------------- */}
      <Sheet
        open={editingCategory !== null}
        onClose={() => setEditingCategory(null)}
        title={editingCategory?.id ? 'Warengruppe bearbeiten' : 'Neue Warengruppe'}
        footer={
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => setEditingCategory(null)}>Abbrechen</button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void persistCategory()}
              disabled={saveCategory.isPending}
            >
              Speichern
            </button>
          </div>
        }
      >
        <div className="stack">
          <Field label="Name" htmlFor="category-name">
            <input
              id="category-name"
              className="input"
              value={editingCategory?.name ?? ''}
              onChange={(event) =>
                setEditingCategory((current) => ({ ...current, name: event.target.value }))}
            />
          </Field>

          <Field label="Farbe" htmlFor="category-color" hint="Dient nur der Wiedererkennung in Listen">
            <input
              id="category-color"
              type="color"
              className="input"
              style={{ height: 'var(--tap)', padding: 4 }}
              value={editingCategory?.color ?? '#6b7280'}
              onChange={(event) =>
                setEditingCategory((current) => ({ ...current, color: event.target.value }))}
            />
          </Field>
        </div>
      </Sheet>
    </Layout>
  );
}

/** Zwei Pfeile, mit denen ein Eintrag eine Position wandert. */
function ReorderButtons({
  label,
  index,
  count,
  onMove,
}: {
  label: string;
  index: number;
  count: number;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className="reorder">
      <button
        type="button"
        className="reorder__btn"
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <span aria-hidden="true">↑</span>
        <span className="visually-hidden">{label} nach oben</span>
      </button>
      <button
        type="button"
        className="reorder__btn"
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >
        <span aria-hidden="true">↓</span>
        <span className="visually-hidden">{label} nach unten</span>
      </button>
    </div>
  );
}
