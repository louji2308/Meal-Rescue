import type { UUID } from '@meal-rescue/shared-types';

import type { Db } from '../../database/models';

export type CommonTableEventType =
  | 'common_table_started'
  | 'common_table_household_selected'
  | 'common_table_input_received'
  | 'common_table_convergence_generated'
  | 'common_table_split_point_generated'
  | 'common_table_started_cooking'
  | 'common_table_split_reached'
  | 'common_table_completed'
  | 'common_table_feedback'
  | 'common_table_failed';

/**
 * Append-only observability log for Common Table sessions.
 * Never logs secrets or raw images.
 */
export class TableEventService {
  private readonly models: Db['models'];

  constructor(models: Db['models']) {
    this.models = models;
  }

  async record(
    sharedMealId: UUID,
    eventType: CommonTableEventType,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.models.TableEvent.create({
        sharedMealId,
        eventType,
        payload: payload ?? null,
      });
    } catch {
      // Observability must never break the primary flow.
    }
  }
}
