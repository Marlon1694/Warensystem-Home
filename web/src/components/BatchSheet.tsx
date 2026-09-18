import { useEffect, useState } from 'react';
import { Sheet } from './Sheet';
import { Field, QuantityStepper } from './ui';
import { useToast } from './Toast';
import { useDeleteBatch, useLocations, useMoveBatch, useUpdateBatch } from '../api/hooks';
import { formatQuantity } from '../lib/format';
import type { StockBatch } from '../types';

interface BatchSheetProps {
  batch: StockBatch | null;
  open: boolean;
  onClose: () => void;
}

/** Einzelnen Bestandsposten korrigieren, umlagern oder entfernen. */
export function BatchSheet({ batch, open, onClose }: BatchSheetProps) {
  const locations = useLocations();
  const updateBatch = useUpdateBatch();
  const moveBatch = useMoveBatch();
  const deleteBatch = useDeleteBatch();
  const toast = useToast();

  const [quantity, setQuantity] = useState(1);
  const [bestBefore, setBestBefore] = useState('');
  const [opened, setOpened] = useState(false);
  const [targetLocation, setTargetLocation] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !batch) return;
    setQuantity(batch.quantity);
    setBestBefore(batch.best_before ?? '');
    setOpened(batch.opened);
    setTargetLocation(batch.location_id);
    setError(null);
  }, [open, batch]);

  if (!batch) return null;

  const pending = updateBatch.isPending || moveBatch.isPending || deleteBatch.isPending;
  const locationChanged = targetLocation !== null && targetLocation !== batch.location_id;

  async function save() {
    if (!batch) return;
    setError(null);

    try {
      // Ortswechsel läuft über die Umlagerungsbuchung, damit die Bewegung im
      // Journal auftaucht; alles Übrige ist eine Korrektur am Posten.
      if (locationChanged) {
        await moveBatch.mutateAsync({
          stock_item_id: batch.id,
          to_location_id: targetLocation as number,
          quantity: Math.min(quantity, batch.quantity),
        });
      }

      if (!locationChanged || quantity !== batch.quantity || bestBefore !== (batch.best_before ?? '') || opened !== batch.opened) {
        await updateBatch.mutateAsync({
          id: batch.id,
          quantity,
          best_before: bestBefore || null,
          opened,
        });
      }

      toast.notify('Posten aktualisiert');
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Speichern fehlgeschlagen');
    }
  }

  async function remove() {
    if (!batch) return;
    if (!window.confirm(
      `Posten mit ${formatQuantity(batch.quantity, batch.unit)} ersatzlos entfernen? ` +
      'Für Verbrauch oder Entsorgung stattdessen die Buchung nutzen, damit die Statistik stimmt.',
    )) return;

    try {
      await deleteBatch.mutateAsync(batch.id);
      toast.notify('Posten entfernt');
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Entfernen fehlgeschlagen');
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Posten bearbeiten"
      description={`${formatQuantity(batch.quantity, batch.unit)} in ${batch.location_name}`}
      footer={
        <div className="stack stack--tight">
          <div className="btn-row">
            <button type="button" className="btn" onClick={onClose} disabled={pending}>Abbrechen</button>
            <button type="button" className="btn btn--primary" onClick={save} disabled={pending}>
              {pending ? <span className="spinner" /> : 'Speichern'}
            </button>
          </div>
          <button type="button" className="btn btn--danger btn--block" onClick={remove} disabled={pending}>
            Posten entfernen
          </button>
        </div>
      }
    >
      <div className="stack">
        <Field label={`Menge in ${batch.unit}`}>
          <QuantityStepper value={quantity} unit={batch.unit} onChange={setQuantity} />
        </Field>

        <Field label="Lagerort" htmlFor="batch-location" hint={locationChanged ? 'Wird als Umlagerung gebucht.' : undefined}>
          <select
            id="batch-location"
            className="select"
            value={targetLocation ?? ''}
            onChange={(event) => setTargetLocation(Number(event.target.value))}
          >
            {locations.data?.map((location) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Mindestens haltbar bis" htmlFor="batch-mhd">
          <input
            id="batch-mhd"
            type="date"
            className="input"
            value={bestBefore}
            onChange={(event) => setBestBefore(event.target.value)}
          />
        </Field>

        <label className="row" style={{ gap: 'var(--space-2)' }}>
          <input
            type="checkbox"
            checked={opened}
            onChange={(event) => setOpened(event.target.checked)}
            style={{ width: 20, height: 20 }}
          />
          <span>Angebrochen – wird beim Verbrauch zuerst abgebucht</span>
        </label>

        {error ? <p className="notice notice--critical" role="alert">{error}</p> : null}
      </div>
    </Sheet>
  );
}
