import type { TeamState } from '@treasurehunt/shared';
import { Button, LinkButton, Screen } from '../components/ui.js';

type Props = { state: TeamState; onChangePhoto: () => void; onSignOut: () => void };

export const Waiting = ({ state, onChangePhoto, onSignOut }: Props) => (
  <Screen title={state.team.name}>
    {state.team.photoUrl && (
      <img src={state.team.photoUrl} alt="Team photo" className="w-full rounded-2xl object-cover" />
    )}
    <p className="text-center text-2xl font-semibold">You’re registered!</p>
    <p className="text-center text-lg text-slate-300">
      Waiting for the game master to start the game. This screen updates by itself.
    </p>
    <Button variant="secondary" onClick={onChangePhoto}>
      Change photo
    </Button>
    <LinkButton onClick={onSignOut}>Not your team? Sign out</LinkButton>
  </Screen>
);
