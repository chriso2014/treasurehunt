import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TeamState } from '@treasurehunt/shared';
import { App } from './App.js';
import * as client from './api/client.js';
import * as auth from './auth/index.js';
import { usePolling } from './lib/poller.js';

vi.mock('./auth/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./auth/index.js')>()),
  getAccessToken: vi.fn(),
  signInTeam: vi.fn(),
  signOutTeam: vi.fn(),
}));
vi.mock('./lib/poller.js', () => ({ usePolling: vi.fn() }));
vi.mock('./pages/Play.js', () => ({ Play: () => <p>Playing</p> }));
vi.mock('./api/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/client.js')>()),
  getState: vi.fn(),
  registerTeam: vi.fn(),
}));

const state = (overrides: Partial<TeamState['team']> = {}, game = 'registration'): TeamState => ({
  game: { status: game as TeamState['game']['status'] },
  team: {
    name: 'The Wanderers',
    route: 'A',
    status: 'registered',
    photoUrl: 'https://p',
    stage: 1,
    stageCount: 4,
    totalMs: 0,
    ...overrides,
  },
  current: null,
  completedLocations: [],
  map: { centre: { lat: 51.949, lng: -0.28 }, zoom: 15 },
  results: [],
});

beforeEach(() => {
  vi.mocked(auth.getAccessToken).mockResolvedValue('token');
  vi.mocked(client.getState).mockResolvedValue(state());
});

describe('App', () => {
  it('shows registration when signed out', async () => {
    vi.mocked(auth.getAccessToken).mockResolvedValue(undefined);
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Register team' })).toBeInTheDocument();
  });

  it('asks for a team photo when the team has none', async () => {
    vi.mocked(client.getState).mockResolvedValue(state({ photoUrl: null }));
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Take photo' })).toBeInTheDocument();
  });

  it('shows the waiting screen with the photo after registration', async () => {
    render(<App />);
    expect(await screen.findByText('You’re registered!')).toBeInTheDocument();
    expect(screen.getByAltText('Team photo')).toHaveAttribute('src', 'https://p');
  });

  it('moves on when the game has started', async () => {
    vi.mocked(client.getState).mockResolvedValue(state({ status: 'playing' }, 'live'));
    render(<App />);
    expect(await screen.findByText('The game has started!')).toBeInTheDocument();
  });

  it('sends a team whose session expired to sign in', async () => {
    vi.mocked(client.getState).mockRejectedValue(new client.ApiError('UNAUTHENTICATED', 'x'));
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('Register', () => {
  beforeEach(() => vi.mocked(auth.getAccessToken).mockResolvedValue(undefined));

  const fill = async (name: string, password: string) => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('Team name'), name);
    await user.type(screen.getByLabelText(/Password/), password);
    await user.click(screen.getByRole('button', { name: 'Register team' }));
  };

  it('checks the form before calling the API', async () => {
    await fill('The Wanderers', 'short');
    expect(await screen.findByRole('alert')).toHaveTextContent('at least 8 characters');
    expect(client.registerTeam).not.toHaveBeenCalled();
  });

  it('disables the button while registering, then signs in', async () => {
    let finish: () => void = () => {};
    vi.mocked(client.registerTeam).mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve({ teamId: 't', slug: 'the-wanderers', route: 'A' });
      }),
    );
    await fill('The Wanderers', 'password1');
    expect(screen.getByRole('button', { name: 'Please wait…' })).toBeDisabled();
    finish();
    await vi.waitFor(() =>
      expect(auth.signInTeam).toHaveBeenCalledWith('The Wanderers', 'password1'),
    );
  });

  it('treats a taken name with the right password as a retry', async () => {
    vi.mocked(client.registerTeam).mockRejectedValue(
      new client.ApiError('TEAM_NAME_TAKEN', 'That team name is taken'),
    );
    vi.mocked(auth.signInTeam).mockResolvedValue();
    vi.mocked(auth.getAccessToken).mockResolvedValueOnce(undefined).mockResolvedValue('token');
    await fill('The Wanderers', 'password1');
    expect(await screen.findByText('You’re registered!')).toBeInTheDocument();
  });

  it('says the name is taken when the password does not match', async () => {
    vi.mocked(client.registerTeam).mockRejectedValue(
      new client.ApiError('TEAM_NAME_TAKEN', 'That team name is taken'),
    );
    vi.mocked(auth.signInTeam).mockRejectedValue(new auth.SignInError('wrong'));
    await fill('The Wanderers', 'password1');
    expect(await screen.findByRole('alert')).toHaveTextContent('That team name is taken');
  });
});

describe('App after the game ends', () => {
  it('shows the finished screen to a team still playing when the GM ends the game', async () => {
    vi.mocked(auth.getAccessToken).mockResolvedValue('token');
    vi.mocked(client.getState).mockResolvedValue(state({ status: 'playing' }, 'finished'));
    render(<App />);
    expect(await screen.findByText('The game master has ended the game.')).toBeInTheDocument();
  });
});

describe('App polling', () => {
  const lastInterval = () => vi.mocked(usePolling).mock.calls.at(-1)?.[1];

  it('keeps checking while a team is playing, so GM decisions show up', async () => {
    vi.mocked(client.getState).mockResolvedValue({
      ...state({ status: 'playing' }, 'live'),
      current: { status: 'revealed' } as TeamState['current'],
    });
    render(<App />);
    expect(await screen.findByText('Playing')).toBeInTheDocument();
    expect(lastInterval()).toBe(5000);
  });

  it('checks faster while a submission is being reviewed', async () => {
    vi.mocked(client.getState).mockResolvedValue({
      ...state({ status: 'playing' }, 'live'),
      current: { status: 'awaiting_review' } as TeamState['current'],
    });
    render(<App />);
    expect(await screen.findByText('Playing')).toBeInTheDocument();
    expect(lastInterval()).toBe(3000);
  });

  it('stops once the team has finished', async () => {
    vi.mocked(client.getState).mockResolvedValue(state({ status: 'finished' }, 'live'));
    render(<App />);
    expect(await screen.findByText('Finished!')).toBeInTheDocument();
    expect(lastInterval()).toBeNull();
  });
});
