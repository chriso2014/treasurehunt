import { Logger } from '@aws-lambda-powertools/logger';

// Structured JSON logs. Never log passwords, tokens or answers.
export const logger = new Logger({ serviceName: 'treasurehunt' });
