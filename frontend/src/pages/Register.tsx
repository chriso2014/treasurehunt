import { useState, type FormEvent } from 'react';
import { registerTeamRequestSchema } from '@treasurehunt/shared';
import { ApiError, registerTeam } from '../api/client.js';
import { signInTeam } from '../auth/index.js';
import { Button, ErrorMessage, LinkButton, Screen, TextField } from '../components/ui.js';
import { errorText } from '../lib/errors.js';

type Props = { onSignedIn: () => void; onShowSignIn: () => void };

export const Register = ({ onSignedIn, onShowSignIn }: Props) => {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = registerTeamRequestSchema.safeParse({ name, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form');
      return;
    }
    setBusy(true);
    setError('');
    try {
      try {
        await registerTeam(parsed.data);
      } catch (err) {
        // A retry after a lost response finds the name taken: if the password works, it was us.
        if (!(err instanceof ApiError && err.code === 'TEAM_NAME_TAKEN')) throw err;
        try {
          await signInTeam(parsed.data.name, parsed.data.password);
        } catch {
          throw err;
        }
        onSignedIn();
        return;
      }
      await signInTeam(parsed.data.name, parsed.data.password);
      onSignedIn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Hitchin Treasure Hunt">
      <p className="text-center text-lg text-slate-300">
        Register your team. One phone per team. Remember the password: you’ll need it to sign in on
        another phone.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <TextField
          label="Team name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="username"
          autoCapitalize="words"
          maxLength={30}
        />
        <TextField
          label="Password (8+ characters)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        <ErrorMessage>{error}</ErrorMessage>
        <Button type="submit" busy={busy}>
          Register team
        </Button>
      </form>
      <LinkButton onClick={onShowSignIn}>Already registered? Sign in</LinkButton>
    </Screen>
  );
};
