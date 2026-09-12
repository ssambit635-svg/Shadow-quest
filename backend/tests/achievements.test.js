const { meetsRequirement } = require('../src/services/achievementService');
const { ACHIEVEMENT_KEYS } = require('../src/config/game');
const { registerUser, createQuest, request, app, authHeader } = require('./helpers');

describe('Achievement evaluation', () => {
  test('unlocks based on thresholds', () => {
    const user = {
      totalQuestsCompleted: 10,
      level: 5,
      streak: 2,
      longestStreak: 7,
      totalGoldEarned: 1000
    };

    expect(meetsRequirement(user, { key: ACHIEVEMENT_KEYS.FIRST_QUEST, threshold: 1, type: 'quests' })).toBe(true);
    expect(meetsRequirement(user, { key: ACHIEVEMENT_KEYS.QUEST_MASTER, threshold: 10, type: 'quests' })).toBe(true);
    expect(meetsRequirement(user, { key: ACHIEVEMENT_KEYS.QUEST_LEGEND, threshold: 50, type: 'quests' })).toBe(false);
    expect(meetsRequirement(user, { key: ACHIEVEMENT_KEYS.LEVEL_5, threshold: 5, type: 'level' })).toBe(true);
    expect(meetsRequirement(user, { key: ACHIEVEMENT_KEYS.LEVEL_10, threshold: 10, type: 'level' })).toBe(false);
    expect(meetsRequirement(user, { key: ACHIEVEMENT_KEYS.WEEK_WARRIOR, threshold: 7, type: 'streak' })).toBe(true);
    expect(meetsRequirement(user, { key: ACHIEVEMENT_KEYS.GOLD_COLLECTOR, threshold: 1000, type: 'gold' })).toBe(true);
  });

  test('returns locked achievements until the player qualifies', async () => {
    const { token } = await registerUser();
    const before = await request(app).get('/api/achievements').set(authHeader(token));
    expect(before.status).toBe(200);
    expect(before.body.data.unlockedCount).toBe(0);
    expect(before.body.data.total).toBe(7);

    const created = await createQuest(token);
    await request(app).post(`/api/quests/${created.body.data.quest._id}/complete`).set(authHeader(token));

    const after = await request(app).get('/api/achievements').set(authHeader(token));
    const first = after.body.data.achievements.find((a) => a.key === 'FIRST_QUEST');
    expect(first.unlocked).toBe(true);
    expect(first.unlockedAt).toBeTruthy();
  });

  test('dashboard returns player, quests, achievements, and inventory summary', async () => {
    const { token } = await registerUser();
    const created = await createQuest(token, { title: 'Dashboard quest' });
    await request(app).post(`/api/quests/${created.body.data.quest._id}/complete`).set(authHeader(token));

    const res = await request(app).get('/api/user/dashboard').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.player).toBeDefined();
    expect(res.body.data.xpProgress).toBeDefined();
    expect(res.body.data.stats.gold).toBe(25);
    expect(res.body.data.recentlyCompletedQuests.length).toBeGreaterThan(0);
    expect(res.body.data.unlockedAchievements.length).toBeGreaterThan(0);
    expect(res.body.data.inventorySummary).toBeDefined();
  });
});
