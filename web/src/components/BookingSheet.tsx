import { useEffect, useState } from 'react';
import { Sheet } from './Sheet';
import { Field, QuantityStepper } from './ui';
import { useToast } from './Toast';
import { useConsume, useLocations, usePurchase } from '../api/hooks';
import { addDaysIso, formatQuantity } from '../lib/format';
import type { Product } from '../types';

export type BookingMode = 'purchase' | 'consume' | 'waste';

const TITLES: Record<BookingMode, string> = {
  purchase: 'Wareneingang buchen',
  consume: 'Verbrauch buchen',
  waste: 'Entsorgung buchen',
};

const CONFIRMATIONS: Record<BookingMode, string> = {
  purchase: 'eingelagert',
  consume: 'verbraucht',
  waste: 'entsorgt',
};

interface BookingSheetProps {
  product: Product | null;
  mode: BookingMode;
  open: boolean;
  onClose: () => void;
  /** Vorbelegter Posten, z. B. beim Buchen direkt aus der Ablaufliste. */
  stockItemId?: number | null;
  defaultQuantity?: number;
}

export function BookingSheet({
  product,
  mode,
  open,
  onClose,
  stockItemId = null,
  defaultQuantity,
}: BookingSheetProps) {
  const locations = useLocations();
  const purchase = usePurchase();
  const consume = useConsume();
  const toast = useToast();

  const [quantity, setQuantity] = useState(1);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [bestBefore, setBestBefore] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Bei jedem Öffnen sinnvoll vorbelegen statt alte Eingaben stehen zu lassen.
  useEffect(() => {
    if (!open || !product) return;

    setQuantity(defaultQuantity ?? (mode === 'purchase' ? (product.package_size ?? 1) : 1));
    setLocationId(product.default_location_id);
    setBestBefore(
      mode === 'purchase' && product.default_shelf_life_days
        ? addDaysIso(product.default_shelf_life_days)
        : '',
    );
    setPrice('');
    setError(null);
  }, [open, product, mode, defaultQuantity]);

  if (!product) return null;

  const pending = purchase.isPending || consume.isPending;
  const maxQuantity = mode === 'purchase' ? Infinity : product.total_quantity;
  const tooMuch = quantity > maxQuantity;

  async function submit() {
    if (!product) return;
    setError(null);

    try {
      if (mode === 'purchase') {
        await purchase.mutateAsync({
          product_id: product.id,
          quantity,
          location_id: locationId,
          best_before: bestBefore || null,
          price: price ? Number(price.replace(',', '.')) : null,
        });
      } else {
        await consume.mutateAsync({
          product_id: product.id,
          quantity,
          type: mode,
          stock_item_id: stockItemId,
        });
      }

      toast.notify(`${formatQuantity(quantity, product.unit)} ${product.name} ${CONFIRMATIONS[mode]}`);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Buchung fehlgeschlagen');
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={TITLES[mode]}
      description={`${product.name}${product.brand ? ` · ${product.brand}` : ''}`}
      footer={
        <div className="btn-row">
          <button type="button" className="btn" onClick={onClose} disabled={pending}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={submit}
            disabled={pending || quantity <= 0 || tooMuch}
          >
            {pending ? <span className="spinner" /> : 'Buchen'}
          </button>
        </div>
      }
    >
      <div className="stack">
        {mode !== 'purchase' ? (
          <p className="small secondary">
            Vorhanden: <strong className="numeric">{formatQuantity(product.total_quantity, product.unit)}</strong>
            {' · '}Abgebucht wird zuerst, was zuerst abläuft.
          </p>
        ) : null}

        <Field label={`Menge in ${product.unit}`}>
          <QuantityStepper
            value={quantity}
            unit={product.unit}
            step={product.package_size ?? 1}
            min={0}
            onChange={setQuantity}
          />
        </Field>

        {tooMuch ? (
          <p className="notice notice--warning">
            Es sind nur {formatQuantity(product.total_quantity, product.unit)} vorhanden.
          </p>
        ) : null}

        {mode === 'purchase' ? (
          <>
            <Field label="Lagerort" htmlFor="booking-location">
              <select
                id="booking-location"
                className="select"
                value={locationId ?? ''}
                onChange={(event) => setLocationId(event.target.value ? Number(event.target.value) : null)}
              >
                <option value="">Bitte wählen</option>
                {locations.data?.map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </Field>

            <div className="field-row">
              <Field label="Mindestens haltbar bis" htmlFor="booking-mhd">
                <input
                  id="booking-mhd"
                  type="date"
                  className="input"
                  value={bestBefore}
                  onChange={(event) => setBestBefore(event.target.value)}
                />
              </Field>

              <Field label="Preis (optional)" htmlFor="booking-price" hint="Für die Wertauswertung">
                <input
                  id="booking-price"
                  type="text"
                  inputMode="decimal"
                  className="input"
                  placeholder="z. B. 1,49"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                />
              </Field>
            </div>
          </>
        ) : null}

        {error ? <p className="notice notice--critical" role="alert">{error}</p> : null}
      </div>
    </Sheet>
  );
}
