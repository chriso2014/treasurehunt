import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App.js';
import * as client from './api/client.js';

describe('App', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the title and a reachable API', async () => {
    vi.spyOn(client, 'getHealth').mockResolvedValue({ ok: true, env: 'dev', time: 'now' });
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Hitchin Treasure Hunt' })).toBeInTheDocument();
    expect(await screen.findByText('API: ok')).toBeInTheDocument();
  });

  it('says when the API is unreachable', async () => {
    vi.spyOn(client, 'getHealth').mockRejectedValue(new Error('offline'));
    render(<App />);
    expect(await screen.findByText('API: unreachable')).toBeInTheDocument();
  });
});
