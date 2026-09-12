import { randomUUID } from 'node:crypto';

import { Op } from 'sequelize';

import type {
  Household,
  HouseholdMemberProfile,
  HouseholdRelationship,
  UUID,
} from '@meal-rescue/shared-types';
import { ErrorCategory } from '@meal-rescue/shared-types';

import { sequelize } from '../../database';
import type { Db } from '../../database/models';
import { AppError } from '../../lib/errors';

function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export interface HouseholdMemberRow {
  id: UUID;
  householdId: UUID;
  displayName: string;
  initials: string;
  relationship: string;
  isOwner: boolean;
  active: boolean;
  constraints: HouseholdMemberProfile['constraints'];
  preferences: HouseholdMemberProfile['preferences'];
  createdAt: Date | string;
}

export function memberToProfile(row: HouseholdMemberRow): HouseholdMemberProfile {
  return {
    id: row.id,
    householdId: row.householdId,
    displayName: row.displayName,
    initials: row.initials,
    relationship: row.relationship as HouseholdRelationship,
    isOwner: row.isOwner,
    active: row.active,
    constraints: row.constraints,
    preferences: row.preferences,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

export class HouseholdService {
  private readonly models: Db['models'];

  constructor(models: Db['models']) {
    this.models = models;
  }

  async getForUser(userId: UUID): Promise<Household | null> {
    const household = await this.models.Household.findOne({ where: { ownerId: userId } });
    if (!household) return null;
    return this.hydrate(household);
  }

  async getOrCreateForUser(userId: UUID): Promise<Household> {
    const existing = await this.getForUser(userId);
    if (existing) return existing;
    return this.createForUser(userId);
  }

  /** Idempotent per user: create the household + owner member atomically. */
  async createForUser(userId: UUID, name?: string): Promise<Household> {
    const existing = await this.models.Household.findOne({ where: { ownerId: userId } });
    if (existing) return this.hydrate(existing);

    const profile = await this.models.User.findByPk(userId);
    if (!profile) throw AppError.notFound('User');

    const displayName = profile.get('email')
      ? (String(profile.get('email')).split('@')[0] ?? 'You')
      : 'You';
    const householdId = randomUUID();
    const memberId = randomUUID();

    await sequelize.transaction(async (transaction) => {
      await this.models.Household.create(
        {
          id: householdId,
          ownerId: userId,
          name: name?.trim() || 'Our Table',
        },
        { transaction },
      );
      await this.models.HouseholdMember.create(
        {
          id: memberId,
          householdId,
          displayName,
          initials: initialsFor(displayName),
          relationship: 'self',
          isOwner: true,
          active: true,
          constraints: { allergies: [], dietaryRestrictions: [], avoidIngredients: [] },
          preferences: { likes: [], dislikes: [] },
        },
        { transaction },
      );
    });

    const created = await this.models.Household.findByPk(householdId);
    if (!created) throw AppError.internal('Household creation did not persist');
    return this.hydrate(created);
  }

  /** Ensures a household belongs to the requesting user; 404 otherwise. */
  async ownedByUser(householdId: UUID, userId: UUID): Promise<void> {
    const household = await this.models.Household.findOne({
      where: { id: householdId, ownerId: userId },
    });
    if (!household) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found',
        statusCode: 404,
        recoverable: true,
      });
    }
  }

  async hydrate(household: InstanceType<Db['models']['Household']>): Promise<Household> {
    const members = await this.models.HouseholdMember.findAll({
      where: { householdId: household.id, active: { [Op.not]: false } },
      order: [['createdAt', 'ASC']],
    });
    return {
      id: household.id,
      ownerId: household.ownerId,
      name: household.name,
      createdAt:
        household.createdAt instanceof Date
          ? household.createdAt.toISOString()
          : String(household.createdAt),
      members: members.map((m) => memberToProfile(m.get({ plain: true }))),
    };
  }
}
