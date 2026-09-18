import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { IconCart, IconChart, IconHome, IconScan, IconStock } from './Icons';
import { useOverview } from '../api/hooks';

const TABS = [
  { to: '/', label: 'Übersicht', Icon: IconHome, end: true },
  { to: '/bestand', label: 'Bestand', Icon: IconStock, end: false },
  { to: '/scannen', label: 'Scannen', Icon: IconScan, end: false },
  { to: '/einkauf', label: 'Einkauf', Icon: IconCart, end: false },
  { to: '/auswertung', label: 'Auswertung', Icon: IconChart, end: false },
];

interface LayoutProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  leading?: ReactNode;
  children: ReactNode;
}

export function Layout({ title, subtitle, actions, leading, children }: LayoutProps) {
  const overview = useOverview();
  const openShoppingItems = overview.data?.shopping_open ?? 0;

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__header-row">
          {leading}
          <div className="app__title">
            <h1>{title}</h1>
            {subtitle ? <p className="app__subtitle truncate">{subtitle}</p> : null}
          </div>
          {actions}
        </div>
      </header>

      <main className="app__main">{children}</main>

      <nav className="nav" aria-label="Hauptbereiche">
        {TABS.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="nav__item">
            <span className="nav__icon-wrap">
              <Icon size={23} />
              {to === '/einkauf' && openShoppingItems > 0 ? (
                <span className="nav__badge" aria-hidden="true">{openShoppingItems}</span>
              ) : null}
            </span>
            {label}
            {to === '/einkauf' && openShoppingItems > 0 ? (
              <span className="visually-hidden">{openShoppingItems} offene Einträge</span>
            ) : null}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
