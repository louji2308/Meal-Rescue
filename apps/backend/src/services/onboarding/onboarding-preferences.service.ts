import type { Db } from '../../database/models';
import type {
  StoredHardNos,
  StoredTexturePreferences,
} from '../../database/models/user-taste-preferences.model';
import type { TasteJournalService } from '../taste-journal/taste-journal.service';
import type { TasteMemoryService } from '../taste-memory.service';

export interface OnboardingHardNos {
  allergies?: string[];
  avoidIngredients?: string[];
  dietaryRestrictions?: string[];
  religiousCultural?: string[];
  strongDislikes?: string[];
}

export interface OnboardingTexturePreferences {
  crunchiness?: 'crunchy' | 'soft';
  creaminess?: 'creamy' | 'crisp';
  moistness?: 'juicy' | 'dry';
  chewiness?: 'chewy' | 'tender';
}

export interface OnboardingPreferencesInput {
  hardNos?: OnboardingHardNos;
  flavorPersonality?: string[];
  texturePreferences?: OnboardingTexturePreferences;
  adventurousness?: string;
  rescueNeed?: string[];
  priorities?: string[];
  /** Verbatim copy of the question each answer belongs to. */
  questions?: Record<string, string>;
}

export interface OnboardingPreferencesResult {
  saved: boolean;
  recorded: {
    flavors: number;
    textures: number;
    hardNos: number;
  };
}

export interface OnboardingPreferencesRecord {
  hardNos: StoredHardNos;
  flavorPersonality: string[];
  texturePreferences: StoredTexturePreferences;
  adventurousness: string | null;
  rescueNeed: string[];
  priorities: string[];
  questions: Record<string, string>;
  savedAt: Date;
}

const FLAVOR_LABELS: Record<string, string> = {
  bright_tangy: 'Bright & Tangy',
  deep_savory: 'Deep & Savory',
  hot_spicy: 'Hot & Spicy',
  fresh_light: 'Fresh & Light',
  creamy_comforting: 'Creamy & Comforting',
  mild_familiar: 'Mild & Familiar',
};

const TEXTURE_LABELS: Record<string, string> = {
  crunchy: 'Crunchy',
  soft: 'Soft',
  creamy: 'Creamy',
  crisp: 'Crisp',
  juicy: 'Juicy',
  dry: 'Dry',
  chewy: 'Chewy',
  tender: 'Tender',
};

const QUESTION_DEFAULTS: Record<string, string> = {
  hardNos: 'What should Meal Rescue never suggest?',
  flavorPersonality: 'Which direction usually wins?',
  texturePairs: 'Texture matters too. Pick one from each pair.',
  adventurousness: 'When I rescue your meal, I should usually...',
  rescueNeed: 'My meal usually needs...',
  priorities: 'What should I prioritize when I suggest something?',
};

/**
 * OnboardingPreferencesService - persists the answers to the setup questions
 * in the user_taste_preferences table AND folds them into the taste journal so
 * they actually steer suggestions:
 *
 *  - flavor picks become positive `flavor` signals (render as "Loves ..."),
 *  - texture picks become positive `texture` signals ("Prefers ..."),
 *  - every hard no becomes a negative `ingredient` signal and a TasteMemory
 *    border row, which surfaces as avoidedFoods and steers candidate
 *    generation + ranking away from it.
 *
 * Every signal carries the question the answer came from as its note, so the
 * journal can always trace a strand back to the setup question.
 */
export class OnboardingPreferencesService {
  private readonly models: Db['models'];
  private readonly tasteJournal: TasteJournalService;
  private readonly tasteMemory: TasteMemoryService;

  constructor(
    models: Db['models'],
    tasteJournal: TasteJournalService,
    tasteMemory: TasteMemoryService,
  ) {
    this.models = models;
    this.tasteJournal = tasteJournal;
    this.tasteMemory = tasteMemory;
  }

  async save(
    userId: string,
    input: OnboardingPreferencesInput,
  ): Promise<OnboardingPreferencesResult> {
    const hardNos = normalizeHardNos(input.hardNos);
    const flavorPersonality = normalizeList(input.flavorPersonality);
    const texturePreferences = normalizeTextures(input.texturePreferences);
    const rescueNeed = normalizeList(input.rescueNeed);
    const priorities = normalizeList(input.priorities);
    const adventurousness = input.adventurousness?.trim().slice(0, 40) || null;
    const questions = { ...QUESTION_DEFAULTS, ...(input.questions ?? {}) };
    const questionFor = (key: string): string => questions[key] ?? QUESTION_DEFAULTS[key] ?? '';

    await this.models.UserTastePreferences.upsert({
      userId,
      hardNos,
      flavorPersonality,
      texturePreferences,
      adventurousness,
      rescueNeed,
      priorities,
      questions,
    });

    let flavors = 0;
    for (const pick of flavorPersonality) {
      const label = FLAVOR_LABELS[pick] ?? pick;
      await this.#addSignal(userId, {
        dimension: 'flavor',
        value: label,
        polarity: 'positive',
        sourceEventKey: `onboardingpref:flavor:${pick}`,
        note: questionFor('flavorPersonality'),
      });
      flavors++;
    }

    let textures = 0;
    for (const value of Object.values(texturePreferences).filter(Boolean)) {
      await this.#addSignal(userId, {
        dimension: 'texture',
        value: TEXTURE_LABELS[value] ?? value,
        polarity: 'positive',
        sourceEventKey: `onboardingpref:texture:${value}`,
        note: questionFor('texturePairs'),
      });
      textures++;
    }

    const allHardNos = normalizeList([
      ...hardNos.allergies,
      ...hardNos.avoidIngredients,
      ...hardNos.dietaryRestrictions,
      ...hardNos.religiousCultural,
      ...hardNos.strongDislikes,
    ]);
    for (const item of allHardNos) {
      await this.#addSignal(userId, {
        dimension: 'ingredient',
        value: item,
        polarity: 'negative',
        sourceEventKey: `onboardingpref:hardno:${item}`,
        note: questionFor('hardNos'),
      });
    }
    if (allHardNos.length > 0) {
      await this.tasteMemory.seedOnboardingHardNos(userId, allHardNos);
    }

    return {
      saved: true,
      recorded: { flavors, textures, hardNos: allHardNos.length },
    };
  }

  async get(userId: string): Promise<OnboardingPreferencesRecord | null> {
    const row = await this.models.UserTastePreferences.findOne({ where: { userId } });
    if (!row) return null;
    const data = row.get({ plain: true });
    return {
      hardNos: data.hardNos,
      flavorPersonality: data.flavorPersonality,
      texturePreferences: data.texturePreferences,
      adventurousness: data.adventurousness,
      rescueNeed: data.rescueNeed,
      priorities: data.priorities,
      questions: data.questions,
      savedAt: data.updatedAt,
    };
  }

  async #addSignal(
    userId: string,
    args: {
      dimension: 'flavor' | 'texture' | 'ingredient';
      value: string;
      polarity: 'positive' | 'negative';
      sourceEventKey: string;
      note: string;
    },
  ): Promise<void> {
    await this.tasteJournal.addSignal({
      userId,
      dimension: args.dimension,
      value: args.value,
      polarity: args.polarity,
      source: 'ONBOARDING',
      sourceLabel: 'What you told us during setup',
      sourceEventKey: args.sourceEventKey,
      note: args.note,
    });
  }
}

function normalizeList(items: string[] | undefined): string[] {
  return [
    ...new Set(
      (items ?? [])
        .map((i) => i.trim().toLowerCase())
        .filter((i) => i.length > 0 && i.length <= 80),
    ),
  ];
}

function normalizeHardNos(input: OnboardingHardNos | undefined): {
  allergies: string[];
  avoidIngredients: string[];
  dietaryRestrictions: string[];
  religiousCultural: string[];
  strongDislikes: string[];
} {
  return {
    allergies: normalizeList(input?.allergies),
    avoidIngredients: normalizeList(input?.avoidIngredients),
    dietaryRestrictions: normalizeList(input?.dietaryRestrictions),
    religiousCultural: normalizeList(input?.religiousCultural),
    strongDislikes: normalizeList(input?.strongDislikes),
  };
}

function normalizeTextures(
  input: OnboardingTexturePreferences | undefined,
): OnboardingTexturePreferences {
  const out: OnboardingTexturePreferences = {};
  for (const [key, value] of Object.entries(input ?? {}) as Array<
    [keyof OnboardingTexturePreferences, string]
  >) {
    if (value) out[key] = value as never;
  }
  return out;
}
