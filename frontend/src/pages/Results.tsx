import { useCallback, useEffect, useState } from 'react';
import type { ResultsResponse } from '@treasurehunt/shared';
import { ApiError, getResults } from '../api/client.js';
import { Button, ErrorMessage, SafeImage, Screen } from '../components/ui.js';
import { errorText } from '../lib/errors.js';
import { formatDuration } from '../lib/time.js';

// Public /results page, available once the GM publishes.
export const Results = () => {
  const [results, setResults] = useState<ResultsResponse | 'not-yet'>();
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await getResults();
      setResults(() => res);
      setError(() => '');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOT_FOUND') setResults(() => 'not-yet');
      else setError(() => errorText(err));
    }
  }, []);
  useEffect(() => void load(), [load]);

  if (results === undefined || results === 'not-yet') {
    return (
      <Screen title="Results">
        {results === 'not-yet' && (
          <p className="text-center text-xl">The results aren’t out yet. Check back soon!</p>
        )}
        <ErrorMessage>{error}</ErrorMessage>
        {(results === 'not-yet' || error) && <Button onClick={() => void load()}>Refresh</Button>}
      </Screen>
    );
  }

  return (
    <Screen title={results.title}>
      <ol className="flex flex-col gap-3">
        {results.teams.map((t) => (
          <li key={t.name} className="flex items-center gap-4 rounded-2xl bg-slate-800 p-3">
            <span className="w-10 text-center text-3xl font-bold text-amber-300">
              {t.rank ?? '–'}
            </span>
            {t.photoUrl && (
              <SafeImage src={t.photoUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
            )}
            <span className="flex-1 text-xl font-semibold">{t.name}</span>
            <span className="text-right font-mono text-lg">
              {t.finished ? formatDuration(t.totalMs) : 'Didn’t finish'}
            </span>
          </li>
        ))}
      </ol>
    </Screen>
  );
};
