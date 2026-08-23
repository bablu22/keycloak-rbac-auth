import { useEffect, useState } from 'react';

import { createApiClient } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { RequirePermission } from '../auth/RequireAuth';

export function ReportsPage() {
  return (
    <RequirePermission anyOf={['report_finance', 'report_sales']}>
      <ReportsInner />
    </RequirePermission>
  );
}

function ReportsInner() {
  const { hasPermission } = useAuth();
  const [finance, setFinance] = useState<unknown>(null);
  const [sales, setSales] = useState<unknown>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const api = createApiClient();
    const tasks: Promise<void>[] = [];

    if (hasPermission('report_finance')) {
      tasks.push(
        api.get('/reports/finance').then((res) => setFinance(res.data)),
      );
    }
    if (hasPermission('report_sales')) {
      tasks.push(api.get('/reports/sales').then((res) => setSales(res.data)));
    }

    Promise.all(tasks).catch((err) =>
      setError(err.response?.data?.message ?? err.message),
    );
  }, [hasPermission]);

  return (
    <section className="page">
      <header className="page-header">
        <h1>Reports</h1>
        <p>Finance and sales reports are separate permissions.</p>
      </header>
      {error ? <p className="error-banner">{error}</p> : null}
      <div className="split">
        {finance ? (
          <pre className="code-panel">{JSON.stringify(finance, null, 2)}</pre>
        ) : null}
        {sales ? (
          <pre className="code-panel">{JSON.stringify(sales, null, 2)}</pre>
        ) : null}
      </div>
    </section>
  );
}
