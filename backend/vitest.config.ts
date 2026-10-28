import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      ENV: 'test',
      GAME_TABLE: 'game-table',
      CONTENT_TABLE: 'content-table',
      ASSETS_BUCKET: 'assets-bucket',
      USER_POOL_ID: 'eu-west-2_pool',
      AWS_REGION: 'eu-west-2',
      AWS_ACCESS_KEY_ID: 'test',
      AWS_SECRET_ACCESS_KEY: 'test',
      POWERTOOLS_LOG_LEVEL: 'SILENT',
    },
  },
});
