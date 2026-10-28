import { QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { QuestionType, ReviewDecision } from '@treasurehunt/shared';
import { isLostRace } from './actions.js';
import { db } from './aws.js';
import { config } from './config.js';
import { getContentConfig, getQuestion, getRoute, penaltyFor } from './content.js';
import {
  attemptKey,
  currentStageOf,
  getTeam,
  loadTeam,
  REVIEW_PENDING,
  stageKey,
  type AttemptItem,
} from './game.js';
import { AppError } from './http.js';
import { completeStageItems } from './progress.js';

// GM review of photo and dance submissions (ADR-009). The decision and its effect on the stage
// are one transaction, conditional on the attempt still being pending.

export type PendingReview = {
  teamId: string;
  teamName: string;
  stage: number;
  attemptId: string;
  questionId: string;
  type: QuestionType;
  submittedAt: string;
  photoKey?: string;
};

/** The review queue, oldest first. */
export const listPendingReviews = async (): Promise<PendingReview[]> => {
  const res = await db.send(
    new QueryCommand({
      TableName: config.gameTable,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pending',
      ExpressionAttributeValues: { ':pending': REVIEW_PENDING },
    }),
  );
  const items = (res.Items ?? []) as (AttemptItem & { PK: string })[];
  const teamIds = [...new Set(items.map((i) => i.PK.slice('TEAM#'.length)))];
  const names = new Map(
    await Promise.all(teamIds.map(async (id) => [id, (await getTeam(id)).name] as const)),
  );
  return items.map((i) => {
    const teamId = i.PK.slice('TEAM#'.length);
    return {
      teamId,
      teamName: names.get(teamId) ?? teamId,
      stage: i.stage,
      attemptId: i.attemptId,
      questionId: i.questionId,
      type: i.type,
      submittedAt: i.submittedAt,
      ...(i.photoKey ? { photoKey: i.photoKey } : {}),
    };
  });
};

/**
 * Applies a decision. Approved: the stage completes. Declined photo: penalty, the timer resumes
 * and the team can send another. Declined dance: penalty and the team finishes (no retry).
 * Returns false if the attempt was already decided (a repeated tap), true otherwise.
 */
export const applyReview = async (
  args: {
    teamId: string;
    attemptId: string;
    now: Date;
  } & ReviewDecision,
): Promise<boolean> => {
  const { teamId, attemptId, decision, now } = args;
  const reason = args.reason?.trim() || undefined;
  const record = await loadTeam(teamId);
  const attempt = record.attempts.find((a) => a.attemptId === attemptId);
  if (!attempt) throw new AppError('NOT_FOUND', 'Submission not found');
  if (attempt.result !== 'pending') return false;
  const stage = currentStageOf(record);
  if (!stage || stage.stage !== attempt.stage || stage.status !== 'awaiting_review') {
    throw new AppError('INVALID_STATE', 'That submission is no longer waiting for review');
  }

  const question = await getQuestion(stage.questionId);
  const nowIso = now.toISOString();
  const decide = {
    Update: {
      TableName: config.gameTable,
      Key: attemptKey(teamId, stage.stage, attemptId),
      UpdateExpression: `SET #result = :decision, reviewedAt = :now${reason ? ', reason = :reason' : ''} REMOVE GSI1PK, GSI1SK`,
      ConditionExpression: '#result = :pending',
      ExpressionAttributeNames: { '#result': 'result' },
      ExpressionAttributeValues: {
        ':decision': decision,
        ':now': nowIso,
        ':pending': 'pending',
        ...(reason ? { ':reason': reason } : {}),
      },
    },
  };

  let items;
  if (decision === 'declined' && question.type === 'photo') {
    const penalty = penaltyFor('declined', question, await getContentConfig());
    items = [
      decide,
      {
        Update: {
          TableName: config.gameTable,
          Key: stageKey(teamId, stage.stage),
          UpdateExpression:
            'SET #status = :revealed, runningSince = :now, penaltyMs = penaltyMs + :p, declines = declines + :one',
          ConditionExpression: '#status = :awaiting',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':revealed': 'revealed',
            ':now': nowIso,
            ':p': penalty,
            ':one': 1,
            ':awaiting': 'awaiting_review',
          },
        },
      },
    ];
  } else {
    const [routeIds, contentConfig] = await Promise.all([
      getRoute(record.profile.route),
      getContentConfig(),
    ]);
    items = [
      decide,
      ...completeStageItems({
        profile: record.profile,
        stage,
        nextQuestionId: routeIds[stage.stage],
        outcome: decision,
        extraPenaltyMs:
          decision === 'declined' ? penaltyFor('declined', question, contentConfig) : 0,
        now,
      }),
    ];
  }

  try {
    await db.send(new TransactWriteCommand({ TransactItems: items }));
  } catch (err) {
    if (!isLostRace(err)) throw err;
    return false;
  }
  return true;
};
