import { GetParameterCommand } from '@aws-sdk/client-ssm';
import { ssm } from './aws.js';
import { config } from './config.js';
import { logger } from './logger.js';

// The GM's WhatsApp number lives in SSM (docs/08), so it never reaches the repo.
// wa.me opens a chat with the GM; the team then taps WhatsApp's video-call button.

const CACHE_MS = 5 * 60 * 1000;
let cached: { url: string | null; at: number } | undefined;

export const toWhatsappUrl = (number: string): string | null => {
  const digits = number.replace(/\D/g, '');
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
};

/** null if the parameter is missing or unreadable: the dance still works, the team asks the GM. */
export const gmWhatsappUrl = async (): Promise<string | null> => {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.url;
  let url: string | null = null;
  const name = config.whatsappParam;
  if (name) {
    try {
      const res = await ssm.send(new GetParameterCommand({ Name: name }));
      url = toWhatsappUrl(res.Parameter?.Value ?? '');
    } catch (err) {
      logger.warn('GM WhatsApp number not available', { name, err });
    }
  }
  cached = { url, at: Date.now() };
  return url;
};

export const clearWhatsappCache = () => {
  cached = undefined;
};
