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
  hint: vi.fn(),
  skip: vi.fn(),
  getSubmissionUpload: vi.fn(),
  uploadToS3: vi.fn(),
  submitPhoto: vi.fn(),
  videoCall: vi.fn(),
}));
vi.mock('../lib/image.js', () => ({ resizeToJpeg: vi.fn(async () => new Blob(['jpg'])) }));

const current = (overrides: Partial<CurrentStage> = {}): CurrentStage => ({
  stage: 1,
  status: 'clue',
  type: 'multiple_choice',
  clue: { text: 'Where the market met', imageUrl: null },
  question: null,
  hint: null,
  timer: { elapsedMs: 0, running: false, serverTime: '2026-10-28T10:00:00.000Z' },
  penaltyMs: 0,
  hintPenaltyMs: 300_000,
  skipPenaltyMs: 300_000,
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
  results: [],
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

  it('confirms the hint penalty, then shows the hint', async () => {
    const onState = vi.fn();
    const withHint = revealedMc({
      hintUsed: true,
      canSkip: true,
      penaltyMs: 300_000,
      hint: { text: 'Look up', imageUrl: null },
    });
    vi.mocked(client.hint).mockResolvedValue(state(withHint));
    const { rerender } = render(
      <Play
        state={state(revealedMc())}
        receivedAt={Date.now()}
        onState={onState}
        onReload={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Skip/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Use hint (+5:00)' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('adds 5:00'));
    expect(client.hint).toHaveBeenCalledWith(1);
    expect(onState).toHaveBeenCalledWith(state(withHint));

    rerender(
      <Play state={state(withHint)} receivedAt={Date.now()} onState={onState} onReload={vi.fn()} />,
    );
    expect(screen.getByText('Look up')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Use hint/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip this question (+5:00)' })).toBeInTheDocument();
  });

  it('does not use the hint if the team cancels', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(
      <Play
        state={state(revealedMc())}
        receivedAt={Date.now()}
        onState={vi.fn()}
        onReload={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Use hint/ }));
    expect(client.hint).not.toHaveBeenCalled();
  });

  it('confirms the skip penalty, then moves to the next clue', async () => {
    const onState = vi.fn();
    const next = state(current({ stage: 2 }));
    vi.mocked(client.skip).mockResolvedValue(next);
    const c = revealedMc({ hintUsed: true, canSkip: true, skipPenaltyMs: 600_000 });
    render(<Play state={state(c)} receivedAt={Date.now()} onState={onState} onReload={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Skip this question (+10:00)' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('adds 10:00'));
    expect(client.skip).toHaveBeenCalledWith(1);
    expect(onState).toHaveBeenCalledWith(next);
    expect(await screen.findByRole('status')).toHaveTextContent('Skipped');
  });

  describe('photo questions', () => {
    const photoQ = (overrides: Partial<CurrentStage> = {}) =>
      revealedMc({
        type: 'photo',
        question: { text: 'Troll faces on the bridge', imageUrl: null, options: null },
        ...overrides,
      });

    it('uploads the photo, submits it and shows the new state', async () => {
      URL.createObjectURL = vi.fn(() => 'blob:preview');
      URL.revokeObjectURL = vi.fn();
      const upload = { url: 'https://s3', fields: {}, key: 'k' };
      vi.mocked(client.getSubmissionUpload).mockResolvedValue(upload);
      vi.mocked(client.uploadToS3).mockResolvedValue();
      const waiting = state(photoQ({ status: 'awaiting_review' }));
      vi.mocked(client.submitPhoto).mockResolvedValue(waiting);
      const onState = vi.fn();
      render(
        <Play
          state={state(photoQ())}
          receivedAt={Date.now()}
          onState={onState}
          onReload={vi.fn()}
        />,
      );
      await userEvent.upload(
        screen.getByTestId('answer-photo-input'),
        new File(['x'], 'p.jpg', { type: 'image/jpeg' }),
      );
      await userEvent.click(await screen.findByRole('button', { name: 'Send photo' }));
      const [stage, attemptId] = vi.mocked(client.getSubmissionUpload).mock.calls[0]!;
      expect(stage).toBe(1);
      expect(client.uploadToS3).toHaveBeenCalledWith(upload, expect.any(Blob));
      expect(client.submitPhoto).toHaveBeenCalledWith(1, attemptId);
      expect(onState).toHaveBeenCalledWith(waiting);
    });

    it('shows the paused timer while the game master reviews', () => {
      const c = photoQ({
        status: 'awaiting_review',
        timer: { elapsedMs: 90_000, running: false, serverTime: '' },
      });
      render(
        <Play state={state(c)} receivedAt={Date.now()} onState={vi.fn()} onReload={vi.fn()} />,
      );
      expect(screen.getByRole('status')).toHaveTextContent('Waiting for the game master');
      expect(screen.queryByRole('button', { name: /Use hint/ })).not.toBeInTheDocument();
    });

    it('shows why a photo was declined', () => {
      const c = photoQ({
        penaltyMs: 300_000,
        lastResult: { result: 'declined', reason: 'Whole team must be in shot' },
      });
      render(
        <Play state={state(c)} receivedAt={Date.now()} onState={vi.fn()} onReload={vi.fn()} />,
      );
      expect(screen.getByRole('alert')).toHaveTextContent('Whole team must be in shot');
      expect(screen.getByRole('button', { name: 'Take photo' })).toBeInTheDocument();
    });
  });

  describe('the dance', () => {
    const dance = (overrides: Partial<CurrentStage> = {}) =>
      revealedMc({
        type: 'video_call',
        question: { text: 'Dance!', imageUrl: null, options: null },
        ...overrides,
      });

    it('pauses the timer when the team is ready to call', async () => {
      const onState = vi.fn();
      vi.mocked(client.videoCall).mockResolvedValue(state(dance({ status: 'awaiting_review' })));
      render(
        <Play
          state={state(dance())}
          receivedAt={Date.now()}
          onState={onState}
          onReload={vi.fn()}
        />,
      );
      expect(screen.queryByRole('button', { name: /Skip/ })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Call the game master' }));
      expect(window.confirm).toHaveBeenCalled();
      expect(client.videoCall).toHaveBeenCalledWith(1, expect.any(String));
      expect(onState).toHaveBeenCalled();
    });

    it('links to WhatsApp while waiting for the decision', () => {
      const c = dance({ status: 'awaiting_review', whatsappUrl: 'https://wa.me/447700900123' });
      render(
        <Play state={state(c)} receivedAt={Date.now()} onState={vi.fn()} onReload={vi.fn()} />,
      );
      expect(screen.getByRole('link', { name: 'Open WhatsApp' })).toHaveAttribute(
        'href',
        'https://wa.me/447700900123',
      );
    });
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
