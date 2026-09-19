import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { BookingSheet, type BookingMode } from '../components/BookingSheet';
import { EmptyState, Field } from '../components/ui';
import { IconAlert, IconCamera, IconCheck, IconPlus, IconTrash } from '../components/Icons';
import { useBarcodeLookup } from '../api/hooks';
import { formatQuantity } from '../lib/format';
import type { BarcodeLookup } from '../types';

/**
 * Scanner-Seite der Browser-Demo. Die Kamera bleibt hier außen vor: in einer
 * eingebetteten Seite gibt kein Browser sie frei, und ein Scanner, der nicht
 * scannt, wäre eine Enttäuschung statt einer Demo. Stattdessen lassen sich
 * Beispielnummern antippen – der Ablauf danach ist derselbe wie im Betrieb.
 */
const SAMPLES = [
  { code: '4000417025005', label: 'Bekannter Artikel', hint: 'liegt schon im Bestand' },
  { code: '4008452010002', label: 'Bekannter Artikel', hint: 'Vollmilch im Kühlschrank' },
  { code: '4311501044179', label: 'Neuer Artikel', hint: 'Vorschlag aus der Produktdatenbank' },
  { code: '7622300441029', label: 'Unbekannter Artikel', hint: 'nirgends hinterlegt' },
];

export function ScanPage() {
  const [manualCode, setManualCode] = useState('');
  const [result, setResult] = useState<BarcodeLookup | null>(null);
  const [booking, setBooking] = useState<BookingMode | null>(null);
  const lookup = useBarcodeLookup();

  async function resolve(code: string) {
    try {
      setResult(await lookup.mutateAsync(code));
    } catch {
      setResult(null);
    }
  }

  const product = result?.product ?? null;

  return (
    <Layout title="Scannen" subtitle="Barcode nachschlagen">
      <div className="stack">
        <div className="notice notice--info" role="note">
          <IconCamera size={18} style={{ flex: 'none', marginTop: 1 }} />
          <div>
            <p style={{ fontWeight: 600 }}>Kamera nur in der installierten App</p>
            <p className="small" style={{ marginTop: 4 }}>
              Browser geben die Kamera in einer eingebetteten Seite nicht frei. Auf dem
              eigenen Server scannst du hier mit der Handykamera. Zum Ausprobieren
              tippe unten eine Beispielnummer an.
            </p>
          </div>
        </div>

        <div className="stack stack--tight">
          {SAMPLES.map((sample) => (
            <button
              key={sample.code}
              type="button"
              className="btn btn--block"
              style={{ justifyContent: 'space-between' }}
              onClick={() => void resolve(sample.code)}
              disabled={lookup.isPending}
            >
              <span>{sample.label}</span>
              <span className="small muted">{sample.hint}</span>
            </button>
          ))}
        </div>

        <form
          className="stack stack--tight"
          onSubmit={(event) => {
            event.preventDefault();
            if (manualCode.trim()) void resolve(manualCode.trim());
          }}
        >
          <Field label="Oder Nummer von Hand eingeben" htmlFor="manual-code">
            <div className="row">
              <input
                id="manual-code"
                className="input"
                inputMode="numeric"
                placeholder="z. B. 4000417025005"
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
              />
              <button type="submit" className="btn" disabled={!manualCode.trim() || lookup.isPending}>
                {lookup.isPending ? <span className="spinner" /> : 'Suchen'}
              </button>
            </div>
          </Field>
        </form>

        {result ? (
          <section className="card card--padded stack" aria-live="polite">
            <p className="small muted numeric">Barcode {result.barcode}</p>

            {product ? (
              <>
                <div>
                  <h2>{product.name}</h2>
                  <p className="small secondary">
                    {product.brand ? `${product.brand} · ` : ''}
                    Bestand: {formatQuantity(product.total_quantity, product.unit)}
                  </p>
                </div>

                <div className="stack stack--tight">
                  <button
                    type="button"
                    className="btn btn--primary btn--block"
                    onClick={() => setBooking('purchase')}
                  >
                    <IconPlus size={18} /> Eingang buchen
                  </button>
                  <div className="btn-row">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setBooking('consume')}
                      disabled={product.total_quantity <= 0}
                    >
                      <IconCheck size={18} /> Verbraucht
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setBooking('waste')}
                      disabled={product.total_quantity <= 0}
                    >
                      <IconTrash size={18} /> Entsorgt
                    </button>
                  </div>
                </div>

                <Link to={`/artikel/${product.id}`} className="btn btn--ghost btn--block">
                  Artikel öffnen
                </Link>
              </>
            ) : (
              <>
                <EmptyState
                  icon={<IconAlert size={28} />}
                  title={result.suggestion ? result.suggestion.name : 'Unbekannter Artikel'}
                  hint={
                    result.suggestion
                      ? `Vorschlag aus der Produktdatenbank${result.suggestion.brand ? ` · ${result.suggestion.brand}` : ''}`
                      : 'Dieser Barcode ist weder im eigenen Bestand noch in der Produktdatenbank bekannt.'
                  }
                />
                <Link
                  className="btn btn--primary btn--block"
                  to={{
                    pathname: '/artikel/neu',
                    search: new URLSearchParams({
                      barcode: result.barcode,
                      name: result.suggestion?.name ?? '',
                      brand: result.suggestion?.brand ?? '',
                    }).toString(),
                  }}
                >
                  <IconPlus size={18} /> Artikel anlegen
                </Link>
              </>
            )}
          </section>
        ) : null}
      </div>

      <BookingSheet
        product={product}
        mode={booking ?? 'purchase'}
        open={booking !== null}
        onClose={() => setBooking(null)}
      />
    </Layout>
  );
}
