import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TeamState } from '@treasurehunt/shared';
import { App } from './App.js';
import * as client from './api/client.js';
import * as auth from './auth/index.js';

vi.mock('./auth/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./auth/index.js')>()),
  getAccessToken: vi.fn(),
  signInTeam: vi.fn(),
  signOutTeam: vi.fn(),
}));
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
    ...overrides,
  },
  current: null,
  completedLocations: [],
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
