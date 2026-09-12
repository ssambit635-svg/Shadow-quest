const { computeStreakUpdate, getEffectiveStreak } = require('../src/services/streakService');
const { registerUser, createQuest, request, app, authHeader } = require('./helpers');

function utcDate(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

describe('Streak service', () => {
  test('starts a streak at 1 on first activity', () => {
    const result = computeStreakUpdate({ streak: 0, longestStreak: 0, lastActiveDate: null }, utcDate(2026, 9, 12));
    expect(result.streak).toBe(1);
    expect(result.longestStreak).toBe(1);
    expect(result.alreadyActiveToday).toBe(false);
  });

  test('does not increment twice on the same day', () => {
    const today = utcDate(2026, 9, 12);
    const result = computeStreakUpdate({ streak: 3, longestStreak: 5, lastActiveDate: today }, today);
    expect(result.streak).toBe(3);
    expect(result.alreadyActiveToday).toBe(true);
    expect(result.increased).toBe(false);
  });

  test('increments on the following consecutive day', () => {
    const result = computeStreakUpdate(
      { streak: 3, longestStreak: 3, lastActiveDate: utcDate(2026, 9, 11) },
      utcDate(2026, 9, 12)
    );
    expect(result.streak).toBe(4);
    expect(result.longestStreak).toBe(4);
  });

  test('resets after a missed full day', () => {
    const result = computeStreakUpdate(
      { streak: 6, longestStreak: 6, lastActiveDate: utcDate(2026, 9, 10) },
      utcDate(2026, 9, 12)
    );
    expect(result.streak).toBe(1);
    expect(result.longestStreak).toBe(6);
  });

  test('effective streak is 0 after skipping two days without a new completion', () => {
    const streak = getEffectiveStreak(
      { streak: 4, lastActiveDate: utcDate(2026, 9, 10) },
      utcDate(2026, 9, 12)
    );
    expect(streak).toBe(0);
  });
});

describe('Streak via quest completion', () => {
  test('completing two quests the same day only counts the streak once', async () => {
    const { token } = await registerUser();
    const first = await createQuest(token, { title: 'One' });
    const second = await createQuest(token, { title: 'Two' });

    await request(app).post(`/api/quests/${first.body.data.quest._id}/complete`).set(authHeader(token));
    const res = await request(app)
      .post(`/api/quests/${second.body.data.quest._id}/complete`)
      .set(authHeader(token));

    expect(res.body.data.player.streak).toBe(1);
    expect(res.body.data.player.longestStreak).toBe(1);
    expect(res.body.data.streak.increased).toBe(false);
  });
});
