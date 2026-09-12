const { request, app, registerUser, createQuest, authHeader } = require('./helpers');

describe('Quests', () => {
  test('creates a quest and assigns server-side rewards', async () => {
    const { token } = await registerUser();
    const res = await createQuest(token, {
      title: 'Go to the gym',
      difficulty: 'hard',
      category: 'fitness',
      xpReward: 99999,
      goldReward: 99999
    });

    expect(res.status).toBe(201);
    expect(res.body.data.quest.xpReward).toBe(200);
    expect(res.body.data.quest.goldReward).toBe(100);
    expect(res.body.data.quest.status).toBe('active');
    expect(res.body.data.quest.title).toBe('Go to the gym');
  });

  test('lists only the authenticated user quests', async () => {
    const a = await registerUser();
    const b = await registerUser();
    await createQuest(a.token, { title: 'A quest' });
    await createQuest(b.token, { title: 'B quest' });

    const res = await request(app).get('/api/quests').set(authHeader(a.token));
    expect(res.status).toBe(200);
    expect(res.body.data.quests).toHaveLength(1);
    expect(res.body.data.quests[0].title).toBe('A quest');
  });

  test('gets, updates, and deletes a quest', async () => {
    const { token } = await registerUser();
    const created = await createQuest(token, { title: 'Read 20 pages', difficulty: 'medium' });
    const id = created.body.data.quest._id;

    const got = await request(app).get(`/api/quests/${id}`).set(authHeader(token));
    expect(got.status).toBe(200);
    expect(got.body.data.quest.xpReward).toBe(100);

    const updated = await request(app)
      .put(`/api/quests/${id}`)
      .set(authHeader(token))
      .send({ title: 'Read 30 pages', difficulty: 'hard' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.quest.title).toBe('Read 30 pages');
    expect(updated.body.data.quest.xpReward).toBe(200);
    expect(updated.body.data.quest.goldReward).toBe(100);

    const deleted = await request(app).delete(`/api/quests/${id}`).set(authHeader(token));
    expect(deleted.status).toBe(200);

    const missing = await request(app).get(`/api/quests/${id}`).set(authHeader(token));
    expect(missing.status).toBe(404);
  });

  test('completes a quest, awards XP and gold, and writes history', async () => {
    const { token } = await registerUser();
    const created = await createQuest(token, { difficulty: 'easy', category: 'study' });
    const id = created.body.data.quest._id;

    const res = await request(app).post(`/api/quests/${id}/complete`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.rewards.xp).toBe(50);
    expect(res.body.data.rewards.gold).toBe(25);
    expect(res.body.data.player.xp).toBe(50);
    expect(res.body.data.player.gold).toBe(25);
    expect(res.body.data.player.totalQuestsCompleted).toBe(1);
    expect(res.body.data.player.streak).toBe(1);
    expect(res.body.data.levelUp).toBe(false);
    expect(res.body.data.achievementsUnlocked.some((a) => a.key === 'FIRST_QUEST')).toBe(true);

    const history = await request(app).get('/api/history').set(authHeader(token));
    expect(history.status).toBe(200);
    expect(history.body.data.history).toHaveLength(1);
    expect(history.body.data.history[0].xpEarned).toBe(50);
    expect(history.body.data.history[0].category).toBe('study');
  });

  test('rejects duplicate completion of a one-time quest', async () => {
    const { token } = await registerUser();
    const created = await createQuest(token, { difficulty: 'medium' });
    const id = created.body.data.quest._id;

    const first = await request(app).post(`/api/quests/${id}/complete`).set(authHeader(token));
    expect(first.status).toBe(200);

    const second = await request(app).post(`/api/quests/${id}/complete`).set(authHeader(token));
    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/already been completed/i);

    const me = await request(app).get('/api/auth/me').set(authHeader(token));
    expect(me.body.data.user.xp).toBe(100);
    expect(me.body.data.user.gold).toBe(50);
    expect(me.body.data.user.totalQuestsCompleted).toBe(1);
  });

  test('allows a daily quest once per day and blocks a second completion the same day', async () => {
    const { token } = await registerUser();
    const created = await createQuest(token, {
      title: 'Meditate',
      difficulty: 'easy',
      recurrence: 'daily',
      category: 'mindfulness'
    });
    const id = created.body.data.quest._id;

    const first = await request(app).post(`/api/quests/${id}/complete`).set(authHeader(token));
    expect(first.status).toBe(200);
    expect(first.body.data.quest.status).toBe('active');

    const second = await request(app).post(`/api/quests/${id}/complete`).set(authHeader(token));
    expect(second.status).toBe(409);
  });

  test('filters history by difficulty and category', async () => {
    const { token } = await registerUser();
    const easy = await createQuest(token, { difficulty: 'easy', category: 'study' });
    const hard = await createQuest(token, { difficulty: 'hard', category: 'fitness' });
    await request(app).post(`/api/quests/${easy.body.data.quest._id}/complete`).set(authHeader(token));
    await request(app).post(`/api/quests/${hard.body.data.quest._id}/complete`).set(authHeader(token));

    const filtered = await request(app)
      .get('/api/history?difficulty=hard&category=fitness')
      .set(authHeader(token));
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.history).toHaveLength(1);
    expect(filtered.body.data.history[0].difficulty).toBe('hard');
  });
});
