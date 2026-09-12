const { getXpRequiredForLevel, getLevelFromXp, getXpProgress, addXp } = require('../src/services/xpService');
const { detectLevelUp } = require('../src/services/levelService');
const { getRewardsForDifficulty } = require('../src/services/rewardService');
const { registerUser, createQuest, request, app, authHeader } = require('./helpers');

describe('XP and level services', () => {
  test('matches the documented cumulative XP table', () => {
    expect(getXpRequiredForLevel(1)).toBe(0);
    expect(getXpRequiredForLevel(2)).toBe(1000);
    expect(getXpRequiredForLevel(3)).toBe(2500);
    expect(getXpRequiredForLevel(4)).toBe(4500);
    expect(getXpRequiredForLevel(5)).toBe(7000);
  });

  test('derives level from cumulative XP', () => {
    expect(getLevelFromXp(0)).toBe(1);
    expect(getLevelFromXp(999)).toBe(1);
    expect(getLevelFromXp(1000)).toBe(2);
    expect(getLevelFromXp(2499)).toBe(2);
    expect(getLevelFromXp(2500)).toBe(3);
    expect(getLevelFromXp(4700)).toBe(4);
  });

  test('computes progress toward the next level', () => {
    const progress = getXpProgress(1500);
    expect(progress.level).toBe(2);
    expect(progress.xpForCurrentLevel).toBe(1000);
    expect(progress.xpForNextLevel).toBe(2500);
    expect(progress.xpToNextLevel).toBe(1000);
    expect(progress.progressPercent).toBeCloseTo(33.33, 1);
  });

  test('detects a level-up when crossing a threshold', () => {
    const result = detectLevelUp(900, 1100);
    expect(result.levelUp).toBe(true);
    expect(result.oldLevel).toBe(1);
    expect(result.newLevel).toBe(2);
    expect(result.currentXp).toBe(1100);
  });

  test('addXp never trusts negative values', () => {
    const result = addXp(100, -50);
    expect(result.xpGained).toBe(0);
    expect(result.currentXp).toBe(100);
  });

  test('reward table is authoritative', () => {
    expect(getRewardsForDifficulty('easy')).toEqual({ xp: 50, gold: 25 });
    expect(getRewardsForDifficulty('medium')).toEqual({ xp: 100, gold: 50 });
    expect(getRewardsForDifficulty('hard')).toEqual({ xp: 200, gold: 100 });
  });
});

describe('XP rewards and level-up via API', () => {
  test('awards XP from completing a quest', async () => {
    const { token } = await registerUser();
    const created = await createQuest(token, { difficulty: 'hard' });
    const res = await request(app)
      .post(`/api/quests/${created.body.data.quest._id}/complete`)
      .set(authHeader(token));

    expect(res.body.data.rewards.xp).toBe(200);
    expect(res.body.data.player.xp).toBe(200);
    expect(res.body.data.currentXp).toBe(200);
  });

  test('levels the player up after enough XP', async () => {
    const { token } = await registerUser();
    let last;

    for (let i = 0; i < 5; i += 1) {
      const created = await createQuest(token, { title: `Hard ${i}`, difficulty: 'hard' });
      last = await request(app)
        .post(`/api/quests/${created.body.data.quest._id}/complete`)
        .set(authHeader(token));
      expect(last.status).toBe(200);
    }

    expect(last.body.data.player.xp).toBe(1000);
    expect(last.body.data.levelUp).toBe(true);
    expect(last.body.data.oldLevel).toBe(1);
    expect(last.body.data.newLevel).toBe(2);
    expect(last.body.data.currentXp).toBe(1000);
    expect(last.body.data.player.level).toBe(2);
  });
});
