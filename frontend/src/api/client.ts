import { healthResponseSchema, type HealthResponse } from '@treasurehunt/shared';

const apiUrl = import.meta.env.VITE_API_URL as string | undefined;

export const getHealth = async (): Promise<HealthResponse> => {
  if (!apiUrl) throw new Error('VITE_API_URL is not set');
  const res = await fetch(`${apiUrl}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return healthResponseSchema.parse(await res.json());
};
