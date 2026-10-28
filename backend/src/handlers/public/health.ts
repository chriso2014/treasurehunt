import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import type { HealthResponse } from '@treasurehunt/shared';
import { nowIso } from '../../lib/clock.js';
import { config } from '../../lib/config.js';
import { json } from '../../lib/http.js';

export const handler = async (): Promise<APIGatewayProxyResultV2> => {
  const body: HealthResponse = { ok: true, env: config.env, time: nowIso() };
  return json(200, body);
};
