import { randomUUID } from 'node:crypto';

import type {
  CreateMemberRequest,
  HouseholdMemberConstraints,
  HouseholdMemberProfile,
  HouseholdMemberSoftPreferences,
  HouseholdRelationship,
  UUID,
  UpdateMemberRequest,
} from '@meal-rescue/shared-types';
import { ErrorCategory } from '@meal-rescue/shared-types';

import type { Db } from '../../database/models';
import { AppError } from '../../lib/errors';
import { type HouseholdMemberRow, memberToProfile } from './household.service';

const EMPTY_CONSTRAINTS: HouseholdMemberConstraints = {
  allergies: [],
  dietaryRestrictions: [],
  avoidIngredients: [],
};

const EMPTY_PREFERENCES: HouseholdMemberSoftPreferences = {
  likes: [],
  dislikes: [],
};

function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export class HouseholdMemberService {
  private readonly models: Db['models'];

  constructor(models: Db['models']) {
    this.models = models;
  }

  async listForHousehold(householdId: UUID): Promise<HouseholdMemberProfile[]> {
    const rows = await this.models.HouseholdMember.findAll({
      where: { householdId },
      order: [['createdAt', 'ASC']],
    });
    return rows.map((row) => memberToProfile(row.get({ plain: true }) as HouseholdMemberRow));
  }

  async create(householdId: UUID, input: CreateMemberRequest): Promise<HouseholdMemberProfile> {
    const memberId = randomUUID();
    const member = await this.models.HouseholdMember.create({
      id: memberId,
      householdId,
      displayName: input.displayName.trim(),
      initials: initialsFor(input.displayName),
      relationship: (input.relationship ?? 'other') as HouseholdRelationship,
      isOwner: false,
      active: true,
      constraints: { ...EMPTY_CONSTRAINTS, ...input.constraints },
      preferences: { ...EMPTY_PREFERENCES, ...input.preferences },
    });
    return memberToProfile(member.get({ plain: true }) as HouseholdMemberRow);
  }

  async update(
    householdId: UUID,
    memberId: UUID,
    input: UpdateMemberRequest,
  ): Promise<HouseholdMemberProfile> {
    const member = await this.ownedMember(householdId, memberId);

    const patch: Record<string, unknown> = {};
    if (input.displayName !== undefined) {
      patch.displayName = input.displayName.trim();
      patch.initials = initialsFor(input.displayName);
    }
    if (input.relationship !== undefined) patch.relationship = input.relationship;
    if (input.active !== undefined) patch.active = input.active;
    if (input.constraints !== undefined) {
      const merged = { ...EMPTY_CONSTRAINTS, ...member.get('constraints'), ...input.constraints };
      patch.constraints = merged;
    }
    if (input.preferences !== undefined) {
      const merged = { ...EMPTY_PREFERENCES, ...member.get('preferences'), ...input.preferences };
      patch.preferences = merged;
    }

    if (Object.keys(patch).length > 0) {
      await member.update(patch as never);
    }
    return memberToProfile(member.get({ plain: true }) as HouseholdMemberRow);
  }

  async remove(householdId: UUID, memberId: UUID): Promise<boolean> {
    const member = await this.ownedMember(householdId, memberId);
    if (member.get('isOwner')) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'CANT_DELETE_OWNER',
        message: 'The household owner member cannot be deleted',
        statusCode: 400,
        recoverable: true,
      });
    }
    await member.destroy();
    return true;
  }

  /** Loads a member and asserts it belongs to this household. */
  async ownedMember(
    householdId: UUID,
    memberId: UUID,
  ): Promise<InstanceType<Db['models']['HouseholdMember']>> {
    const member = await this.models.HouseholdMember.findOne({
      where: { id: memberId, householdId },
    });
    if (!member) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'MEMBER_NOT_FOUND',
        message: 'Household member not found',
        statusCode: 404,
        recoverable: true,
      });
    }
    return member;
  }
}
