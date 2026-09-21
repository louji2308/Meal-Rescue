import type { UUID } from '@meal-rescue/shared-types';

import type { Db } from '../database/models';
import type { UserTastePreferences } from '../database/models/user-taste-preferences.model';

const ADVENTURE_HINTS: Record<string, string> = {
  stay_familiar: 'Stick to what works. Safe, proven additions.',
  familiar_twist: 'Familiar ingredients with a small twist are ideal.',
  surprise_me: "Don't default to safe/bland. Bold and unexpected is welcome.",
};

const RESCUE_NEED_HINTS: Record<string, string> = {
  protein: 'Prioritize protein additions.',
  fibre: 'Add fiber-rich ingredients.',
  flavour: 'Boost flavour — sauces, spices, fresh herbs.',
  texture: 'Add a textural contrast (crunch, creaminess).',
  vegetables: 'Sneak in vegetables.',
  variety: 'Introduce something new to the plate.',
};

const PRIORITY_HINTS: Record<string, string> = {
  quick: 'Quick prep always preferred.',
  cheap: 'Keep it budget-friendly.',
  healthy: 'Lean toward nutritious choices.',
  tasty: 'Taste comes first — flavour over health.',
  easy: 'Minimal effort, minimal cleanup.',
};

/**
 * Reads the user's stored onboarding preferences and formats them
 * as a structured context block for AI prompts.
 *
 * Format: Checklist + hint line (Option C).
 */
export class OnboardingPrefContextService {
  private readonly models: Db['models'];

  constructor(models: Db['models']) {
    this.models = models;
  }

  /**
   * Build the full preference context string from stored onboarding answers.
   * Returns undefined when no preferences are stored.
   */
  async buildContext(userId: UUID): Promise<string | undefined> {
    const prefs = await this.models.UserTastePreferences.findByPk(userId);
    if (!prefs) return undefined;

    const raw = prefs.get() as UserTastePreferences;
    return this.formatForPrompt(raw);
  }

  /**
   * Read stored dietary restrictions and religious/cultural requirements
   * from onboarding hard-nos. Used to auto-populate Constraints so they
   * are never silently lost between onboarding and rescue.
   */
  async getStoredDietaryConstraints(
    userId: UUID,
  ): Promise<{ dietaryRestrictions?: string[]; religiousCultural?: string[] }> {
    const prefs = await this.models.UserTastePreferences.findByPk(userId);
    if (!prefs) return {};

    const raw = prefs.get() as UserTastePreferences;
    const result: { dietaryRestrictions?: string[]; religiousCultural?: string[] } = {};

    if (raw.hardNos?.dietaryRestrictions?.length) {
      result.dietaryRestrictions = raw.hardNos.dietaryRestrictions;
    }
    if (raw.hardNos?.religiousCultural?.length) {
      result.religiousCultural = raw.hardNos.religiousCultural;
    }
    return result;
  }

  /**
   * Format preferences into Option C style: structured lines + hint.
   */
  private formatForPrompt(prefs: UserTastePreferences): string {
    const lines: string[] = [];

    // Flavours
    if (prefs.flavorPersonality?.length) {
      const labels = prefs.flavorPersonality.map((f) => f.replace(/_/g, ' ')).join(', ');
      lines.push(`FLAVOURS: ${labels}`);
    }

    // Texture
    const texture = this.formatTexture(prefs.texturePreferences);
    if (texture) {
      lines.push(`TEXTURE: ${texture}`);
    }

    // Cuisines — read from TasteMemory since that's where they're seeded
    // (handled externally; this service focuses on the preference data)

    // Adventurousness
    if (prefs.adventurousness) {
      const label = prefs.adventurousness.replace(/_/g, ' ');
      lines.push(`ADVENTURE: ${label}`);
    }

    // Rescue need
    if (prefs.rescueNeed?.length) {
      const labels = prefs.rescueNeed.map((r) => r.replace(/_/g, ' ')).join(', ');
      lines.push(`RESCUE NEED: ${labels}`);
    }

    // Priorities
    if (prefs.priorities?.length) {
      const labels = prefs.priorities.map((p) => p.replace(/_/g, ' ')).join(', ');
      lines.push(`SPEED: ${labels}`);
    }

    if (lines.length === 0) return '';

    // Build the hint line
    const hints: string[] = [];

    if (prefs.adventurousness) {
      const hint = ADVENTURE_HINTS[prefs.adventurousness];
      if (hint) hints.push(hint);
    }

    if (prefs.rescueNeed?.length) {
      for (const need of prefs.rescueNeed) {
        if (RESCUE_NEED_HINTS[need]) {
          hints.push(RESCUE_NEED_HINTS[need]);
        }
      }
    }

    if (prefs.priorities?.length) {
      for (const priority of prefs.priorities) {
        if (PRIORITY_HINTS[priority]) {
          hints.push(PRIORITY_HINTS[priority]);
        }
      }
    }

    if (hints.length > 0) {
      lines.push('');
      lines.push(`→ ${hints.join(' ')}`);
    }

    return lines.join('\n');
  }

  private formatTexture(prefs: UserTastePreferences['texturePreferences']): string {
    if (!prefs) return '';
    const parts: string[] = [];
    if (prefs.crunchiness)
      parts.push(prefs.crunchiness === 'crunchy' ? 'crunch wins' : 'soft preferred');
    if (prefs.creaminess)
      parts.push(prefs.creaminess === 'creamy' ? 'likes creaminess' : 'crisp over cream');
    if (prefs.moistness) parts.push(prefs.moistness === 'juicy' ? 'juicy > dry' : 'dry is fine');
    if (prefs.chewiness) parts.push(prefs.chewiness === 'chewy' ? 'chewy' : 'tender preferred');
    return parts.join(', ');
  }
}
