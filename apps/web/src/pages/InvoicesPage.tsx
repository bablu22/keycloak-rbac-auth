import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { createApiClient } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { RequirePermission } from '../auth/RequireAuth';

type Invoice = {
  id: string;
  vendor: string;
  amount: number;
  status: string;
};

export function InvoicesPage() {
  return (
    <RequirePermission anyOf={['invoice_read']}>
      <InvoicesInner />
    </RequirePermission>
  );
}

function InvoicesInner() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('100');
  const [error, setError] = useState('');

  const load = async () => {
    const api = createApiClient();
    const { data } = await api.get<Invoice[]>('/invoices');
    setRows(data);
  };

  useEffect(() => {
    load().catch((err) => setError(err.response?.data?.message ?? err.message));
  }, []);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const api = createApiClient();
    try {
      await api.post('/invoices', { vendor, amount: Number(amount) });
      setVendor('');
      await load();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      setError(
        status === 403
          ? 'Missing invoice_create permission'
          : 'Create failed',
      );
    }
  };

  const approve = async (id: string) => {
    const api = createApiClient();
    try {
      await api.post(`/invoices/${id}/approve`);
      await load();
    } catch {
      setError('Missing invoice_approve permission');
    }
  };

  const remove = async (id: string) => {
    const api = createApiClient();
    try {
      await api.delete(`/invoices/${id}`);
      await load();
    } catch {
      setError('Missing invoice_delete permission');
    }
  };

  return (
    <section className="page">
      <header className="page-header">
        <h1>Invoices</h1>
        <p>Guarded by nest-api client roles on every request.</p>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}

      {hasPermission('invoice_create') ? (
        <form className="inline-form" onSubmit={onCreate}>
          <input
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="Vendor"
            required
          />
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            min="1"
            step="0.01"
            required
          />
          <button type="submit" className="btn btn-primary">
            Create
          </button>
        </form>
      ) : null}

      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Vendor</th>
            <th>Amount</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.id}</td>
              <td>{row.vendor}</td>
              <td>{row.amount.toFixed(2)}</td>
              <td>{row.status}</td>
              <td className="row-actions">
                {hasPermission('invoice_approve') && row.status !== 'approved' ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => approve(row.id)}
                  >
                    Approve
                  </button>
                ) : null}
                {hasPermission('invoice_delete') ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => remove(row.id)}
                  >
                    Delete
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
