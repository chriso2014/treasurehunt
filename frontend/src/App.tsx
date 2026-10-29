import { useCallback, useEffect, useState } from 'react';
import type { TeamState } from '@treasurehunt/shared';
import { ApiError, getState } from './api/client.js';
import { getAccessToken, signOutTeam } from './auth/index.js';
import { ErrorMessage, Screen, Button } from './components/ui.js';
import { errorText } from './lib/errors.js';
import { usePolling } from './lib/poller.js';
import { IMAGE_URL_REUSE_MS, keepImageUrls } from './lib/state-merge.js';
import { Finished } from './pages/Finished.js';
import { Play } from './pages/Play.js';
import { Register } from './pages/Register.js';
import { SignIn } from './pages/SignIn.js';
import { TeamPhoto } from './pages/TeamPhoto.js';
import { Waiting } from './pages/Waiting.js';

type View =
  | { name: 'loading' }
  | { name: 'register' }
  | { name: 'signin' }
  | { name: 'error'; message: string }
  | {
      name: 'team';
      state: TeamState;
      receivedAt: number;
      /** When the image URLs on screen were signed; 0 forces fresh ones. */
      imagesAt: number;
      changingPhoto?: boolean;
    };

const WAITING_POLL_MS = 5000;
const REVIEW_POLL_MS = 3000;
/** While playing, so GM decisions (accepted answer, game ended) show without a tap. */
const PLAYING_POLL_MS = 5000;

// Screens render from the server state; the only local choice is which form to show when signed out.
export const App = () => {
  const [view, setView] = useState<View>({ name: 'loading' });

  /** Polls and action responses can arrive out of order: the newest server state wins. */
  const show = useCallback((next: TeamState) => {
    const now = Date.now();
    setView((v) => {
      if (v.name !== 'team') return { name: 'team', state: next, receivedAt: now, imagesAt: now };
      if (next.serverTime < v.state.serverTime) return v;
      const reuse = now - v.imagesAt < IMAGE_URL_REUSE_MS;
      return {
        ...v,
        state: reuse ? keepImageUrls(v.state, next) : next,
        receivedAt: now,
        imagesAt: reuse ? v.imagesAt : now,
      };
    });
  }, []);

  const load = useCallback(async () => {
    if (!(await getAccessToken())) {
      setView((v) => (v.name === 'signin' ? v : { name: 'register' }));
      return;
    }
    try {
      show(await getState());
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'UNAUTHENTICATED' || err.code === 'NOT_FOUND')) {
        await signOutTeam();
        setView({ name: 'signin' });
        return;
      }
      setView((v) => (v.name === 'team' ? v : { name: 'error', message: errorText(err) }));
    }
  }, [show]);

  useEffect(() => void load(), [load]);

  const waiting =
    view.name === 'team' &&
    view.state.game.status === 'registration' &&
    view.state.team.photoUrl !== null &&
    !view.changingPhoto;
  const inReview = view.name === 'team' && view.state.current?.status === 'awaiting_review';
  const playing =
    view.name === 'team' && view.state.game.status === 'live' && view.state.current !== null;
  usePolling(
    load,
    waiting ? WAITING_POLL_MS : inReview ? REVIEW_POLL_MS : playing ? PLAYING_POLL_MS : null,
  );

  const signOut = async () => {
    await signOutTeam();
    setView({ name: 'signin' });
  };

  switch (view.name) {
    case 'loading':
      return <Screen logo>{null}</Screen>;
    case 'register':
      return <Register onSignedIn={load} onShowSignIn={() => setView({ name: 'signin' })} />;
    case 'signin':
      return <SignIn onSignedIn={load} onShowRegister={() => setView({ name: 'register' })} />;
    case 'error':
      return (
        <Screen logo>
          <ErrorMessage>{view.message}</ErrorMessage>
          <Button onClick={() => void load()}>Try again</Button>
        </Screen>
      );
    case 'team': {
      const { state } = view;
      if (state.team.status === 'finished' || state.game.status === 'finished') {
        return <Finished state={state} />;
      }
      if (state.team.status === 'playing' && state.current) {
        return <Play state={state} receivedAt={view.receivedAt} onState={show} onReload={load} />;
      }
      if (state.game.status !== 'registration') {
        return (
          <Screen title={state.team.name}>
            <p className="text-center text-2xl">The game has started!</p>
            <Button onClick={() => void load()}>Refresh</Button>
          </Screen>
        );
      }
      if (state.team.photoUrl === null || view.changingPhoto) {
        return (
          <TeamPhoto
            teamName={state.team.name}
            onDone={() => {
              // Same S3 key as the old photo, so take a fresh URL rather than the cached one.
              setView({ ...view, changingPhoto: false, imagesAt: 0 });
              void load();
            }}
            onCancel={
              view.changingPhoto ? () => setView({ ...view, changingPhoto: false }) : undefined
            }
          />
        );
      }
      return (
        <Waiting
          state={state}
          onChangePhoto={() => setView({ ...view, changingPhoto: true })}
          onSignOut={() => void signOut()}
        />
      );
    }
  }
};
