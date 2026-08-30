import { randomUUID } from 'node:crypto';

import { closeDatabase, initializeDatabase, sequelize } from '../../src/database';
import { AdditionEvent } from '../../src/database/models/addition-event.model';

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

maybeDescribe('addition_events (integration)', () => {
  beforeAll(async () => {
    await initializeDatabase();
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('persists an onboarding answer row', async () => {
    const userId = randomUUID();
    const row = await AdditionEvent.create({
      id: randomUUID(),
      userId,
      pairId: 'pair-01',
      baseMealName: 'Plain steamed rice',
      baseMealGroup: 'rice_based',
      cuisineLabel: 'Japanese bowl night',
      additionA: 'scrambled egg',
      additionB: 'sesame oil + furikake',
      selected: 'A',
      state: 'selected',
      rejectionReason: null,
      unavailableOption: null,
    });

    const found = await AdditionEvent.findOne({ where: { id: row.id } });
    expect(found?.get('selected')).toBe('A');
    expect(found?.get('state')).toBe('selected');
    expect(found?.get('cuisineLabel')).toBe('Japanese bowl night');
  });

  it('persists an unavailable answer that is not a negative preference', async () => {
    const row = await AdditionEvent.create({
      id: randomUUID(),
      userId: randomUUID(),
      pairId: 'pair-02',
      baseMealName: 'Instant noodles',
      baseMealGroup: 'noodle',
      cuisineLabel: 'Late-night noodle run',
      additionA: 'leftover chicken',
      additionB: 'soft-cooked egg',
      selected: null,
      state: 'unavailable',
      rejectionReason: 'don_t_have',
      unavailableOption: 'A',
    });
    const found = await AdditionEvent.findOne({ where: { id: row.id } });
    expect(found?.get('state')).toBe('unavailable');
    expect(found?.get('selected')).toBeNull();
  });
});
