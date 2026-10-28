// The only source of "now" on the server, so tests can control time.
export const clock = {
  now: (): Date => new Date(),
};

export const nowIso = (): string => clock.now().toISOString();
