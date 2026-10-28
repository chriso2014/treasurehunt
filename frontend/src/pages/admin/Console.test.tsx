import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminTeam, AdminTeamsResponse } from '@treasurehunt/shared';
import * as client from '../../api/client.js';
import { Console } from './Console.js';

vi.mock('../../api/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client.js')>()),
  getAdminTeams: vi.fn(),
  getReviews: vi.fn(),
  decideReview: vi.fn(),
  acceptTextAnswer: vi.fn(),
  setTeamRoute: vi.fn(),
  setTieBreak: vi.fn(),
  startGame: vi.fn(),
  publishResults: vi.fn(),
}));

const team = (overrides: Partial<AdminTeam> = {}): AdminTeam => ({
  teamId: 't1',
  name: 'Winners',
  photoUrl: null,
  route: 'A',
  status: 'finished',
  stage: 3,
  stageCount: 3,
  stageStatus: null,
  totalMs: 600_000,
  timerRunning: false,
  rank: 1,
  wrongAnswers: [],
  ...overrides,
});
const board = (
  teams: AdminTeam[],
  game: AdminTeamsResponse['game'] = { status: 'live', resultsPublished: false },
): AdminTeamsResponse => ({ game, teams });

const renderConsole = () => render(<Console onSignOut={vi.fn()} onAuthError={() => false} />);

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(client.getReviews).mockResolvedValue({ reviews: [] });
  vi.mocked(client.decideReview).mockResolvedValue({ applied: true });
});

describe('GM console', () => {
  it('approves or declines a photo with a reason', async () => {
    vi.mocked(client.getAdminTeams).mockResolvedValue(board([]));
    vi.mocked(client.getReviews).mockResolvedValue({
      reviews: [
        {
          teamId: 't1',
          teamName: 'Trolls',
          stage: 2,
          attemptId: 'a1',
          type: 'photo',
          questionText: 'Troll faces on the bridge',
          photoUrl: 'https://signed/photo.jpg',
          submittedAt: '2026-10-28T12:00:00.000Z',
        },
      ],
    });
    renderConsole();
    expect(await screen.findByText('Troll faces on the bridge')).toBeInTheDocument();
    expect(screen.getByAltText("Trolls's photo")).toHaveAttribute(
      'src',
      'https://signed/photo.jpg',
    );
    await userEvent.type(screen.getByLabelText(/Reason if declining/), 'More trolls');
    await userEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(client.decideReview).toHaveBeenCalledWith('t1', 'a1', {
      decision: 'declined',
      reason: 'More trolls',
    });
  });

  it('starts the game after confirming', async () => {
    vi.mocked(client.getAdminTeams).mockResolvedValue(
      board([team({ status: 'registered', rank: null })], {
        status: 'registration',
        resultsPublished: false,
      }),
    );
    vi.mocked(client.startGame).mockResolvedValue({ status: 'live', teamsStarted: 1 });
    renderConsole();
    await userEvent.click(await screen.findByRole('button', { name: 'Start game' }));
    expect(window.confirm).toHaveBeenCalledWith('Start the game for 1 team(s)?');
    expect(client.startGame).toHaveBeenCalled();
  });

  it('changes a route before the start', async () => {
    vi.mocked(client.getAdminTeams).mockResolvedValue(
      board([team({ status: 'registered', rank: null })], {
        status: 'registration',
        resultsPublished: false,
      }),
    );
    vi.mocked(client.setTeamRoute).mockResolvedValue({ applied: true });
    renderConsole();
    await userEvent.selectOptions(await screen.findByRole('combobox'), 'B');
    expect(client.setTeamRoute).toHaveBeenCalledWith('t1', 'B');
  });

  it('breaks a tie by moving a team above the one with the same time', async () => {
    vi.mocked(client.getAdminTeams).mockResolvedValue(
      board([team(), team({ teamId: 't2', name: 'Dancers', rank: 2 })]),
    );
    vi.mocked(client.setTieBreak).mockResolvedValue({ applied: true });
    renderConsole();
    const rows = await screen.findAllByTestId('team-row');
    expect(within(rows[0]!).queryByRole('button', { name: /Tie/ })).not.toBeInTheDocument();
    await userEvent.click(within(rows[1]!).getByRole('button', { name: /Tie/ }));
    expect(client.setTieBreak).toHaveBeenCalledWith(['t2', 't1']);
  });

  it('accepts a wrong text answer', async () => {
    vi.mocked(client.getAdminTeams).mockResolvedValue(
      board([
        team({
          status: 'playing',
          rank: null,
          stage: 2,
          stageStatus: 'revealed',
          wrongAnswers: [{ attemptId: 'w1', stage: 2, text: '1849', submittedAt: '' }],
        }),
      ]),
    );
    vi.mocked(client.acceptTextAnswer).mockResolvedValue({ applied: true });
    renderConsole();
    await userEvent.click(await screen.findByRole('button', { name: /“1849” · accept/ }));
    expect(client.acceptTextAnswer).toHaveBeenCalledWith('t1', 'w1');
  });

  it('warns about teams still playing before publishing', async () => {
    vi.mocked(client.getAdminTeams).mockResolvedValue(
      board([team(), team({ teamId: 't2', status: 'playing', rank: null })]),
    );
    vi.mocked(client.publishResults).mockResolvedValue({ applied: true });
    renderConsole();
    await userEvent.click(await screen.findByRole('button', { name: 'Publish results' }));
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('1 team(s) are still playing'),
    );
    expect(client.publishResults).toHaveBeenCalled();
  });
});
