// End-to-end check against the deployed dev stack (docs/10-testing.md): two test teams play the
// whole game through the real API, with double taps, retries, wrong answers, a hint, a skip, and
// photo and dance approvals and declines by a temporary game master. Totals, ranking and the
// public results are checked, then dev is reset.
//
//   npm run e2e:dev            # needs dev in registration with no teams (npm run reset -- dev)
//   npm run e2e:dev -- --keep  # leave the test teams in place afterwards, to look at them
import { randomUUID } from 'node:crypto';
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  adminActionResponseSchema,
  adminReviewsResponseSchema,
  adminTeamsResponseSchema,
  answerResponseSchema,
  photoConfirmResponseSchema,
  photoUploadResponseSchema,
  resultsResponseSchema,
  teamStateSchema,
  type Question,
  type TeamState,
} from '@treasurehunt/shared';
import type { z } from 'zod';
import { AWS_PROFILE, AWS_REGION, stackOutputs } from '../../scripts/aws.js';

const env = 'dev';
const keep = process.argv.includes('--keep');
process.env.AWS_PROFILE ??= AWS_PROFILE;
process.env.AWS_REGION ??= AWS_REGION;
const outputs = stackOutputs(`treasurehunt-backend-${env}`);
const apiUrl = outputs.ApiUrl!.replace(/\/$/, '');
process.env.GAME_TABLE = outputs.GameTable;
process.env.CONTENT_TABLE = outputs.ContentTable;
process.env.ASSETS_BUCKET = outputs.AssetsBucket;
process.env.USER_POOL_ID = outputs.UserPoolId;

const { resetGame } = await import('../src/lib/reset.js');
const { getGame } = await import('../src/lib/game.js');
const { getContentConfig, getQuestion, getRoute, penaltyFor } =
  await import('../src/lib/content.js');

const cognito = new CognitoIdentityProviderClient({ region: AWS_REGION });
const UserPoolId = outputs.UserPoolId!;
const ClientId = outputs.UserPoolClientId!;

// --- helpers ---------------------------------------------------------------------------------

let checks = 0;
const check = (ok: boolean, what: string): void => {
  if (!ok) throw new Error(`Check failed: ${what}`);
  checks++;
};
const step = (text: string) => console.log(`  ${text}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Reply = { status: number; body: unknown };
const call = async (
  method: 'GET' | 'POST',
  path: string,
  { token, body }: { token?: string; body?: unknown } = {},
): Promise<Reply> => {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as unknown) : null };
};
const ok = async <T extends z.ZodType>(
  schema: T,
  method: 'GET' | 'POST',
  path: string,
  opts?: { token?: string; body?: unknown },
): Promise<z.infer<T>> => {
  const r = await call(method, path, opts);
  if (r.status >= 300) throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(r.body)}`);
  return schema.parse(r.body);
};
const errorCode = (r: Reply) => (r.body as { error?: { code?: string } } | null)?.error?.code;

const signIn = async (username: string, password: string): Promise<string> => {
  const res = await cognito.send(
    new AdminInitiateAuthCommand({
      UserPoolId,
      ClientId,
      AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: username, PASSWORD: password },
    }),
  );
  const token = res.AuthenticationResult?.AccessToken;
  if (!token) throw new Error(`No token for ${username}`);
  return token;
};

/** A tiny JPEG: the API only checks that the upload arrived, not what it shows. */
const JPEG = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda0008010100003f00fbd3ffd9',
  'hex',
);
const uploadTo = async ({ url, fields }: z.infer<typeof photoUploadResponseSchema>) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('file', new Blob([JPEG], { type: 'image/jpeg' }), 'photo.jpg');
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`S3 upload: ${res.status} ${await res.text()}`);
};

// --- set-up ----------------------------------------------------------------------------------

type Team = { name: string; password: string; token: string; teamId: string; route: 'A' | 'B' };
const gm = { username: `e2e-gm-${randomUUID().slice(0, 8)}`, password: `E2e-${randomUUID()}` };
let gmToken = '';

const precheck = async () => {
  const [game, plan] = await Promise.all([getGame(), resetGame({ dryRun: true })]);
  if (game.status !== 'registration' || plan.teams > 0) {
    console.error(
      `Dev must be in registration with no teams (now: ${game.status}, ${plan.teams} team(s)). ` +
        'Run `npm run reset -- dev` first.',
    );
    process.exit(1);
  }
};

const createGm = async () => {
  await cognito.send(
    new AdminCreateUserCommand({ UserPoolId, Username: gm.username, MessageAction: 'SUPPRESS' }),
  );
  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId,
      Username: gm.username,
      Password: gm.password,
      Permanent: true,
    }),
  );
  await cognito.send(
    new AdminAddUserToGroupCommand({ UserPoolId, Username: gm.username, GroupName: 'gamemaster' }),
  );
  gmToken = await signIn(gm.username, gm.password);
};

const register = async (name: string): Promise<Team> => {
  const password = `e2e-${randomUUID()}`;
  const r = await call('POST', '/teams', { body: { name, password } });
  check(r.status === 201, `${name} registers (got ${r.status})`);
  const { teamId, slug, route } = r.body as { teamId: string; slug: string; route: 'A' | 'B' };
  const token = await signIn(slug, password);
  return { name, password, token, teamId, route };
};

// --- play --------------------------------------------------------------------------------------

type Plan = 'careful' | 'struggling';
const stateOf = (team: Team) =>
  ok(teamStateSchema, 'GET', '/teams/me/state', { token: team.token });
const act = (team: Team, action: string, body: unknown) =>
  ok(teamStateSchema, 'POST', `/teams/me/current/${action}`, { token: team.token, body });
const both = <T>(a: Promise<T>, b: Promise<T>) => Promise.all([a, b]);

/** Nothing the team hasn't earned may be in the state (CLAUDE.md core rules). */
const checkNoLeaks = (state: TeamState, question: Question, visited: string[]) => {
  const text = JSON.stringify(state);
  check(!/correctOptionId|acceptedAnswers|matching/.test(text), 'state has no answer fields');
  if (!state.current?.hintUsed && question.hint.text) {
    const shown = `${question.clue.text ?? ''} ${question.question.text}`;
    if (!shown.includes(question.hint.text)) {
      check(!text.includes(question.hint.text), 'unused hint is not sent');
    }
  }
  check(
    state.completedLocations.every((l) => visited.includes(l.name)),
    'map only shows places already found',
  );
};

const review = async (team: Team, decision: 'approved' | 'declined', reason?: string) => {
  const { reviews } = await ok(adminReviewsResponseSchema, 'GET', '/admin/reviews', {
    token: gmToken,
  });
  const item = reviews.find((r) => r.teamId === team.teamId);
  check(item !== undefined, `${team.name}'s submission is in the review queue`);
  const path = `/admin/reviews/${team.teamId}/${item!.attemptId}`;
  const body = { decision, reason };
  const [a, b] = await both(
    ok(adminActionResponseSchema, 'POST', path, { token: gmToken, body }),
    ok(adminActionResponseSchema, 'POST', path, { token: gmToken, body }),
  );
  check(a.applied !== b.applied, 'a double-tapped review decision is applied once');
};

const sendPhoto = async (team: Team, stage: number): Promise<TeamState> => {
  const attemptId = randomUUID();
  const upload = await ok(photoUploadResponseSchema, 'POST', '/teams/me/current/photo-upload', {
    token: team.token,
    body: { stage, attemptId },
  });
  await uploadTo(upload);
  const [state] = await both(
    act(team, 'photo', { stage, attemptId }),
    act(team, 'photo', { stage, attemptId }),
  );
  return state;
};

/** Plays one stage; returns the penalties expected on it. */
const playStage = async (
  team: Team,
  plan: Plan,
  question: Question,
  stage: number,
  visited: string[],
): Promise<{ ms: number; outcome: string }> => {
  const cfg = await getContentConfig();
  const p = (kind: 'wrong' | 'hint' | 'skip' | 'declined') => penaltyFor(kind, question, cfg);
  let expected = 0;

  const before = await stateOf(team);
  check(before.current?.stage === stage, `${team.name} is on stage ${stage}`);
  check(before.current?.question === null, 'the question is hidden until Reveal');
  checkNoLeaks(before, question, visited);

  const [revealed] = await both(act(team, 'reveal', { stage }), act(team, 'reveal', { stage }));
  check(revealed.current?.status === 'revealed', 'double-tapped Reveal reveals once');
  check(revealed.current?.timer.running === true, 'timer runs after Reveal');
  checkNoLeaks(revealed, question, visited);

  const answer = (body: object) =>
    ok(answerResponseSchema, 'POST', '/teams/me/current/answer', {
      token: team.token,
      body: { stage, ...body },
    });
  const hint = async () => {
    const [a] = await both(act(team, 'hint', { stage }), act(team, 'hint', { stage }));
    check(a.current?.hintUsed === true, 'hint is shown after asking');
    expected += p('hint');
  };

  switch (question.type) {
    case 'multiple_choice': {
      if (plan === 'careful') {
        const wrong = question.options.find((o) => o.id !== question.correctOptionId)!;
        const attemptId = randomUUID();
        const [w1, w2] = await both(
          answer({ attemptId, optionId: wrong.id }),
          answer({ attemptId, optionId: wrong.id }),
        );
        check(w1.correct === false && w2.correct === false, 'wrong option is wrong');
        expected += p('wrong');
      }
      const right = await answer({ attemptId: randomUUID(), optionId: question.correctOptionId });
      check(right.correct === true, 'correct option completes the stage');
      return { ms: expected, outcome: 'correct' };
    }
    case 'free_text': {
      const correctText =
        question.acceptedAnswers[0] ?? String(question.matching?.numeric?.value ?? '');
      await hint();
      if (plan === 'careful') {
        const wrong = await answer({ attemptId: randomUUID(), text: 'zzq e2e not it 97531' });
        check(wrong.correct === false, 'wrong text is wrong');
        expected += p('wrong');
        const right = await answer({ attemptId: randomUUID(), text: correctText });
        check(right.correct === true, 'accepted text completes the stage');
        return { ms: expected, outcome: 'correct' };
      }
      const [s1] = await both(act(team, 'skip', { stage }), act(team, 'skip', { stage }));
      check(s1.team.stage !== stage || s1.team.status === 'finished', 'skip moves on');
      expected += p('skip');
      const late = await answer({ attemptId: randomUUID(), text: correctText });
      check(late.correct === null, 'a late answer for a skipped stage is ignored');
      return { ms: expected, outcome: 'skipped' };
    }
    case 'photo': {
      const waiting = await sendPhoto(team, stage);
      check(waiting.current?.status === 'awaiting_review', 'photo waits for review');
      check(waiting.current?.timer.running === false, 'timer pauses during review');
      const pausedAt = waiting.current!.timer.elapsedMs;
      await sleep(1500);
      const still = await stateOf(team);
      check(still.current?.timer.elapsedMs === pausedAt, 'no time accrues while awaiting review');
      if (plan === 'careful') {
        await review(team, 'declined', 'e2e: not everyone is in shot');
        const declined = await stateOf(team);
        check(declined.current?.status === 'revealed', 'declined photo reopens the question');
        check(declined.current?.timer.running === true, 'timer resumes after a decline');
        check(
          declined.current?.lastResult?.reason === 'e2e: not everyone is in shot',
          'team sees the decline reason',
        );
        expected += p('declined');
        await sendPhoto(team, stage);
      }
      await review(team, 'approved');
      return { ms: expected, outcome: 'approved' };
    }
    case 'video_call': {
      const skip = await call('POST', '/teams/me/current/skip', {
        token: team.token,
        body: { stage },
      });
      check(skip.status === 409, 'the dance cannot be skipped');
      const attemptId = randomUUID();
      const [waiting] = await both(
        act(team, 'video-call', { stage, attemptId }),
        act(team, 'video-call', { stage, attemptId }),
      );
      check(waiting.current?.status === 'awaiting_review', 'dance call waits for the GM');
      if (!waiting.current?.whatsappUrl) step('note: no WhatsApp link (SSM number not set on dev)');
      if (plan === 'careful') {
        await review(team, 'approved');
        return { ms: expected, outcome: 'approved' };
      }
      await review(team, 'declined', 'e2e: more energy');
      expected += p('declined');
      return { ms: expected, outcome: 'declined' };
    }
  }
};

const playTeam = async (team: Team, plan: Plan) => {
  console.log(`${team.name} (route ${team.route}, ${plan})`);
  const ids = await getRoute(team.route);
  const visited: string[] = [];
  for (const [i, id] of ids.entries()) {
    const stage = i + 1;
    const question = await getQuestion(id);
    const want = await playStage(team, plan, question, stage, visited);
    visited.push(question.location.name);
    const after = await stateOf(team);
    const result = after.results.find((r) => r.stage === stage);
    check(result !== undefined, `stage ${stage} is in the results`);
    check(result!.outcome === want.outcome, `stage ${stage} outcome ${want.outcome}`);
    check(
      result!.penaltyMs === want.ms,
      `stage ${stage} penalties ${want.ms} ms (got ${result!.penaltyMs})`,
    );
    check(
      after.completedLocations.map((l) => l.name).join('|') === visited.join('|'),
      `map shows the ${visited.length} place(s) found, in order`,
    );
    step(`stage ${stage} ${question.type}: ${want.outcome}, +${want.ms / 60000} min`);
  }
  const done = await stateOf(team);
  check(done.team.status === 'finished' && done.current === null, `${team.name} finished`);
  const sum = done.results.reduce((t, r) => t + r.timeMs + r.penaltyMs, 0);
  check(done.team.totalMs === sum, 'total = time + penalties of every stage');
  return done.team.totalMs;
};

// --- run -----------------------------------------------------------------------------------------

const run = async () => {
  console.log(`e2e against ${env}: ${apiUrl}`);
  check((await call('GET', '/health')).status === 200, 'health');
  check((await call('GET', '/teams/me/state')).status === 401, 'state needs a token');
  check((await call('GET', '/results')).status === 404, 'results hidden before publishing');

  const alpha = await register('E2E Alpha');
  const bravo = await register('E2E Bravo');
  check(alpha.route !== bravo.route, 'routes alternate on registration');
  const taken = await call('POST', '/teams', {
    body: { name: 'e2e alpha', password: 'password1' },
  });
  check(errorCode(taken) === 'TEAM_NAME_TAKEN', 'a taken team name is refused');

  const photo = await ok(photoUploadResponseSchema, 'POST', '/teams/me/photo-upload', {
    token: alpha.token,
  });
  await uploadTo(photo);
  await ok(photoConfirmResponseSchema, 'POST', '/teams/me/photo-confirm', {
    token: alpha.token,
    body: { key: photo.key },
  });
  check((await stateOf(alpha)).team.photoUrl !== null, 'team photo is saved');

  const forbidden = await call('GET', '/admin/teams', { token: alpha.token });
  check(forbidden.status === 403, 'a team cannot use the admin API');
  const early = await call('POST', '/teams/me/current/reveal', {
    token: alpha.token,
    body: { stage: 1 },
  });
  check(early.status === 409, 'nothing can be revealed before the start');

  await createGm();
  const start = await call('POST', '/admin/game/start', { token: gmToken });
  check(start.status === 200, 'GM starts the game');
  const late = await call('POST', '/teams', { body: { name: 'E2E Late', password: 'password1' } });
  check(late.status === 409, 'registration closes at the start');

  const [alphaTotal, bravoTotal] = await Promise.all([
    playTeam(alpha, 'careful'),
    playTeam(bravo, 'struggling'),
  ]);

  const board = await ok(adminTeamsResponseSchema, 'GET', '/admin/teams', { token: gmToken });
  const ranked = board.teams.filter((t) => t.rank !== null);
  check(ranked.length === 2, 'both teams are ranked');
  check(ranked[0]!.totalMs <= ranked[1]!.totalMs, 'lowest total ranks first');
  check(
    board.teams.find((t) => t.teamId === alpha.teamId)?.totalMs === alphaTotal &&
      board.teams.find((t) => t.teamId === bravo.teamId)?.totalMs === bravoTotal,
    'leaderboard totals match the teams’ own totals',
  );

  await ok(adminActionResponseSchema, 'POST', '/admin/game/publish-results', { token: gmToken });
  const results = await ok(resultsResponseSchema, 'GET', '/results');
  check(
    results.teams.map((t) => t.name).join('|') === ranked.map((t) => t.name).join('|'),
    'public results match the leaderboard order',
  );
  const after = await call('POST', '/teams/me/current/reveal', {
    token: alpha.token,
    body: { stage: 1 },
  });
  check(errorCode(after) === 'GAME_NOT_LIVE', 'team actions stop once results are published');

  const fmt = (ms: number) =>
    `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`;
  console.log(`Results: ${ranked.map((t) => `${t.rank}. ${t.name} ${fmt(t.totalMs)}`).join(', ')}`);
};

await precheck();
let failed = false;
try {
  await run();
  console.log(`PASS: ${checks} checks`);
} catch (err) {
  failed = true;
  console.error(`FAIL after ${checks} checks:`, err instanceof Error ? err.message : err);
} finally {
  if (keep) {
    console.log('Kept the test teams (--keep). Run `npm run reset -- dev` when done.');
  } else {
    const removed = await resetGame();
    console.log(`Cleaned up: dev reset (${removed.teams} team(s) removed).`);
  }
  await cognito
    .send(new AdminDeleteUserCommand({ UserPoolId, Username: gm.username }))
    .catch(() => undefined);
}
process.exit(failed ? 1 : 0);
