import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import {
  CategoryDot,
  ChipGroup,
  EmptyState,
  ErrorNotice,
  ExpiryBadge,
  ListSkeleton,
  SearchInput,
} from '../components/ui';
import { IconChevron, IconPlus, IconStock } from '../components/Icons';
import { useExpiring, useLocations, useOverview, useProducts } from '../api/hooks';
import { formatQuantity } from '../lib/format';

type StateFilter = 'alle' | 'bald' | 'abgelaufen' | 'mindestbestand';

const STATE_OPTIONS: Array<{ value: StateFilter; label: string }> = [
  { value: 'alle', label: 'Alle' },
  { value: 'bald', label: 'Läuft bald ab' },
  { value: 'abgelaufen', label: 'Abgelaufen' },
  { value: 'mindestbestand', label: 'Unter Mindestbestand' },
];

export function StockPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const locationId = params.get('ort') ? Number(params.get('ort')) : null;
  const stateFilter = (params.get('filter') as StateFilter | null) ?? 'alle';

  const locations = useLocations();
  const overview = useOverview();
  const warnDays = overview.data?.warn_days ?? 5;

  const showsBatches = stateFilter === 'bald' || stateFilter === 'abgelaufen';

  const products = useProducts({
    location: locationId,
    search,
    inStock: stateFilter !== 'mindestbestand',
  });
  const expiring = useExpiring(stateFilter === 'abgelaufen' ? 0 : undefined);

  const visibleProducts = useMemo(() => {
    if (!products.data) return [];
    if (stateFilter === 'mindestbestand') return products.data.filter((item) => item.below_min_stock);
    return products.data;
  }, [products.data, stateFilter]);

  const visibleBatches = useMemo(() => {
    if (!expiring.data) return [];

    return expiring.data.filter((batch) => {
      if (locationId && batch.location_id !== locationId) return false;
      if (search && !batch.product_name.toLowerCase().includes(search.toLowerCase())) return false;
      return stateFilter === 'abgelaufen' ? batch.days_left < 0 : true;
    });
  }, [expiring.data, locationId, search, stateFilter]);

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  const locationName = locations.data?.find((item) => item.id === locationId)?.name;
  const isLoading = showsBatches ? expiring.isPending : products.isPending;
  const error = showsBatches ? expiring.error : products.error;

  return (
    <Layout
      title="Bestand"
      subtitle={locationName ?? 'Alle Lagerorte'}
      actions={
        <Link to="/artikel/neu" className="btn btn--primary btn--icon">
          <IconPlus />
          <span className="visually-hidden">Artikel anlegen</span>
        </Link>
      }
    >
      <div className="stack">
        <SearchInput value={search} onChange={setSearch} placeholder="Artikel suchen …" />

        <ChipGroup
          label="Lagerort"
          value={locationId}
          onChange={(value) => updateParam('ort', value === null ? null : String(value))}
          options={[
            { value: null, label: 'Alle Orte' },
            ...(locations.data ?? []).map((location) => ({
              value: location.id,
              label: location.name,
            })),
          ]}
        />

        <ChipGroup
          label="Zustand"
          value={stateFilter}
          onChange={(value) => updateParam('filter', value === 'alle' ? null : value)}
          options={STATE_OPTIONS}
        />

        {error ? (
          <ErrorNotice
            error={error}
            onRetry={() => void (showsBatches ? expiring.refetch() : products.refetch())}
          />
        ) : null}

        {isLoading ? <ListSkeleton rows={6} /> : null}

        {/* Bei Haltbarkeitsfiltern zählt der einzelne Posten, sonst der Artikel. */}
        {!isLoading && showsBatches ? (
          visibleBatches.length === 0 ? (
            <div className="card">
              <EmptyState
                title={stateFilter === 'abgelaufen' ? 'Nichts ist abgelaufen' : 'Nichts läuft bald ab'}
                hint="Gut gewirtschaftet."
              />
            </div>
          ) : (
            <ul className="list">
              {visibleBatches.map((batch) => (
                <li key={batch.id}>
                  <button
                    type="button"
                    className="list__item"
                    onClick={() => navigate(`/artikel/${batch.product_id}`)}
                  >
                    <div className="list__body">
                      <div className="list__title">{batch.product_name}</div>
                      <div className="list__meta">
                        <CategoryDot color={batch.category_color} />
                        <span className="truncate">{batch.location_name}</span>
                      </div>
                      <div style={{ marginTop: 5 }}>
                        <ExpiryBadge bestBefore={batch.best_before} warnDays={warnDays} />
                      </div>
                    </div>
                    <span className="list__value">{formatQuantity(batch.quantity, batch.unit)}</span>
                    <IconChevron size={16} className="list__chevron" />
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {!isLoading && !showsBatches ? (
          visibleProducts.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<IconStock size={30} />}
                title={search ? 'Kein Treffer' : 'Noch nichts erfasst'}
                hint={
                  search
                    ? 'Andere Schreibweise versuchen oder den Artikel neu anlegen.'
                    : 'Artikel anlegen oder einen Barcode scannen, um loszulegen.'
                }
                action={
                  <Link to="/artikel/neu" className="btn btn--primary">
                    <IconPlus size={18} /> Artikel anlegen
                  </Link>
                }
              />
            </div>
          ) : (
            <ul className="list">
              {visibleProducts.map((product) => (
                <li key={product.id}>
                  <Link to={`/artikel/${product.id}`} className="list__item">
                    <div className="list__body">
                      <div className="list__title">{product.name}</div>
                      <div className="list__meta">
                        <CategoryDot color={product.category_color} />
                        <span className="truncate">
                          {product.category_name ?? 'Ohne Kategorie'}
                          {product.brand ? ` · ${product.brand}` : ''}
                        </span>
                      </div>
                      {product.below_min_stock ? (
                        <div style={{ marginTop: 5 }}>
                          <span className="badge badge--warning">
                            Mindestbestand {formatQuantity(product.min_stock, product.unit)}
                          </span>
                        </div>
                      ) : product.next_best_before ? (
                        <div style={{ marginTop: 5 }}>
                          <ExpiryBadge bestBefore={product.next_best_before} warnDays={warnDays} />
                        </div>
                      ) : null}
                    </div>
                    <span className="list__value">
                      {formatQuantity(product.total_quantity, product.unit)}
                    </span>
                    <IconChevron size={16} className="list__chevron" />
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </Layout>
  );
}
