import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TeamState } from '@treasurehunt/shared';
import { Finished } from './Finished.js';

const state: TeamState = {
  game: { status: 'live' },
  team: {
    name: 'The Wanderers',
    route: 'A',
    status: 'finished',
    photoUrl: null,
    stage: 2,
    stageCount: 2,
    totalMs: 1_080_000,
  },
  current: null,
  completedLocations: [],
  map: { centre: { lat: 51.949, lng: -0.28 }, zoom: 15 },
  serverTime: '2026-10-28T10:00:00.000Z',
  results: [
    { stage: 1, outcome: 'correct', timeMs: 120_000, penaltyMs: 0, penalties: [] },
    {
      stage: 2,
      outcome: 'skipped',
      timeMs: 60_000,
      penaltyMs: 900_000,
      penalties: [
        { kind: 'wrong', count: 1, ms: 300_000 },
        { kind: 'hint', count: 1, ms: 300_000 },
        { kind: 'skip', count: 1, ms: 300_000 },
      ],
    },
  ],
};

describe('Finished', () => {
  it('shows each question’s time and penalties under “See more about your time”', async () => {
    render(<Finished state={state} />);
    expect(screen.getByText('18:00')).toBeInTheDocument();
    await userEvent.click(screen.getByText('See more about your time'));
    const [q1, q2] = screen.getAllByRole('listitem');
    expect(within(q1!).getByText('Question 1')).toBeInTheDocument();
    expect(within(q1!).getByText('No penalties')).toBeInTheDocument();
    expect(q2).toHaveTextContent('Question 216:00');
    expect(q2).toHaveTextContent('Time taken1:00');
    expect(q2).toHaveTextContent('Wrong answer+5:00');
    expect(q2).toHaveTextContent('Hint+5:00');
    expect(q2).toHaveTextContent('Skipped+5:00');
  });
});
