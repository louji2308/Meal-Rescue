import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { dbModels } from '../database/models';
import { AppError } from '../lib/errors';
import { buildServices } from '../services/composition';

const noteSchema = z.object({ note: z.string().max(300).optional() });

const correctSchema = z.object({
  note: z.string().max(300).optional(),
  correctedPolarity: z.enum(['positive', 'negative']),
  correctedValue: z.string().max(100).optional(),
});

function invalid(body: unknown): AppError {
  return AppError.badRequest('INVALID_OVERRIDE_INPUT', 'Body does not match the expected shape', {
    received: body,
  });
}

/**
 * Taste Journal API.
 *
 * GET   /api/v1/user/taste-journal                       -> full journal
 * GET   /api/v1/user/taste-journal/summary               -> numbers for the header
 * GET   /api/v1/user/taste-journal/patterns              -> YOUR PATTERNS
 * GET   /api/v1/user/taste-journal/dependent-patterns    -> IT DEPENDS
 * GET   /api/v1/user/taste-journal/discoveries           -> RECENTLY DISCOVERED
 * GET   /api/v1/user/taste-journal/still-learning        -> STILL LEARNING
 * GET   /api/v1/user/taste-journal/boundaries            -> YOUR BOUNDARIES columns
 * GET   /api/v1/user/taste-journal/insights/:id/evidence -> "why this?"
 * POST  /api/v1/user/taste-journal/insights/:id/dismiss  -> "That's not me"
 * POST  /api/v1/user/taste-journal/insights/:id/correct  -> "Actually it's X"
 * POST  /api/v1/user/taste-journal/insights/:id/forget   -> "Forget this"
 */
export async function tasteJournalRoutes(app: FastifyInstance): Promise<void> {
  const { tasteJournal } = buildServices(app.redis);

  app.get('/', async (request, reply) => {
    return reply.send(await tasteJournal.getJournal(request.user.sub));
  });

  app.get('/summary', async (request, reply) => {
    return reply.send(await tasteJournal.getSummary(request.user.sub));
  });

  app.get('/patterns', async (request, reply) => {
    return reply.send(await tasteJournal.getPatterns(request.user.sub));
  });

  app.get('/dependent-patterns', async (request, reply) => {
    return reply.send(await tasteJournal.getDependentPatterns(request.user.sub));
  });

  app.get('/discoveries', async (request, reply) => {
    return reply.send(await tasteJournal.getDiscoveries(request.user.sub));
  });

  app.get('/still-learning', async (request, reply) => {
    return reply.send(await tasteJournal.getStillLearning(request.user.sub));
  });

  app.get('/boundaries', async (request, reply) => {
    return reply.send(await tasteJournal.getBoundaries(request.user.sub));
  });

  app.get<{ Params: { id: string } }>('/insights/:id/evidence', async (request, reply) => {
    return reply.send(await tasteJournal.getEvidence(request.user.sub, request.params.id));
  });

  app.post<{ Params: { id: string } }>('/insights/:id/dismiss', async (request, reply) => {
    const parsed = noteSchema.safeParse(request.body ?? {});
    if (!parsed.success) throw invalid(request.body);
    return reply.send(
      await tasteJournal.override(request.user.sub, request.params.id, {
        action: 'DISMISS',
        note: parsed.data.note,
      }),
    );
  });

  app.post<{ Params: { id: string } }>('/insights/:id/correct', async (request, reply) => {
    const parsed = correctSchema.safeParse(request.body ?? {});
    if (!parsed.success) throw invalid(request.body);
    return reply.send(
      await tasteJournal.override(request.user.sub, request.params.id, {
        action: 'CORRECT',
        note: parsed.data.note,
        correctedPolarity: parsed.data.correctedPolarity,
        correctedValue: parsed.data.correctedValue,
      }),
    );
  });

  app.post<{ Params: { id: string } }>('/insights/:id/forget', async (request, reply) => {
    const parsed = noteSchema.safeParse(request.body ?? {});
    if (!parsed.success) throw invalid(request.body);
    return reply.send(
      await tasteJournal.override(request.user.sub, request.params.id, {
        action: 'FORGET',
        note: parsed.data.note,
      }),
    );
  });

  /**
   * GET /api/v1/user/taste-journal/preference-profile
   * Returns the user's onboarding preference profile formatted for display
   * (Option C style: checklist + hint line).
   */
  app.get('/preference-profile', async (request, reply) => {
    const { OnboardingPrefContextService } =
      await import('../services/onboarding-pref-context.service');
    const prefCtx = new OnboardingPrefContextService(dbModels);
    const profile = await prefCtx.buildContext(request.user.sub);
    return reply.send({ profile: profile ?? null });
  });
}
