import { useEffect, useState } from 'react';

/** 95000 → "1:35"; 3_725_000 → "1:02:05". */
export const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

/**
 * A display-only clock that counts up from `baseMs` (the server's value) while `running`.
 * It counts from `receivedAt`, the moment the value arrived on this phone, so a wrong phone clock
 * doesn't matter; every new server response re-syncs it.
 */
export const useTicker = (baseMs: number, running: boolean, receivedAt: number): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  return running ? baseMs + Math.max(0, now - receivedAt) : baseMs;
};
