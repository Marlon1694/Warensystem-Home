import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { installDemoServer } from './mock-server';
import { App } from '../App';
import { ToastProvider } from '../components/Toast';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';

// Muss vor dem ersten Datenabruf stehen.
installDemoServer();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, retry: 0, refetchOnWindowFocus: false },
  },
});

const container = document.getElementById('root');
if (!container) throw new Error('Wurzelelement #root fehlt');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* MemoryRouter statt BrowserRouter: die Demo läuft eingebettet und darf
          die Adresszeile der umgebenden Seite nicht verändern. */}
      <MemoryRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);
