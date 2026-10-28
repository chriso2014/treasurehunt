import { useCallback, useEffect, useState } from 'react';
import type { AdminReview, AdminTeam, AdminTeamsResponse } from '@treasurehunt/shared';
import {
  acceptTextAnswer,
  decideReview,
  getAdminTeams,
  getReviews,
  publishResults,
  setTeamRoute,
  setTieBreak,
  startGame,
} from '../../api/client.js';
import { Button, ErrorMessage, LinkButton, SafeImage } from '../../components/ui.js';
import { errorText } from '../../lib/errors.js';
import { usePolling } from '../../lib/poller.js';
import { formatDuration } from '../../lib/time.js';

const POLL_MS = 5000;

type Props = {
  onSignOut: () => void;
  /** Returns true when the error meant the session is no good (handled by signing out). */
  onAuthError: (err: unknown) => boolean;
};

// GM console: review queue first (teams are waiting, timer paused), then the leaderboard.
export const Console = ({ onSignOut, onAuthError }: Props) => {
  const [data, setData] = useState<{ board: AdminTeamsResponse; reviews: AdminReview[] }>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [board, { reviews }] = await Promise.all([getAdminTeams(), getReviews()]);
      setData(() => ({ board, reviews }));
      setError(() => '');
    } catch (err) {
      if (!onAuthError(err)) setError(() => errorText(err));
    }
  }, [onAuthError]);
  useEffect(() => void load(), [load]);
  usePolling(load, POLL_MS);

  /** Runs one GM action (tracked by `key` for its busy state), then refreshes. */
  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError('');
    try {
      await fn();
    } catch (err) {
      if (!onAuthError(err)) setError(errorText(err));
    } finally {
      setBusy('');
      await load();
    }
  };

  if (!data) {
    return (
      <AdminScreen onSignOut={onSignOut}>
        <ErrorMessage>{error}</ErrorMessage>
        {!error && <p className="text-center text-slate-300">Loading…</p>}
      </AdminScreen>
    );
  }

  const { board, reviews } = data;
  const { game, teams } = board;
  const stillPlaying = teams.filter((t) => t.status === 'playing').length;

  const start = () => {
    if (!window.confirm(`Start the game for ${teams.length} team(s)?`)) return;
    void act('start', startGame);
  };
  const publish = () => {
    const warning = stillPlaying
      ? `${stillPlaying} team(s) are still playing and will be stopped. `
      : '';
    if (!window.confirm(`${warning}Publish the results and end the game?`)) return;
    void act('publish', publishResults);
  };
  /** Swaps a team with the one above it (equal totals only) and saves the order. */
  const moveUp = (team: AdminTeam) => {
    const finished = teams.filter((t) => t.status === 'finished').map((t) => t.teamId);
    const i = finished.indexOf(team.teamId);
    if (i < 1) return;
    [finished[i - 1], finished[i]] = [finished[i]!, finished[i - 1]!];
    void act(`tie:${team.teamId}`, () => setTieBreak(finished));
  };

  return (
    <AdminScreen onSignOut={onSignOut}>
      <ErrorMessage>{error}</ErrorMessage>

      <section className="flex flex-col gap-3 rounded-2xl bg-slate-800 p-4">
        <p className="text-lg">
          Game: <strong>{game.resultsPublished ? 'results published' : game.status}</strong>
          {game.status === 'live' && ` · ${stillPlaying} of ${teams.length} still playing`}
        </p>
        {game.status === 'registration' && (
          <Button onClick={start} busy={busy === 'start'} disabled={teams.length === 0}>
            Start game
          </Button>
        )}
        {game.status === 'live' && (
          <Button variant="secondary" onClick={publish} busy={busy === 'publish'}>
            Publish results
          </Button>
        )}
        {game.resultsPublished && (
          <a href="/results" className="text-center text-lg text-amber-300 underline">
            Open the results page to share
          </a>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Waiting for you ({reviews.length})</h2>
        {reviews.length === 0 && <p className="text-slate-400">Nothing to review.</p>}
        {reviews.map((r) => (
          <ReviewCard
            key={r.attemptId}
            review={r}
            busy={busy === `review:${r.attemptId}`}
            onDecide={(decision, reason) =>
              act(`review:${r.attemptId}`, () =>
                decideReview(r.teamId, r.attemptId, { decision, reason: reason || undefined }),
              )
            }
          />
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Leaderboard</h2>
        {teams.length === 0 && <p className="text-slate-400">No teams yet.</p>}
        {teams.map((t, i) => {
          const above = teams[i - 1];
          const tied =
            t.status === 'finished' && above?.status === 'finished' && above.totalMs === t.totalMs;
          return (
            <TeamRow
              key={t.teamId}
              team={t}
              canChangeRoute={game.status === 'registration' && t.status === 'registered'}
              tied={tied}
              busy={busy}
              onRoute={(route) => act(`route:${t.teamId}`, () => setTeamRoute(t.teamId, route))}
              onMoveUp={() => moveUp(t)}
              onAccept={(attemptId, text) => {
                if (!window.confirm(`Accept “${text}” for ${t.name}? Its penalty is removed.`)) {
                  return;
                }
                void act(`accept:${attemptId}`, () => acceptTextAnswer(t.teamId, attemptId));
              }}
            />
          );
        })}
      </section>
    </AdminScreen>
  );
};

const AdminScreen = ({
  children,
  onSignOut,
}: {
  children: React.ReactNode;
  onSignOut: () => void;
}) => (
  <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 bg-slate-900 px-4 py-6 text-white">
    <header className="flex items-center justify-between">
      <h1 className="text-2xl font-bold">Game master</h1>
      <LinkButton onClick={onSignOut}>Sign out</LinkButton>
    </header>
    {children}
  </main>
);

const ReviewCard = ({
  review,
  busy,
  onDecide,
}: {
  review: AdminReview;
  busy: boolean;
  onDecide: (decision: 'approved' | 'declined', reason: string) => Promise<void>;
}) => {
  const [reason, setReason] = useState('');
  const time = new Date(review.submittedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <article className="flex flex-col gap-3 rounded-2xl border-2 border-amber-400 p-4">
      <p className="text-lg">
        <strong>{review.teamName}</strong> · stage {review.stage} ·{' '}
        {review.type === 'photo' ? 'photo' : 'dance call'} · {time}
      </p>
      <p className="text-slate-300">{review.questionText}</p>
      {review.photoUrl ? (
        <a href={review.photoUrl} target="_blank" rel="noreferrer">
          <SafeImage
            src={review.photoUrl}
            alt={`${review.teamName}'s photo`}
            className="w-full rounded-xl"
          />
        </a>
      ) : (
        <p className="rounded-xl bg-slate-800 p-3">
          The team is calling you on WhatsApp. Watch the dance, then decide.
        </p>
      )}
      <label className="flex flex-col gap-1">
        Reason if declining (optional, the team sees it)
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          className="rounded-xl border-2 border-slate-500 bg-slate-800 px-3 py-2 text-lg"
        />
      </label>
      <div className="flex gap-3">
        <Button onClick={() => void onDecide('approved', '')} busy={busy}>
          Approve
        </Button>
        <Button variant="secondary" onClick={() => void onDecide('declined', reason)} busy={busy}>
          Decline
        </Button>
      </div>
    </article>
  );
};

const statusText = (t: AdminTeam): string => {
  if (t.status === 'registered') return 'Not started';
  if (t.status === 'finished') return 'Finished';
  const what =
    t.stageStatus === 'clue'
      ? 'travelling'
      : t.stageStatus === 'awaiting_review'
        ? 'waiting for you'
        : 'answering';
  return `Stage ${t.stage} of ${t.stageCount} · ${what}`;
};

const TeamRow = ({
  team: t,
  canChangeRoute,
  tied,
  busy,
  onRoute,
  onMoveUp,
  onAccept,
}: {
  team: AdminTeam;
  canChangeRoute: boolean;
  tied: boolean;
  busy: string;
  onRoute: (route: 'A' | 'B') => Promise<void>;
  onMoveUp: () => void;
  onAccept: (attemptId: string, text: string) => void;
}) => (
  <article className="flex flex-col gap-2 rounded-2xl bg-slate-800 p-3" data-testid="team-row">
    <div className="flex items-center gap-3">
      <span className="w-8 text-center text-2xl font-bold text-amber-300">{t.rank ?? '–'}</span>
      {t.photoUrl && (
        <SafeImage src={t.photoUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
      )}
      <div className="flex flex-1 flex-col">
        <span className="text-lg font-semibold">{t.name}</span>
        <span className="text-sm text-slate-300">
          Route {t.route} · {statusText(t)}
        </span>
      </div>
      <span className="font-mono text-lg">{formatDuration(t.totalMs)}</span>
    </div>
    {canChangeRoute && (
      <label className="flex items-center gap-2 text-sm">
        Route
        <select
          value={t.route}
          disabled={busy === `route:${t.teamId}`}
          onChange={(e) => void onRoute(e.target.value as 'A' | 'B')}
          className="rounded-lg border border-slate-500 bg-slate-900 px-2 py-1"
        >
          <option value="A">A</option>
          <option value="B">B</option>
        </select>
      </label>
    )}
    {tied && (
      <button
        type="button"
        onClick={onMoveUp}
        disabled={busy !== ''}
        className="self-start rounded-lg border border-amber-400 px-3 py-1 text-amber-300"
      >
        Tie: put above the team above
      </button>
    )}
    {t.wrongAnswers.map((a) => (
      <button
        key={a.attemptId}
        type="button"
        onClick={() => onAccept(a.attemptId, a.text)}
        disabled={busy !== ''}
        className="self-start rounded-lg border border-slate-500 px-3 py-1 text-left"
      >
        Wrong answer “{a.text}” · accept
      </button>
    ))}
  </article>
);
