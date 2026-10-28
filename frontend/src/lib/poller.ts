import { useEffect, useRef } from 'react';

/**
 * The only place polling happens (ADR-007). Calls `fn` every `intervalMs` while `intervalMs` is
 * set, pauses while the page is hidden, and calls it at once when the page is shown again or the
 * network comes back.
 */
export const usePolling = (fn: () => unknown, intervalMs: number | null): void => {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    if (intervalMs === null) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => void fnRef.current();
    const start = () => {
      if (timer === undefined) timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        tick();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', tick);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', tick);
    };
  }, [intervalMs]);
};
