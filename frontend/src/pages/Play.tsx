import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { TeamState } from '@treasurehunt/shared';
import {
  ApiError,
  answer,
  getSubmissionUpload,
  hint,
  reveal,
  skip,
  submitPhoto,
  uploadToS3,
  videoCall,
  type Answer,
} from '../api/client.js';
import { Button, ErrorMessage, SafeImage, Screen } from '../components/ui.js';
import { errorText } from '../lib/errors.js';
import { resizeToJpeg } from '../lib/image.js';
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

  const doHint = () => {
    const penalty = formatDuration(current.hintPenaltyMs);
    if (!window.confirm(`Using the hint adds ${penalty} to your time. Show the hint?`)) return;
    void act(async () => onState(await hint(current.stage)));
  };

  const doSkip = () => {
    const penalty = formatDuration(current.skipPenaltyMs);
    if (
      !window.confirm(`Skipping adds ${penalty} to your time and moves you to the next clue. Skip?`)
    )
      return;
    setFlash('');
    void act(async () => {
      const next = await skip(current.stage);
      if (next.current?.stage !== current.stage) setFlash('Skipped. Here’s your next clue.');
      onState(next);
    });
  };

  const sendPhoto = (photo: Blob, attemptId: string) =>
    act(async () => {
      const target = await getSubmissionUpload(current.stage, attemptId);
      await uploadToS3(target, photo);
      onState(await submitPhoto(current.stage, attemptId));
    });

  const startCall = () => {
    if (!window.confirm('Ready to dance? Your timer pauses while you call the game master.'))
      return;
    void act(async () => onState(await videoCall(current.stage, crypto.randomUUID())));
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
          <SafeImage src={current.clue.imageUrl} alt="Clue" className="w-full rounded-2xl" />
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
            <SafeImage
              src={current.question.imageUrl}
              alt="Question"
              className="w-full rounded-xl"
            />
          )}
          <p className="text-2xl leading-snug">{current.question.text}</p>
        </section>
      )}

      {current.hint && (
        <section className="flex flex-col gap-3 rounded-2xl bg-slate-800 p-4">
          <h2 className="text-sm uppercase tracking-wide text-slate-400">Hint</h2>
          {current.hint.imageUrl && (
            <SafeImage src={current.hint.imageUrl} alt="Hint" className="w-full rounded-xl" />
          )}
          {current.hint.text && <p className="text-xl leading-snug">{current.hint.text}</p>}
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
          {current.lastResult?.result === 'declined' && (
            <p role="alert" className="rounded-xl bg-red-900 px-4 py-3 text-lg">
              The game master didn’t accept that photo
              {current.lastResult.reason ? `: ${current.lastResult.reason}` : ''}. Try another!
              Penalties on this question so far: {formatDuration(current.penaltyMs)}
            </p>
          )}
          {current.type === 'photo' ? (
            <PhotoAnswer key={current.stage} busy={busy} onSend={sendPhoto} />
          ) : current.type === 'video_call' ? (
            <Button onClick={startCall} busy={busy}>
              Call the game master
            </Button>
          ) : (
            <AnswerForm current={current} busy={busy} onSubmit={submit} />
          )}
          {!current.hintUsed && (
            <Button variant="secondary" onClick={doHint} busy={busy}>
              Use hint (+{formatDuration(current.hintPenaltyMs)})
            </Button>
          )}
          {current.canSkip && (
            <Button variant="secondary" onClick={doSkip} busy={busy}>
              Skip this question (+{formatDuration(current.skipPenaltyMs)})
            </Button>
          )}
        </>
      )}

      {current.status === 'awaiting_review' && <AwaitingReview current={current} />}

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

  return null;
};

const PhotoAnswer = ({
  busy,
  onSend,
}: {
  busy: boolean;
  onSend: (photo: Blob, attemptId: string) => Promise<void>;
}) => {
  const input = useRef<HTMLInputElement>(null);
  // One attempt id per chosen photo: re-sending the same photo after a failure reuses it.
  const [photo, setPhoto] = useState<{ blob: Blob; url: string; attemptId: string }>();
  const [error, setError] = useState('');

  useEffect(() => () => (photo ? URL.revokeObjectURL(photo.url) : undefined), [photo]);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      const blob = await resizeToJpeg(file);
      setPhoto({ blob, url: URL.createObjectURL(blob), attemptId: newAttemptId() });
    } catch {
      setError('Could not read that photo. Try taking it again.');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="answer-photo-input"
        onChange={(e) => void choose(e.target.files?.[0])}
      />
      {photo && <img src={photo.url} alt="Your answer" className="w-full rounded-2xl" />}
      <ErrorMessage>{error}</ErrorMessage>
      {photo ? (
        <>
          <Button onClick={() => void onSend(photo.blob, photo.attemptId)} busy={busy}>
            Send photo
          </Button>
          <Button variant="secondary" onClick={() => input.current?.click()} disabled={busy}>
            Retake
          </Button>
        </>
      ) : (
        <Button onClick={() => input.current?.click()}>Take photo</Button>
      )}
    </div>
  );
};

const AwaitingReview = ({ current }: { current: Current }) =>
  current.type === 'video_call' ? (
    <section className="flex flex-col gap-4 text-center">
      <p className="text-xl">
        Your timer is paused. Video-call the game master on WhatsApp and perform your dance!
      </p>
      {current.whatsappUrl ? (
        <a
          href={current.whatsappUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-2xl bg-green-600 px-6 py-5 text-2xl font-bold text-white"
        >
          Open WhatsApp
        </a>
      ) : (
        <p className="text-slate-300">Call the game master on WhatsApp.</p>
      )}
      <p className="text-slate-300">
        In WhatsApp, tap the video-call button. This screen moves on when the game master decides.
      </p>
    </section>
  ) : (
    <p role="status" className="rounded-xl bg-slate-800 px-4 py-4 text-center text-xl">
      Waiting for the game master to check your photo… Your timer is paused.
    </p>
  );
