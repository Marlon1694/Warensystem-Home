import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import type { IScannerControls } from '@zxing/browser';
import { Layout } from '../components/Layout';
import { BookingSheet, type BookingMode } from '../components/BookingSheet';
import { EmptyState, Field } from '../components/ui';
import { IconAlert, IconCamera, IconCheck, IconPlus, IconScan, IconTrash } from '../components/Icons';
import { useBarcodeLookup } from '../api/hooks';
import { formatQuantity } from '../lib/format';
import type { BarcodeLookup } from '../types';

/** Handelsübliche Strichcodes auf Lebensmitteln – enge Auswahl scannt schneller. */
const FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
];

export function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [result, setResult] = useState<BarcodeLookup | null>(null);
  const [booking, setBooking] = useState<BookingMode | null>(null);

  const lookup = useBarcodeLookup();

  // iOS Safari gibt die Kamera nur über HTTPS oder auf localhost frei.
  const secure = typeof window !== 'undefined' && window.isSecureContext;

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  }, []);

  const handleCode = useCallback(async (code: string) => {
    stopCamera();
    navigator.vibrate?.(40);

    try {
      setResult(await lookup.mutateAsync(code));
    } catch {
      setCameraError('Der Barcode konnte nicht nachgeschlagen werden.');
    }
  }, [lookup, stopCamera]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setResult(null);

    if (!secure) {
      setCameraError('unsecure');
      return;
    }

    try {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
      const reader = new BrowserMultiFormatReader(hints);

      setScanning(true);
      controlsRef.current = await reader.decodeFromConstraints(
        // Rückkamera bevorzugen – die Frontkamera taugt zum Scannen nicht.
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current as HTMLVideoElement,
        (decoded) => {
          if (decoded) void handleCode(decoded.getText());
        },
      );
    } catch (error) {
      setScanning(false);
      const name = error instanceof Error ? error.name : '';
      setCameraError(
        name === 'NotAllowedError'
          ? 'Der Kamerazugriff wurde abgelehnt. In den Browsereinstellungen für diese Seite erlauben.'
          : name === 'NotFoundError'
            ? 'Auf diesem Gerät wurde keine Kamera gefunden.'
            : 'Die Kamera konnte nicht gestartet werden.',
      );
    }
  }, [handleCode, secure]);

  useEffect(() => stopCamera, [stopCamera]);

  const product = result?.product ?? null;

  return (
    <Layout title="Scannen" subtitle="Barcode aufnehmen oder Nummer eingeben">
      <div className="stack">
        {/* Kamerabild ---------------------------------------------------- */}
        <div
          className="card"
          style={{
            position: 'relative',
            aspectRatio: '4 / 3',
            overflow: 'hidden',
            background: '#000',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: scanning ? 'block' : 'none',
            }}
          />

          {scanning ? (
            <div
              aria-hidden="true"
              style={{
                position: 'relative',
                width: '78%',
                height: '38%',
                border: '2px solid rgba(255,255,255,0.9)',
                borderRadius: 12,
                boxShadow: '0 0 0 2000px rgba(0,0,0,0.28)',
              }}
            />
          ) : (
            <div style={{ color: '#fff', textAlign: 'center', padding: 'var(--space-4)' }}>
              <IconCamera size={34} />
              <p className="small" style={{ marginTop: 8, opacity: 0.85 }}>
                Kamera ist aus
              </p>
            </div>
          )}
        </div>

        {scanning ? (
          <button type="button" className="btn btn--block" onClick={stopCamera}>
            Scannen beenden
          </button>
        ) : (
          <button type="button" className="btn btn--primary btn--block" onClick={() => void startCamera()}>
            <IconScan size={18} /> Kamera starten
          </button>
        )}

        {/* Hinweis, wenn der sichere Kontext fehlt ------------------------ */}
        {cameraError === 'unsecure' ? (
          <div className="notice notice--warning" role="alert">
            <IconAlert size={18} style={{ flex: 'none', marginTop: 1 }} />
            <div>
              <p style={{ fontWeight: 600 }}>Kamera nur über HTTPS</p>
              <p className="small" style={{ marginTop: 4 }}>
                Safari auf iPhone und iPad gibt die Kamera nur in einer gesicherten Verbindung frei.
                Der Server bringt dafür ein eigenes Zertifikat mit – siehe README, Abschnitt
                „Barcode-Scanner auf dem iPhone“. Die Nummer lässt sich solange von Hand eintippen.
              </p>
            </div>
          </div>
        ) : cameraError ? (
          <div className="notice notice--critical" role="alert">
            <IconAlert size={18} style={{ flex: 'none', marginTop: 1 }} />
            <p>{cameraError}</p>
          </div>
        ) : null}

        {/* Eingabe von Hand ---------------------------------------------- */}
        <form
          className="stack stack--tight"
          onSubmit={(event) => {
            event.preventDefault();
            if (manualCode.trim()) void handleCode(manualCode.trim());
          }}
        >
          <Field label="Barcode von Hand eingeben" htmlFor="manual-code">
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

        {/* Ergebnis ------------------------------------------------------- */}
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
                  title={result.suggestion ? result.suggestion.name : 'Unbekannter Artikel'}
                  hint={
                    result.suggestion
                      ? `Vorschlag aus der Open-Food-Facts-Datenbank${result.suggestion.brand ? ` · ${result.suggestion.brand}` : ''}`
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

            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={() => {
                setResult(null);
                setManualCode('');
                void startCamera();
              }}
            >
              Nächsten Barcode scannen
            </button>
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
