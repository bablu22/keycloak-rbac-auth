import { useEffect, useState } from 'react';

import { createApiClient } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { RequirePermission } from '../auth/RequireAuth';

type StockItem = { sku: string; name: string; qty: number };

export function InventoryPage() {
  return (
    <RequirePermission anyOf={['inventory_view']}>
      <InventoryInner />
    </RequirePermission>
  );
}

function InventoryInner() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<StockItem[]>([]);
  const [error, setError] = useState('');

  const load = async () => {
    const api = createApiClient();
    const { data } = await api.get<StockItem[]>('/inventory');
    setRows(data);
  };

  useEffect(() => {
    load().catch((err) => setError(err.response?.data?.message ?? err.message));
  }, []);

  const adjust = async (sku: string, delta: number) => {
    const api = createApiClient();
    try {
      await api.patch('/inventory/adjust', { sku, delta });
      await load();
    } catch {
      setError('Missing inventory_adjust permission');
    }
  };

  return (
    <section className="page">
      <header className="page-header">
        <h1>Inventory</h1>
        <p>Warehouse roles can adjust stock levels.</p>
      </header>
      {error ? <p className="error-banner">{error}</p> : null}
      <table className="data-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Name</th>
            <th>Qty</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.sku}>
              <td>{row.sku}</td>
              <td>{row.name}</td>
              <td>{row.qty}</td>
              <td className="row-actions">
                {hasPermission('inventory_adjust') ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => adjust(row.sku, 1)}
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => adjust(row.sku, -1)}
                    >
                      -1
                    </button>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
