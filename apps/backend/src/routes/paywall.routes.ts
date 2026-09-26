/**
 * Paywall teaser routes — curiosity copy for the Pro paywall.
 *
 * POST /api/v1/paywall/teaser
 *
 * The AI is scoped to EXACTLY ONE user fact: the last best move. The client
 * sends it (from its local rescues history) so anonymous/edge users work
 * too; when the client sends nothing and the user is authenticated, the
 * route falls back to the most recent decided Rescue row in the database.
 *
 * Always 200: a missing Groq key / provider failure serves deterministic
 * copy with `source: "fallback"` — the paywall must never Surface an error.
 */
import type { FastifyInstance } from 'fastify';
import { Op } from 'sequelize';

import { ErrorCategory } from '@meal-rescue/shared-types';

import { Rescue } from '../database/models/rescue.model';
import { AppError } from '../lib/errors';
import { PaywallTeaserService, checkRateLimit } from '../services/paywall-teaser.service';

const paywallTeaser = new PaywallTeaserService();

function authedUserId(request: { user?: { sub?: string } }): string | null {
  return request.user?.sub ?? null;
}

type RescueRow = Rescue;

/** Map a persisted rescue into the single "last best move" context object. */
function rescueToMove(rescue: RescueRow): Record<string, unknown> | null {
  const originalRaw = rescue.originalMeal as { foods?: unknown } | null;
  const selected = rescue.selectedRecommendation as {
    candidate?: { additions?: Array<{ name?: string } | string>; actionType?: string };
  } | null;
  const candidate = selected?.candidate;

  const foods = Array.isArray(originalRaw?.foods)
    ? originalRaw.foods.map((f) => String(f).trim()).filter(Boolean)
    : [];
  const added = Array.isArray(candidate?.additions)
    ? candidate.additions
        .map((a) => (typeof a === 'string' ? a : (a?.name ?? '')))
        .map((name) => String(name).trim())
        .filter(Boolean)
    : [];

  if (foods.length === 0 && added.length === 0) return null;

  return {
    foods,
    added,
    actionType: candidate?.actionType ?? rescue.decisionAction ?? undefined,
    decision: rescue.userDecision === 'pending' ? undefined : (rescue.userDecision ?? undefined),
    outcome: rescue.satisfactionFeedback ?? null,
  };
}

/** Most recent decided rescue for the user (best-effort — never fatal). */
async function lastMoveFromDatabase(userId: string): Promise<Record<string, unknown> | null> {
  try {
    const rescue = await Rescue.findOne({
      where: { userId, userDecision: { [Op.ne]: 'pending' } },
      order: [['createdAt', 'DESC']],
    });
    return rescue ? rescueToMove(rescue) : null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        level: 'warn',
        msg: 'Paywall teaser DB lookup failed — proceeding with client context / cold start',
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}

export async function paywallRoutes(app: FastifyInstance) {
  app.post('/api/v1/paywall/teaser', async (request) => {
    const userId = authedUserId(request);
    if (!checkRateLimit(userId ?? request.ip)) {
      throw new AppError({
        category: ErrorCategory.RATE_LIMIT_EXCEEDED,
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please wait a moment and try again.',
        statusCode: 429,
      });
    }

    const body = (request.body ?? {}) as { lastMove?: unknown };
    const hasClientMove = body.lastMove !== undefined && body.lastMove !== null;
    const context = hasClientMove || !userId ? body.lastMove : await lastMoveFromDatabase(userId);

    const teaser = await paywallTeaser.generate(context);
    return { success: true, data: teaser };
  });
}
