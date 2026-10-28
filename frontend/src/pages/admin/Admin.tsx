import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client.js';
import { isGamemasterSession, signInGamemaster, signOutTeam } from '../../auth/index.js';
import { Button, ErrorMessage, LinkButton, Screen, TextField } from '../../components/ui.js';
import { errorText } from '../../lib/errors.js';
import { Console } from './Console.js';

type View = 'loading' | 'signin' | 'not-gm' | 'console';

// /admin: GM sign-in, then the console. The API checks the gamemaster group on every call.
export const Admin = () => {
  const [view, setView] = useState<View>('loading');

  useEffect(() => {
    void isGamemasterSession().then((gm) => setView(gm ? 'console' : 'signin'));
  }, []);

  const signOut = async () => {
    await signOutTeam();
    setView('signin');
  };

  switch (view) {
    case 'loading':
      return <Screen title="Game master">{null}</Screen>;
    case 'signin':
      return (
        <GmSignIn
          onSignedIn={async () => setView((await isGamemasterSession()) ? 'console' : 'not-gm')}
        />
      );
    case 'not-gm':
      return (
        <Screen title="Game master">
          <p className="text-center text-xl">This account isn’t the game master.</p>
          <Button onClick={() => void signOut()}>Sign out</Button>
        </Screen>
      );
    case 'console':
      return (
        <Console
          onSignOut={() => void signOut()}
          onAuthError={(err) => {
            if (
              err instanceof ApiError &&
              (err.code === 'UNAUTHENTICATED' || err.code === 'FORBIDDEN')
            ) {
              void signOut();
              return true;
            }
            return false;
          }}
        />
      );
  }
};

const GmSignIn = ({ onSignedIn }: { onSignedIn: () => Promise<void> }) => {
  const [username, setUsername] = useState('gamemaster');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInGamemaster(username, password);
      await onSignedIn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Game master">
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <TextField
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <ErrorMessage>{error}</ErrorMessage>
        <Button type="submit" busy={busy} disabled={!username.trim() || !password}>
          Sign in
        </Button>
      </form>
      <LinkButton onClick={() => window.location.assign('/')}>Back to the team app</LinkButton>
    </Screen>
  );
};
