import { useState, type FormEvent } from 'react';
import type { TeamState } from '@treasurehunt/shared';
import { ApiError, answer, reveal, type Answer } from '../api/client.js';
import { Button, ErrorMessage, Screen } from '../components/ui.js';
import { errorText } from '../lib/errors.js';
import { formatDuration, useTicker } from '../lib/time.js';

type Current = NonNullable<TeamState['current']>;
type Props = {
  state: TeamState;
  /** When `state` arrived on this phone (Date.now()), for the local timer. */
  receivedAt: number;
  onState: (state: TeamState) => void;
  /** Re-fetch the state, e.g. when the server says this screen is out of date. */
  onReload: () => Promise<void>;
};

// One stage: clue → Reveal → question → answer. Everything shown comes from the server state.
export const Play = ({ state, receivedAt, onState, onReload }: Props) => {
  const current = state.current!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  const running = current.timer.running;
  const stageMs = useTicker(current.timer.elapsedMs, running, receivedAt);
  const totalMs = useTicker(state.team.totalMs, running, receivedAt);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === 'INVALID_STATE' || err.code === 'GAME_NOT_LIVE')
      ) {
        await onReload();
      } else {
        setError(errorText(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const doReveal = () => {
    if (!window.confirm('The timer starts as soon as you reveal the question. Reveal now?')) return;
    setFlash('');
    void act(async () => onState(await reveal(current.stage)));
  };

  const submit = (value: Answer, attemptId: string) =>
    act(async () => {
      const res = await answer(current.stage, attemptId, value);
      setFlash(res.correct ? 'Correct! Here’s your next clue.' : '');
      onState(res.state);
    });

  return (
    <Screen title={`Stage ${state.team.stage} of ${state.team.stageCount}`}>
      <div className="flex justify-between rounded-2xl bg-slate-800 px-4 py-3 text-lg">
        <span>
          This question{' '}
          <strong className="font-mono text-amber-300" data-testid="stage-timer">
            {formatDuration(stageMs + current.penaltyMs)}
          </strong>
        </span>
        <span>
          Total{' '}
          <strong className="font-mono" data-testid="total-timer">
            {formatDuration(totalMs)}
          </strong>
        </span>
      </div>
      {flash && (
        <p role="status" className="rounded-xl bg-green-800 px-4 py-3 text-center text-xl">
          {flash}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm uppercase tracking-wide text-slate-400">Clue</h2>
        {current.clue.imageUrl && (
          <img src={current.clue.imageUrl} alt="Clue" className="w-full rounded-2xl" />
        )}
        {current.clue.text && <p className="text-2xl leading-snug">{current.clue.text}</p>}
      </section>

      {current.status === 'clue' && (
        <>
          <p className="text-center text-slate-300">
            Found the place? Reveal the question. Travel time doesn’t count, but the timer starts
            when you reveal.
          </p>
          <Button onClick={doReveal} busy={busy}>
            Reveal question
          </Button>
        </>
      )}

      {current.question && (
        <section className="flex flex-col gap-3 rounded-2xl border-2 border-amber-400 p-4">
          <h2 className="text-sm uppercase tracking-wide text-amber-300">Question</h2>
          {current.question.imageUrl && (
            <img src={current.question.imageUrl} alt="Question" className="w-full rounded-xl" />
          )}
          <p className="text-2xl leading-snug">{current.question.text}</p>
        </section>
      )}

      {current.status === 'revealed' && (
        <>
          {current.lastResult?.result === 'wrong' && (
            <p role="alert" className="rounded-xl bg-red-900 px-4 py-3 text-lg">
              Not quite, try again! Penalties on this question so far:{' '}
              {formatDuration(current.penaltyMs)}
            </p>
          )}
          <AnswerForm current={current} busy={busy} onSubmit={submit} />
        </>
      )}

      <ErrorMessage>{error}</ErrorMessage>
    </Screen>
  );
};

const newAttemptId = () => crypto.randomUUID();

const AnswerForm = ({
  current,
  busy,
  onSubmit,
}: {
  current: Current;
  busy: boolean;
  onSubmit: (value: Answer, attemptId: string) => Promise<void>;
}) => {
  const [optionId, setOptionId] = useState('');
  const [text, setText] = useState('');
  // One id per distinct submission: a retry of the same answer reuses it.
  const [attempt, setAttempt] = useState({ key: '', id: newAttemptId() });

  const send = (e: FormEvent) => {
    e.preventDefault();
    const value: Answer = current.type === 'multiple_choice' ? { optionId } : { text: text.trim() };
    const key = JSON.stringify(value);
    const id = key === attempt.key ? attempt.id : newAttemptId();
    setAttempt({ key, id });
    void onSubmit(value, id);
  };

  if (current.type === 'multiple_choice') {
    return (
      <form onSubmit={send} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-lg">
          Your answer
          <select
            value={optionId}
            onChange={(e) => setOptionId(e.target.value)}
            className="rounded-xl border-2 border-slate-500 bg-slate-800 px-4 py-4 text-xl"
          >
            <option value="">Choose…</option>
            {current.question?.options?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.text}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" busy={busy} disabled={!optionId}>
          Submit answer
        </Button>
      </form>
    );
  }

  if (current.type === 'free_text') {
    return (
      <form onSubmit={send} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-lg">
          Your answer
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={200}
            autoComplete="off"
            className="rounded-xl border-2 border-slate-500 bg-slate-800 px-4 py-3 text-xl"
          />
        </label>
        <Button type="submit" busy={busy} disabled={!text.trim()}>
          Submit answer
        </Button>
      </form>
    );
  }

  // Photo and dance questions arrive in phase 6.
  return <p className="text-center text-slate-300">This kind of question isn’t ready yet.</p>;
};
