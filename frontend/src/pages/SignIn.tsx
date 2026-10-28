import { useState, type FormEvent } from 'react';
import { signInTeam } from '../auth/index.js';
import { Button, ErrorMessage, LinkButton, Screen, TextField } from '../components/ui.js';
import { errorText } from '../lib/errors.js';

type Props = { onSignedIn: () => void; onShowRegister: () => void };

export const SignIn = ({ onSignedIn, onShowRegister }: Props) => {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password) {
      setError('Enter your team name and password');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await signInTeam(name, password);
      onSignedIn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Sign in">
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <TextField
          label="Team name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="username"
          autoCapitalize="words"
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <ErrorMessage>{error}</ErrorMessage>
        <Button type="submit" busy={busy}>
          Sign in
        </Button>
      </form>
      <LinkButton onClick={onShowRegister}>New team? Register</LinkButton>
    </Screen>
  );
};
