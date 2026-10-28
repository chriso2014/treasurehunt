// Everything environment-specific comes from template.yaml environment variables.
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

export const config = {
  env: process.env.ENV ?? 'local',
  get gameTable() {
    return required('GAME_TABLE');
  },
  get contentTable() {
    return required('CONTENT_TABLE');
  },
  get assetsBucket() {
    return required('ASSETS_BUCKET');
  },
  get userPoolId() {
    return required('USER_POOL_ID');
  },
};
