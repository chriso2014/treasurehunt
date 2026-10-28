import type { StageResult, TeamState } from '@treasurehunt/shared';
import { MapView } from '../components/MapView.js';
import { SafeImage, Screen } from '../components/ui.js';
import { formatDuration } from '../lib/time.js';

const penaltyLabel = ({ kind, count }: StageResult['penalties'][number]): string => {
  switch (kind) {
    case 'wrong':
      return count === 1 ? 'Wrong answer' : `${count} wrong answers`;
    case 'declined':
      return count === 1 ? 'Not accepted by the game master' : `${count} not accepted`;
    case 'hint':
      return 'Hint';
    case 'skip':
      return 'Skipped';
    case 'other':
      return 'Other penalties';
  }
};

const Breakdown = ({ results }: { results: StageResult[] }) => (
  <details className="rounded-2xl bg-slate-800 p-4">
    <summary className="cursor-pointer text-lg font-semibold">See more about your time</summary>
    <ol className="mt-4 flex flex-col gap-4">
      {results.map((r) => (
        <li key={r.stage} className="flex flex-col gap-1 border-t border-slate-700 pt-3">
          <div className="flex justify-between text-lg font-semibold">
            <span>Question {r.stage}</span>
            <span className="font-mono">{formatDuration(r.timeMs + r.penaltyMs)}</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Time taken</span>
            <span className="font-mono">{formatDuration(r.timeMs)}</span>
          </div>
          {r.penalties.length === 0 ? (
            <p className="text-slate-400">No penalties</p>
          ) : (
            r.penalties.map((p) => (
              <div key={p.kind} className="flex justify-between text-red-300">
                <span>{penaltyLabel(p)}</span>
                <span className="font-mono">+{formatDuration(p.ms)}</span>
              </div>
            ))
          )}
        </li>
      ))}
    </ol>
  </details>
);

export const Finished = ({ state }: { state: TeamState }) => (
  <Screen title="Finished!">
    {state.team.photoUrl && (
      <SafeImage src={state.team.photoUrl} alt="Team photo" className="w-full rounded-2xl" />
    )}
    <p className="text-center text-2xl">Well done, {state.team.name}!</p>
    {state.team.status !== 'finished' && (
      <p className="text-center text-lg">The game master has ended the game.</p>
    )}
    <p className="text-center text-lg text-slate-300">Your total time</p>
    <p className="text-center font-mono text-5xl font-bold text-amber-300">
      {formatDuration(state.team.totalMs)}
    </p>
    {state.results.length > 0 && <Breakdown results={state.results} />}
    {state.completedLocations.length > 0 && (
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Where you went</h2>
        <MapView locations={state.completedLocations} start={state.map} />
      </section>
    )}
  </Screen>
);
