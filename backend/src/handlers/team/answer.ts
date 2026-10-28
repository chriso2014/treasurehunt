import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { answerRequestSchema, type AnswerResponse } from '@treasurehunt/shared';
import { isLostRace, loadForAction } from '../../lib/actions.js';
import { checkFreeText, checkMultipleChoice } from '../../lib/answers.js';
import { teamIdFrom, type AuthedEvent } from '../../lib/auth.js';
import { db } from '../../lib/aws.js';
import { clock } from '../../lib/clock.js';
import { config } from '../../lib/config.js';
import { getContentConfig, getQuestion, getRoute, penaltyFor } from '../../lib/content.js';
import { attemptKey, stageKey, type AttemptItem } from '../../lib/game.js';
import { AppError, json, parseBody, route } from '../../lib/http.js';
import { logger } from '../../lib/logger.js';
import { completeStageItems } from '../../lib/progress.js';
import { loadState } from '../../lib/state.js';

// POST /teams/me/current/answer { stage, attemptId, optionId | text }.
// Wrong: +penalty, try again. Correct: the stage completes and the next clue opens.
// The attempt is written with the stage change in one transaction keyed by attemptId, so a
// retried submission is applied once and then answered from the stored attempt.
export const handler = route(async (event: AuthedEvent) => {
  const teamId = teamIdFrom(event);
  const body = parseBody(event, answerRequestSchema);
  const ctx = await loadForAction(teamId, body.stage);

  const previous = ctx?.record.attempts.find((a) => a.attemptId === body.attemptId);
  if (!ctx || previous) {
    const body: AnswerResponse = {
      correct: previous ? previous.result === 'correct' : null,
      state: await loadState(teamId),
    };
    return json(200, body);
  }

  const { record, stage } = ctx;
  if (stage.status !== 'revealed') throw new AppError('INVALID_STATE', 'Reveal the question first');
  const question = await getQuestion(stage.questionId);

  let correct: boolean;
  let value: string;
  if (question.type === 'multiple_choice' && 'optionId' in body) {
    correct = checkMultipleChoice(question, body.optionId);
    value = body.optionId;
  } else if (question.type === 'free_text' && 'text' in body) {
    correct = checkFreeText(question, body.text);
    value = body.text;
  } else {
    throw new AppError('VALIDATION', 'Wrong kind of answer for this question');
  }

  const now = clock.now();
  const attempt: AttemptItem = {
    stage: stage.stage,
    attemptId: body.attemptId,
    questionId: question.id,
    type: question.type,
    submittedAt: now.toISOString(),
    value,
    result: correct ? 'correct' : 'wrong',
  };
  const putAttempt = {
    Put: {
      TableName: config.gameTable,
      Item: { ...attemptKey(teamId, stage.stage, body.attemptId), ...attempt },
      ConditionExpression: 'attribute_not_exists(PK)',
    },
  };

  let items;
  if (correct) {
    const routeIds = await getRoute(record.profile.route);
    items = [
      putAttempt,
      ...completeStageItems({
        profile: record.profile,
        stage,
        nextQuestionId: routeIds[stage.stage],
        outcome: 'correct',
        now,
      }),
    ];
  } else {
    const penalty = penaltyFor('wrong', question, await getContentConfig());
    items = [
      putAttempt,
      {
        Update: {
          TableName: config.gameTable,
          Key: stageKey(teamId, stage.stage),
          UpdateExpression: 'SET penaltyMs = penaltyMs + :p, wrongAttempts = wrongAttempts + :one',
          ConditionExpression: '#status = :revealed',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':p': penalty, ':one': 1, ':revealed': 'revealed' },
        },
      },
    ];
  }

  try {
    await db.send(new TransactWriteCommand({ TransactItems: items }));
    logger.info('answered', {
      teamId,
      stage: stage.stage,
      action: 'answer',
      result: attempt.result,
    });
  } catch (err) {
    if (!isLostRace(err)) throw err;
    // Another request got there first: report whatever is stored now.
    const state = await loadState(teamId);
    const response: AnswerResponse = { correct: null, state };
    return json(200, response);
  }

  const response: AnswerResponse = { correct, state: await loadState(teamId) };
  return json(200, response);
});
