import { describe, expect, it } from '@jest/globals';

import { ConvergenceEngineService } from '../src/services/common-table/convergence-engine.service';
import {
  HouseholdConstraintService,
  buildMemberTasteContext,
} from '../src/services/common-table/household-constraint.service';
import type { MemberTasteContext } from '../src/services/common-table/household-constraint.service';

function member(
  overrides: Partial<Parameters<typeof buildMemberTasteContext>[0]> = {},
): MemberTasteContext {
  return buildMemberTasteContext({
    memberId: overrides.memberId ?? '11111111-1111-1111-1111-111111111111',
    displayName: overrides.displayName ?? 'Alex',
    initials: overrides.initials ?? 'AL',
    relationship: 'partner',
    allergies: overrides.allergies ?? [],
    dietaryRestrictions: overrides.dietaryRestrictions ?? [],
    avoidIngredients: overrides.avoidIngredients ?? [],
    likes: overrides.likes ?? [],
    dislikes: overrides.dislikes ?? [],
    spiceLevel: overrides.spiceLevel,
    textures: overrides.textures ?? [],
    learned: overrides.learned ?? {},
  });
}

function converge(overrides: {
  members: MemberTasteContext[];
  providedIngredients?: string[];
  source?: 'text' | 'image' | 'kitchen' | 'any';
  effort?: 'quick' | 'normal';
  timeMinutes?: number;
  shoppingAllowed?: boolean;
}) {
  const engine = new ConvergenceEngineService();
  return engine.converge({
    members: overrides.members,
    providedIngredients: overrides.providedIngredients ?? [],
    source: overrides.source ?? 'text',
    effort: overrides.effort ?? 'normal',
    timeMinutes: overrides.timeMinutes,
    shoppingAllowed: overrides.shoppingAllowed ?? false,
  });
}

describe('Common Table safety matrix (HARD constraints are never relaxed)', () => {
  it('blocks a peanut-allergic ingredient globally and never ships it in the plan', () => {
    const alex = member({ allergies: ['peanut'] });
    const result = converge({
      members: [alex],
      providedIngredients: ['peanuts', 'rice', 'chicken', 'broccoli'],
    });

    expect(result.converged).toBe(true);
    expect(result.blockedIngredients).toContain('peanuts');
    expect(result.winner?.ingredients ?? []).not.toContain('peanuts');
    const constraints = new HouseholdConstraintService();
    for (const ingredient of result.winner?.ingredients ?? []) {
      expect(constraints.checkIngredient(ingredient, alex)).toBeNull();
    }
  });

  it('keeps every ingredient safe for a dairy-allergic member', () => {
    const dana = member({ allergies: ['dairy', 'milk'] });
    const result = converge({
      members: [dana],
      providedIngredients: ['rice', 'chicken', 'broccoli', 'olive oil'],
      shoppingAllowed: true,
    });

    expect(result.converged).toBe(true);
    const constraints = new HouseholdConstraintService();
    for (const ingredient of result.winner?.ingredients ?? []) {
      expect(constraints.checkIngredient(ingredient, dana)).toBeNull();
    }
    for (const finish of result.winner?.finishes ?? []) {
      for (const addition of finish.additions) {
        expect(constraints.checkIngredient(addition, dana)).toBeNull();
      }
    }
  });

  it('never offers an animal product to a vegan member', () => {
    const jordan = member({ dietaryRestrictions: ['vegan'] });
    const result = converge({
      members: [jordan],
      providedIngredients: ['chicken', 'canned chickpeas', 'firm tofu', 'rice', 'broccoli'],
    });

    expect(result.converged).toBe(true);
    const constraints = new HouseholdConstraintService();
    const winner = result.winner;
    expect(winner).not.toBeNull();
    for (const ingredient of winner?.ingredients ?? []) {
      expect(constraints.checkIngredient(ingredient, jordan)).toBeNull();
    }
  });

  it('returns an honest no-convergence fallback instead of a fabricated meal', () => {
    // Every possible carb the templates can use is explicitly avoided.
    const picky = member({
      avoidIngredients: ['rice', 'pasta', 'bread', 'potato', 'instant noodles', 'noodles'],
    });
    const result = converge({
      members: [picky],
      providedIngredients: ['rice', 'chicken', 'broccoli'],
    });

    expect(result.converged).toBe(false);
    expect(result.winner).toBeNull();
    expect(result.fallback).not.toBeNull();
    expect(result.fallback?.message.length ?? 0).toBeGreaterThan(0);
  });

  it('fails closed for unknown ingredients when a member has allergies', () => {
    const constraints = new HouseholdConstraintService();
    const sam = member({ allergies: ['peanut'] });
    // 'wifi router' has no ingredient-db record → cannot be proven safe.
    expect(constraints.checkIngredient('wifi router', sam)).not.toBeNull();
  });
});

describe('Common Table convergence core', () => {
  it('converges two same-preference members onto one shared base', () => {
    const a = member({
      displayName: 'A',
      memberId: '11111111-1111-1111-1111-111111111111',
      likes: ['chicken', 'rice'],
    });
    const b = member({
      displayName: 'B',
      memberId: '22222222-2222-2222-2222-222222222222',
      likes: ['chicken', 'rice'],
    });

    const result = converge({
      members: [a, b],
      providedIngredients: ['chicken', 'rice', 'broccoli'],
    });

    expect(result.converged).toBe(true);
    expect(result.winner).not.toBeNull();
    // Split point is derived, not hardcoded: shared steps run before branches.
    expect(result.winner!.splitPointIndex).toBe(result.winner!.sharedSteps.length);
    expect(result.winner!.finishes).toHaveLength(2);
  });

  it('branches a stage when one member cannot share the only protein available', () => {
    const likesChicken = member({
      memberId: '11111111-1111-1111-1111-111111111111',
      likes: ['chicken'],
    });
    const noChicken = member({
      memberId: '22222222-2222-2222-2222-222222222222',
      avoidIngredients: ['chicken'],
    });

    const result = converge({
      members: [likesChicken, noChicken],
      providedIngredients: ['chicken', 'rice', 'broccoli'],
    });

    expect(result.converged).toBe(true);
    expect(result.winner).not.toBeNull();
    // The protein step cannot stay shared — it branches after the shared base.
    const branched = (result.winner!.branchSteps ?? []).some((s) => s.title === 'Cook the protein');
    const sharedTitles = (result.winner!.sharedSteps ?? []).map((s) => s.title);
    expect(branched).toBe(true);
    expect(sharedTitles).not.toContain('Cook the protein');
    // Split point is derived, not hardcoded: shared steps run before branches.
    expect(result.winner!.splitPointIndex).toBe(result.winner!.sharedSteps.length);
  });

  it('derives spicy/mild finishes: spicy gets heat, mild gets none', () => {
    const spicy = member({ spiceLevel: 'spicy', memberId: '11111111-1111-1111-1111-111111111111' });
    const mild = member({ spiceLevel: 'mild', memberId: '22222222-2222-2222-2222-222222222222' });

    const result = converge({
      members: [spicy, mild],
      providedIngredients: ['chicken', 'rice', 'broccoli', 'hot sauce'],
      shoppingAllowed: true,
    });

    expect(result.converged).toBe(true);
    const spicyFinish = result.winner?.finishes.find((f) => f.memberId === spicy.memberId);
    const mildFinish = result.winner?.finishes.find((f) => f.memberId === mild.memberId);
    expect(spicyFinish?.additions).toContain('hot sauce');
    expect(mildFinish?.additions).not.toContain('hot sauce');
  });

  it('honors a tight time budget by choosing the no-cook platter', () => {
    const result = converge({
      members: [member()],
      providedIngredients: ['chicken', 'bread', 'broccoli', 'hummus'],
      effort: 'quick',
    });
    expect(result.converged).toBe(true);
    expect(result.winner?.noCook).toBe(true);
  });

  it('gives up honestly on unusable input (no fake convergence)', () => {
    const result = converge({
      members: [member()],
      providedIngredients: ['wifi router', 'desk lamp'],
    });
    expect(result.converged).toBe(false);
    expect(result.winner).toBeNull();
    expect(result.fallback).not.toBeNull();
  });
});
