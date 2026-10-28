import type {
  GameContent,
  GameStatus,
  Question,
  StageResult,
  TeamState,
} from '@treasurehunt/shared';
import { getGameStatus, loadTeam, type StageItem, type TeamRecord } from './game.js';
import { getContentConfig, getQuestion, getRoute, penaltyFor } from './content.js';
import { clock } from './clock.js';
import { viewUrl } from './s3.js';
import { gmWhatsappUrl } from './whatsapp.js';
import { elapsedMs } from './timer.js';

// Builds the client `state` (docs/05-api-contract.md). Only earned information goes in:
// the question after Reveal, the hint after it's used, locations of finished stages only,
// and never correct answers.

export type StateInput = {
  gameStatus: GameStatus;
  record: TeamRecord;
  stageCount: number;
  contentConfig: GameContent['config'];
  /** Questions of the team's current and finished stages, by id. */
  questions: Map<string, Question>;
  now: Date;
  signUrl: (key: string) => Promise<string>;
  /** wa.me link to the GM, shown on the dance stage after Reveal. */
  whatsappUrl?: string | null;
};

const optionalUrl = (signUrl: StateInput['signUrl'], key: string | undefined) =>
  key ? signUrl(key) : Promise.resolve(null);

/** Splits a finished stage's penalty into its causes; anything left over (e.g. content changed). */
const stageResult = (
  s: StageItem,
  question: Question | undefined,
  contentConfig: GameContent['config'],
): StageResult => {
  const each = (kind: 'wrong' | 'declined' | 'hint' | 'skip') =>
    question ? penaltyFor(kind, question, contentConfig) : contentConfig.defaultPenaltyMs;
  const declines = s.declines + (s.outcome === 'declined' ? 1 : 0);
  const penalties: StageResult['penalties'] = [
    { kind: 'wrong' as const, count: s.wrongAttempts, ms: s.wrongAttempts * each('wrong') },
    { kind: 'declined' as const, count: declines, ms: declines * each('declined') },
    { kind: 'hint' as const, count: s.hintUsed ? 1 : 0, ms: s.hintUsed ? each('hint') : 0 },
    { kind: 'skip' as const, count: s.skipped ? 1 : 0, ms: s.skipped ? each('skip') : 0 },
  ].filter((p) => p.count > 0);
  const rest = s.penaltyMs - penalties.reduce((sum, p) => sum + p.ms, 0);
  if (rest !== 0) penalties.push({ kind: 'other', count: 1, ms: rest });
  return {
    stage: s.stage,
    outcome: s.outcome ?? (s.skipped ? 'skipped' : 'correct'),
    timeMs: s.activeMs,
    penaltyMs: s.penaltyMs,
    penalties,
  };
};

export const buildState = async (input: StateInput): Promise<TeamState> => {
  const { gameStatus, record, stageCount, contentConfig, questions, now, signUrl } = input;
  const { profile } = record;

  const done = record.stages
    .filter((s) => s.status === 'completed' || s.status === 'skipped')
    .sort((a, b) => a.stage - b.stage);
  const completedLocations = done.flatMap((s) => {
    const location = questions.get(s.questionId)?.location;
    return location ? [{ name: location.name, lat: location.lat, lng: location.lng }] : [];
  });

  const stage =
    profile.status === 'playing'
      ? record.stages.find((s) => s.stage === profile.currentStage)
      : undefined;
  const question = stage && questions.get(stage.questionId);

  let current: TeamState['current'] = null;
  let currentMs = 0;
  if (stage && question) {
    const elapsed = elapsedMs(stage, now);
    currentMs = elapsed + stage.penaltyMs;
    const revealed = stage.status !== 'clue';
    const latest = record.attempts
      .filter((a) => a.stage === stage.stage)
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
      .at(-1);
    current = {
      stage: stage.stage,
      status: stage.status,
      type: question.type,
      clue: {
        text: question.clue.text ?? null,
        imageUrl: await optionalUrl(signUrl, question.clue.imageKey),
      },
      question: revealed
        ? {
            text: question.question.text,
            imageUrl: await optionalUrl(signUrl, question.question.imageKey),
            options:
              question.type === 'multiple_choice'
                ? question.options.map((o) => ({ id: o.id, text: o.text }))
                : null,
          }
        : null,
      hint: stage.hintUsed
        ? {
            text: question.hint.text ?? null,
            imageUrl: await optionalUrl(signUrl, question.hint.imageKey),
          }
        : null,
      timer: {
        elapsedMs: elapsed,
        running: stage.runningSince !== undefined,
        serverTime: now.toISOString(),
      },
      penaltyMs: stage.penaltyMs,
      hintPenaltyMs: penaltyFor('hint', question, contentConfig),
      skipPenaltyMs: penaltyFor('skip', question, contentConfig),
      hintUsed: stage.hintUsed,
      canSkip: stage.hintUsed && stage.status === 'revealed' && question.type !== 'video_call',
      lastResult: latest ? { result: latest.result, reason: latest.reason ?? null } : null,
      whatsappUrl: question.type === 'video_call' && revealed ? (input.whatsappUrl ?? null) : null,
    };
  }

  return {
    game: { status: gameStatus },
    team: {
      name: profile.name,
      route: profile.route,
      status: profile.status,
      photoUrl: await optionalUrl(signUrl, profile.photoKey),
      stage: profile.currentStage,
      stageCount,
      totalMs: profile.totalActiveMs + profile.totalPenaltyMs + currentMs,
    },
    current,
    completedLocations,
    results: done.map((s) => stageResult(s, questions.get(s.questionId), contentConfig)),
  };
};

/** Loads everything for the caller's state from DynamoDB (+ cached content) and builds it. */
export const loadState = async (teamId: string): Promise<TeamState> => {
  const [gameStatus, record] = await Promise.all([getGameStatus(), loadTeam(teamId)]);
  const [route, contentConfig] = await Promise.all([
    getRoute(record.profile.route),
    getContentConfig(),
  ]);
  const ids = new Set(record.stages.map((s) => s.questionId));
  const questions = new Map(
    await Promise.all([...ids].map(async (id) => [id, await getQuestion(id)] as const)),
  );
  const current = record.stages.find((s) => s.stage === record.profile.currentStage);
  const onDance = current !== undefined && questions.get(current.questionId)?.type === 'video_call';
  return buildState({
    gameStatus,
    record,
    stageCount: route.length,
    contentConfig,
    questions,
    now: clock.now(),
    signUrl: viewUrl,
    whatsappUrl: onDance ? await gmWhatsappUrl() : null,
  });
};
