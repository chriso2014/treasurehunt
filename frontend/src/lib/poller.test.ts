import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePolling } from './poller.js';

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('usePolling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    setHidden(false);
  });

  it('polls on the interval and stops when disabled', () => {
    const fn = vi.fn();
    const { rerender } = renderHook(({ ms }) => usePolling(fn, ms), {
      initialProps: { ms: 5000 as number | null },
    });
    vi.advanceTimersByTime(10_000);
    expect(fn).toHaveBeenCalledTimes(2);
    rerender({ ms: null });
    vi.advanceTimersByTime(10_000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('pauses while hidden and fetches at once when shown again', () => {
    const fn = vi.fn();
    renderHook(() => usePolling(fn, 5000));
    setHidden(true);
    vi.advanceTimersByTime(20_000);
    expect(fn).not.toHaveBeenCalled();
    setHidden(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('fetches when the network comes back', () => {
    const fn = vi.fn();
    renderHook(() => usePolling(fn, 5000));
    window.dispatchEvent(new Event('online'));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
