import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { StockPage } from './pages/StockPage';
import { ProductPage } from './pages/ProductPage';
import { ProductFormPage } from './pages/ProductFormPage';
import { ShoppingPage } from './pages/ShoppingPage';
import { StatsPage } from './pages/StatsPage';
import { SettingsPage } from './pages/SettingsPage';

// Die Barcode-Bibliothek wiegt einige hundert Kilobyte und wird nur beim
// Scannen gebraucht – deshalb erst dann laden.
const ScanPage = lazy(() => import('./pages/ScanPage').then((m) => ({ default: m.ScanPage })));

export function App() {
  return (
    <Suspense fallback={<div className="app"><main className="app__main"><div className="spinner" /></main></div>}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/bestand" element={<StockPage />} />
        <Route path="/artikel/neu" element={<ProductFormPage />} />
        <Route path="/artikel/:id" element={<ProductPage />} />
        <Route path="/artikel/:id/bearbeiten" element={<ProductFormPage />} />
        <Route path="/scannen" element={<ScanPage />} />
        <Route path="/einkauf" element={<ShoppingPage />} />
        <Route path="/auswertung" element={<StatsPage />} />
        <Route path="/einstellungen" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
