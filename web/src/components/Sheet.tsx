import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './Icons';

interface SheetProps {
  title: string;
  description?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Von unten einfahrender Dialog – auf dem Handy die naheliegende Form, am
 * Rechner mittig. Schließt per Escape und per Tippen auf den Hintergrund.
 */
export function Sheet({ title, description, open, onClose, children, footer }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * Fokus in den Dialog holen und den Hintergrund festhalten – beides hängt
   * allein am Öffnen.
   *
   * onClose darf hier nicht in die Abhängigkeiten: die aufrufenden Seiten
   * übergeben eine direkt geschriebene Funktion, die bei jedem Neuzeichnen
   * eine neue ist. Beim Tippen zeichnet die Seite nach jedem Zeichen neu,
   * der Effekt liefe erneut und zöge den Fokus aus dem Eingabefeld – auf dem
   * iPhone schließt sich dabei jedes Mal die Tastatur.
   */
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Der Escape-Griff darf sich an ein neues onClose binden – das rührt den
  // Fokus nicht an.
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="sheet"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="sheet__grip" />
        <div className="sheet__header">
          <div>
            <h2>{title}</h2>
            {description ? <p className="small secondary">{description}</p> : null}
          </div>
          <button type="button" className="btn btn--ghost btn--icon" onClick={onClose}>
            <IconClose />
            <span className="visually-hidden">Schließen</span>
          </button>
        </div>

        {children}

        {footer ? <div style={{ marginTop: 'var(--space-4)' }}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
