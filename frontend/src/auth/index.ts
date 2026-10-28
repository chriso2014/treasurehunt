import { Amplify } from 'aws-amplify';
import { fetchAuthSession, signIn, signOut } from 'aws-amplify/auth';
import { teamSlug } from '@treasurehunt/shared';
import { config } from '../config.js';

// Amplify Auth v6 wrapper: the only place that talks to Cognito.
// Tokens are stored and refreshed by Amplify, so a reload stays signed in.

export const configureAuth = () => {
  if (!config.userPoolId || !config.userPoolClientId) return;
  Amplify.configure({
    Auth: {
      Cognito: { userPoolId: config.userPoolId, userPoolClientId: config.userPoolClientId },
    },
  });
};

export class SignInError extends Error {}

/** Signs in with the team name as typed; the username is its slug (ADR-004). */
export const signInTeam = async (teamName: string, password: string): Promise<void> => {
  await signOut().catch(() => undefined);
  try {
    const result = await signIn({
      username: teamSlug(teamName),
      password,
      options: { authFlowType: 'USER_SRP_AUTH' },
    });
    if (!result.isSignedIn) throw new SignInError('Sign-in needs another step');
  } catch (err) {
    if (err instanceof SignInError) throw err;
    if (err instanceof Error && err.name === 'NotAuthorizedException') {
      throw new SignInError('Team name or password is wrong');
    }
    throw err;
  }
};

/** The current access token, refreshed if needed; undefined when signed out. */
export const getAccessToken = async (): Promise<string | undefined> => {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.accessToken.toString();
  } catch {
    return undefined;
  }
};

export const signOutTeam = () => signOut();
