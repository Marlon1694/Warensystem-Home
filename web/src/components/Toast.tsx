import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface ToastMessage {
  id: number;
  text: string;
  tone: 'default' | 'critical';
}

interface ToastApi {
  notify: (text: string) => void;
  warn: (text: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Kurze Rückmeldung nach einer Buchung, z. B. "2 l Milch verbraucht". */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<ToastMessage | null>(null);

  const push = useCallback((text: string, tone: ToastMessage['tone']) => {
    setMessage({ id: Date.now(), text, tone });
  }, []);

  const api = useMemo<ToastApi>(() => ({
    notify: (text) => push(text, 'default'),
    warn: (text) => push(text, 'critical'),
  }), [push]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(null), message.tone === 'critical' ? 5000 : 2800);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" aria-atomic="true">
        {message ? (
          <div
            key={message.id}
            className={message.tone === 'critical' ? 'toast toast--critical' : 'toast'}
            role={message.tone === 'critical' ? 'alert' : 'status'}
          >
            {message.text}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast benötigt einen ToastProvider');
  return context;
}
