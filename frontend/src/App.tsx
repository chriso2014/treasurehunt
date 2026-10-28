import { useEffect, useState } from 'react';
import { getHealth } from './api/client.js';

type ApiStatus = 'checking' | 'ok' | 'unreachable';

export const App = () => {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');

  useEffect(() => {
    getHealth()
      .then(() => setApiStatus('ok'))
      .catch(() => setApiStatus('unreachable'));
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-slate-900 p-6 text-center text-white">
      <h1 className="text-4xl font-bold">Hitchin Treasure Hunt</h1>
      <p className="text-lg text-slate-300">Hello! The game is on its way.</p>
      <p className="text-sm text-slate-400" data-testid="api-status">
        API: {apiStatus}
      </p>
    </main>
  );
};
