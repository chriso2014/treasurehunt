import { z } from 'zod';

// Schema for content/game.*.json, the seed file loaded into the Content table.
// See docs/04-data-model.md (Content table) and docs/02-domain-and-glossary.md (question types).

const imageKey = z
  .string()
  .regex(/^content\/[\w-]+\.(jpg|jpeg|png|webp)$/, 'must look like content/<name>.jpg');

const image = { imageKey: imageKey.optional() };

/** Roughly Hitchin: catches typos and swapped or missing minus signs (ADR-008). */
export const HITCHIN_BOUNDS = { minLat: 51.93, maxLat: 51.97, minLng: -0.31, maxLng: -0.25 };
const inHitchin = (p: { lat: number; lng: number }) =>
  p.lat >= HITCHIN_BOUNDS.minLat &&
  p.lat <= HITCHIN_BOUNDS.maxLat &&
  p.lng >= HITCHIN_BOUNDS.minLng &&
  p.lng <= HITCHIN_BOUNDS.maxLng;
const inHitchinMessage = 'must be in Hitchin (lat 51.93 to 51.97, lng -0.31 to -0.25)';

const point = z.strictObject({ lat: z.number(), lng: z.number() });

const location = z
  .strictObject({ name: z.string().min(1), lat: z.number(), lng: z.number() })
  .refine(inHitchin, inHitchinMessage);

const clue = z
  .strictObject({ text: z.string().min(1).optional(), ...image })
  .refine((c) => c.text || c.imageKey, 'needs text or imageKey');

const prompt = z.strictObject({ text: z.string().min(1), ...image });

const hint = z
  .strictObject({ text: z.string().min(1).optional(), ...image })
  .refine((h) => h.text || h.imageKey, 'needs text or imageKey');

const durationMs = z.number().int().nonnegative();

const penaltyMs = z.strictObject({
  wrong: durationMs.optional(),
  hint: durationMs.optional(),
  skip: durationMs.optional(),
  declined: durationMs.optional(),
});

const questionId = z.string().regex(/^[\w-]+$/, 'letters, digits, - and _ only');

const base = {
  id: questionId,
  location,
  clue,
  question: prompt,
  hint,
  penaltyMs: penaltyMs.optional(),
};

const multipleChoice = z
  .strictObject({
    ...base,
    type: z.literal('multiple_choice'),
    options: z.array(z.strictObject({ id: z.string().min(1), text: z.string().min(1) })).min(2),
    correctOptionId: z.string().min(1),
  })
  .refine((q) => q.options.some((o) => o.id === q.correctOptionId), {
    message: 'correctOptionId must be one of the options',
    path: ['correctOptionId'],
  })
  .refine((q) => new Set(q.options.map((o) => o.id)).size === q.options.length, {
    message: 'option ids must be unique',
    path: ['options'],
  });

const freeText = z.strictObject({
  ...base,
  type: z.literal('free_text'),
  acceptedAnswers: z.array(z.string().min(1)).min(1),
  matching: z
    .strictObject({
      maxTypos: z.number().int().nonnegative().optional(),
      ignoreArticles: z.boolean().optional(),
      contains: z.array(z.string().min(1)).optional(),
      numeric: z
        .strictObject({ value: z.number(), tolerance: z.number().nonnegative() })
        .optional(),
    })
    .optional(),
});

const photo = z.strictObject({ ...base, type: z.literal('photo') });

const videoCall = z.strictObject({ ...base, type: z.literal('video_call') });

export const questionSchema = z.discriminatedUnion('type', [
  multipleChoice,
  freeText,
  photo,
  videoCall,
]);

export const gameContentSchema = z
  .strictObject({
    _comment: z.string().optional(),
    config: z.strictObject({
      title: z.string().min(1),
      defaultPenaltyMs: durationMs,
      map: z.strictObject({
        centre: point.refine(inHitchin, inHitchinMessage),
        zoom: z.number().int().min(1).max(20),
      }),
    }),
    routes: z.strictObject({
      A: z.array(questionId).min(1),
      B: z.array(questionId).min(1),
    }),
    questions: z.array(questionSchema).min(1),
  })
  .superRefine((content, ctx) => {
    const ids = content.questions.map((q) => q.id);
    const idSet = new Set(ids);
    if (idSet.size !== ids.length) {
      ctx.addIssue({ code: 'custom', message: 'question ids must be unique', path: ['questions'] });
    }

    const videoCalls = content.questions.filter((q) => q.type === 'video_call');
    if (videoCalls.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'there must be exactly one video_call question',
        path: ['questions'],
      });
    }

    for (const name of ['A', 'B'] as const) {
      const route = content.routes[name];
      const path = ['routes', name];
      if (new Set(route).size !== route.length) {
        ctx.addIssue({ code: 'custom', message: 'route visits a question twice', path });
      }
      const missing = ids.filter((id) => !route.includes(id));
      const unknown = route.filter((id) => !idSet.has(id));
      if (missing.length > 0) {
        ctx.addIssue({ code: 'custom', message: `route is missing ${missing.join(', ')}`, path });
      }
      if (unknown.length > 0) {
        ctx.addIssue({ code: 'custom', message: `unknown questions ${unknown.join(', ')}`, path });
      }
      if (videoCalls[0] && route.at(-1) !== videoCalls[0].id) {
        ctx.addIssue({
          code: 'custom',
          message: 'route must end with the video_call question',
          path,
        });
      }
    }
  });

export type Question = z.infer<typeof questionSchema>;
export type GameContent = z.infer<typeof gameContentSchema>;
export type RouteName = keyof GameContent['routes'];

/** Every image key referenced by the content, for uploading to the assets bucket. */
export const contentImageKeys = (content: GameContent): string[] => [
  ...new Set(
    content.questions
      .flatMap((q) => [q.clue.imageKey, q.question.imageKey, q.hint.imageKey])
      .filter((k): k is string => k !== undefined),
  ),
];
