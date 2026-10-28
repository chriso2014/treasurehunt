import type { GameContent, Question } from '@treasurehunt/shared';
import type { AttemptItem, StageItem, TeamProfile, TeamRecord } from '../src/lib/game.js';

// Small game for tests: route A = q1 (multiple choice), q2 (free text), q4 (dance).

export const contentConfig: GameContent['config'] = {
  title: 'Test',
  defaultPenaltyMs: 300_000,
  map: { centre: { lat: 51.9, lng: -0.28 }, zoom: 15 },
};

const base = { location: { name: 'Square', lat: 51.949, lng: -0.281 }, hint: { text: 'Look up' } };

export const q1: Question = {
  ...base,
  id: 'q1',
  type: 'multiple_choice',
  clue: { text: 'Where the market met', imageKey: 'content/q1.jpg' },
  question: { text: 'What colour is the door?' },
  options: [
    { id: 'a', text: 'Red' },
    { id: 'b', text: 'Blue' },
  ],
  correctOptionId: 'b',
};

export const q2: Question = {
  ...base,
  id: 'q2',
  type: 'free_text',
  location: { name: 'Church', lat: 51.948, lng: -0.279 },
  clue: { text: 'Bells' },
  question: { text: 'What year?' },
  acceptedAnswers: ['1850'],
  penaltyMs: { wrong: 60_000 },
};

export const q4: Question = {
  ...base,
  id: 'q4',
  type: 'video_call',
  clue: { text: 'Finish' },
  question: { text: 'Dance!' },
};

export const routeA = ['q1', 'q2', 'q4'];

export const profile = (overrides: Partial<TeamProfile> = {}): TeamProfile => ({
  teamId: 'team-1',
  name: 'The Wanderers',
  slug: 'the-wanderers',
  route: 'A',
  status: 'playing',
  currentStage: 1,
  registeredAt: '2026-10-28T09:00:00.000Z',
  totalActiveMs: 0,
  totalPenaltyMs: 0,
  ...overrides,
});

export const stage = (overrides: Partial<StageItem> = {}): StageItem => ({
  stage: 1,
  questionId: 'q1',
  status: 'clue',
  clueShownAt: '2026-10-28T10:00:00.000Z',
  activeMs: 0,
  wrongAttempts: 0,
  declines: 0,
  hintUsed: false,
  skipped: false,
  penaltyMs: 0,
  ...overrides,
});

export const attempt = (overrides: Partial<AttemptItem> = {}): AttemptItem => ({
  stage: 1,
  attemptId: '00000000-0000-4000-8000-000000000001',
  questionId: 'q1',
  type: 'multiple_choice',
  submittedAt: '2026-10-28T10:05:00.000Z',
  value: 'a',
  result: 'wrong',
  ...overrides,
});

export const record = (r: Partial<TeamRecord> = {}): TeamRecord => ({
  profile: profile(),
  stages: [stage()],
  attempts: [],
  ...r,
});

/** DynamoDB items as a Query on the team's partition returns them. */
export const teamItems = (r: TeamRecord) => [
  { PK: 'TEAM#team-1', SK: 'PROFILE', ...r.profile },
  ...r.stages.map((s) => ({
    PK: 'TEAM#team-1',
    SK: `STAGE#${String(s.stage).padStart(2, '0')}`,
    ...s,
  })),
  ...r.attempts.map((a) => ({ PK: 'TEAM#team-1', SK: `ATTEMPT#0${a.stage}#${a.attemptId}`, ...a })),
];
