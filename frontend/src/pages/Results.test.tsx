import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as client from '../api/client.js';
import { Results } from './Results.js';

vi.mock('../api/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client.js')>()),
  getResults: vi.fn(),
}));

describe('Results', () => {
  it('says the results are not out yet before publishing', async () => {
    vi.mocked(client.getResults).mockRejectedValue(new client.ApiError('NOT_FOUND', 'x'));
    render(<Results />);
    expect(await screen.findByText(/aren’t out yet/)).toBeInTheDocument();
  });

  it('lists teams in rank order with their times', async () => {
    vi.mocked(client.getResults).mockResolvedValue({
      title: 'Hitchin Treasure Hunt',
      teams: [
        { rank: 1, name: 'Winners', photoUrl: null, totalMs: 3_600_000, finished: true },
        { rank: null, name: 'Stragglers', photoUrl: null, totalMs: 100, finished: false },
      ],
    });
    render(<Results />);
    const items = await screen.findAllByRole('listitem');
    expect(items[0]).toHaveTextContent('1Winners1:00:00');
    expect(items[1]).toHaveTextContent('Didn’t finish');
  });
});
