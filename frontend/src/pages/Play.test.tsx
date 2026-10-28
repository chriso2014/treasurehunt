import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CurrentStage, TeamState } from '@treasurehunt/shared';
import * as client from '../api/client.js';
import { Play } from './Play.js';

vi.mock('../api/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client.js')>()),
  reveal: vi.fn(),
  answer: vi.fn(),
}));

const current = (overrides: Partial<CurrentStage> = {}): CurrentStage => ({
  stage: 1,
  status: 'clue',
  type: 'multiple_choice',
  clue: { text: 'Where the market met', imageUrl: null },
  question: null,
  hint: null,
  timer: { elapsedMs: 0, running: false, serverTime: '2026-10-28T10:00:00.000Z' },
  penaltyMs: 0,
  hintUsed: false,
  canSkip: false,
  lastResult: null,
  whatsappUrl: null,
  ...overrides,
});

const revealedMc = (overrides: Partial<CurrentStage> = {}) =>
  current({
    status: 'revealed',
    question: {
      text: 'What colour is the door?',
      imageUrl: null,
      options: [
        { id: 'a', text: 'Red' },
        { id: 'b', text: 'Blue' },
      ],
    },
    timer: { elapsedMs: 65_000, running: true, serverTime: '2026-10-28T10:00:00.000Z' },
    ...overrides,
  });

const state = (c: CurrentStage | null, totalMs = 0): TeamState => ({
  game: { status: 'live' },
  team: {
    name: 'T',
    route: 'A',
    status: 'playing',
    photoUrl: null,
    stage: 1,
    stageCount: 4,
    totalMs,
  },
  current: c,
  completedLocations: [],
});

describe('Play', () => {
  beforeEach(() => vi.spyOn(window, 'confirm').mockReturnValue(true));
  afterEach(() => vi.useRealTimers());

  it('asks to confirm before revealing, then shows the new state', async () => {
    const onState = vi.fn();
    vi.mocked(client.reveal).mockResolvedValue(state(revealedMc()));
    render(
      <Play
        state={state(current())}
        receivedAt={Date.now()}
        onState={onState}
        onReload={vi.fn()}
      />,
    );
    expect(screen.getByText('Where the market met')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reveal question' }));
    expect(window.confirm).toHaveBeenCalled();
    expect(client.reveal).toHaveBeenCalledWith(1);
    expect(onState).toHaveBeenCalledWith(state(revealedMc()));
  });

  it('does nothing if the team cancels the reveal', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(
      <Play
        state={state(current())}
        receivedAt={Date.now()}
        onState={vi.fn()}
        onReload={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reveal question' }));
    expect(client.reveal).not.toHaveBeenCalled();
  });

  it('submits the chosen option with the stage and an attempt id', async () => {
    vi.mocked(client.answer).mockResolvedValue({ correct: true, state: state(current()) });
    render(
      <Play
        state={state(revealedMc())}
        receivedAt={Date.now()}
        onState={vi.fn()}
        onReload={vi.fn()}
      />,
    );
    await userEvent.selectOptions(screen.getByRole('combobox'), 'b');
    await userEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(client.answer).toHaveBeenCalledWith(1, expect.any(String), { optionId: 'b' });
    expect(await screen.findByRole('status')).toHaveTextContent('Correct!');
  });

  it('reuses the attempt id when the same answer is sent again', async () => {
    vi.mocked(client.answer).mockRejectedValueOnce(new client.ApiError('NETWORK', 'No connection'));
    vi.mocked(client.answer).mockResolvedValue({ correct: false, state: state(revealedMc()) });
    render(
      <Play
        state={state(revealedMc())}
        receivedAt={Date.now()}
        onState={vi.fn()}
        onReload={vi.fn()}
      />,
    );
    await userEvent.selectOptions(screen.getByRole('combobox'), 'a');
    await userEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No connection');
    await userEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    const [first, second] = vi.mocked(client.answer).mock.calls;
    expect(second![1]).toBe(first![1]);
  });

  it('shows a wrong answer with the penalties so far', () => {
    const c = revealedMc({
      penaltyMs: 300_000,
      lastResult: { result: 'wrong', reason: null },
    });
    render(<Play state={state(c)} receivedAt={Date.now()} onState={vi.fn()} onReload={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Not quite');
    expect(screen.getByRole('alert')).toHaveTextContent('5:00');
  });

  it('ticks the timers locally while running', () => {
    vi.useFakeTimers();
    render(
      <Play
        state={state(revealedMc(), 100_000)}
        receivedAt={Date.now()}
        onState={vi.fn()}
        onReload={vi.fn()}
      />,
    );
    expect(screen.getByTestId('stage-timer')).toHaveTextContent('1:05');
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByTestId('stage-timer')).toHaveTextContent('1:08');
    expect(screen.getByTestId('total-timer')).toHaveTextContent('1:43');
  });

  it('accepts free text answers', async () => {
    vi.mocked(client.answer).mockResolvedValue({ correct: false, state: state(revealedMc()) });
    const c = revealedMc({
      type: 'free_text',
      question: { text: 'What year?', imageUrl: null, options: null },
    });
    render(<Play state={state(c)} receivedAt={Date.now()} onState={vi.fn()} onReload={vi.fn()} />);
    await userEvent.type(screen.getByRole('textbox'), ' 1850 ');
    await userEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(client.answer).toHaveBeenCalledWith(1, expect.any(String), { text: '1850' });
  });

  it('reloads instead of showing an error when the screen is out of date', async () => {
    const onReload = vi.fn().mockResolvedValue(undefined);
    vi.mocked(client.reveal).mockRejectedValue(new client.ApiError('INVALID_STATE', 'x'));
    render(
      <Play
        state={state(current())}
        receivedAt={Date.now()}
        onState={vi.fn()}
        onReload={onReload}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reveal question' }));
    expect(onReload).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('SafeImage', () => {
  it('hides a clue image that fails to load', async () => {
    const { fireEvent } = await import('@testing-library/react');
    render(
      <Play
        state={state(current({ clue: { text: 'c', imageUrl: 'https://missing' } }))}
        receivedAt={Date.now()}
        onState={vi.fn()}
        onReload={vi.fn()}
      />,
    );
    fireEvent.error(screen.getByAltText('Clue'));
    expect(screen.queryByAltText('Clue')).not.toBeInTheDocument();
  });
});
