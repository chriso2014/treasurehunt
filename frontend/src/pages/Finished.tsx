import type { TeamState } from '@treasurehunt/shared';
import { Screen } from '../components/ui.js';
import { formatDuration } from '../lib/time.js';

export const Finished = ({ state }: { state: TeamState }) => (
  <Screen title="Finished!">
    {state.team.photoUrl && (
      <img src={state.team.photoUrl} alt="Team photo" className="w-full rounded-2xl" />
    )}
    <p className="text-center text-2xl">Well done, {state.team.name}!</p>
    <p className="text-center text-lg text-slate-300">Your total time</p>
    <p className="text-center font-mono text-5xl font-bold text-amber-300">
      {formatDuration(state.team.totalMs)}
    </p>
  </Screen>
);
