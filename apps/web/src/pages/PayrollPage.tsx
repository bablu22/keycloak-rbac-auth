import { useEffect, useState } from 'react';

import { createApiClient } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { RequirePermission } from '../auth/RequireAuth';

export function PayrollPage() {
  return (
    <RequirePermission anyOf={['payroll_view']}>
      <PayrollInner />
    </RequirePermission>
  );
}

function PayrollInner() {
  const { hasPermission } = useAuth();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const api = createApiClient();
    api
      .get('/payroll')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message ?? err.message));
  }, []);

  const runPayroll = async () => {
    const api = createApiClient();
    try {
      const res = await api.post('/payroll/run');
      setMessage(res.data.message);
    } catch {
      setError('Missing payroll_run permission');
    }
  };

  return (
    <section className="page">
      <header className="page-header">
        <h1>Payroll</h1>
        <p>View requires payroll_view. Running requires payroll_run.</p>
      </header>
      {error ? <p className="error-banner">{error}</p> : null}
      {message ? <p className="ok-banner">{message}</p> : null}
      {data ? <pre className="code-panel">{JSON.stringify(data, null, 2)}</pre> : null}
      {hasPermission('payroll_run') ? (
        <button type="button" className="btn btn-primary" onClick={runPayroll}>
          Run payroll
        </button>
      ) : null}
    </section>
  );
}
