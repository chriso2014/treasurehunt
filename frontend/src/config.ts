// Build-time config from frontend/.env.<env> (npm run frontend:env -- <env>).
export const config = {
  apiUrl: import.meta.env.VITE_API_URL as string | undefined,
  userPoolId: import.meta.env.VITE_USER_POOL_ID as string | undefined,
  userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID as string | undefined,
};
