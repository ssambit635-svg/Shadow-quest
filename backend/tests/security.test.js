const Item = require('../src/models/Item');
const { registerUser, createQuest, request, app, authHeader } = require('./helpers');

describe('Security / anti-cheat', () => {
  test('cannot access another user quest', async () => {
    const owner = await registerUser();
    const intruder = await registerUser();
    const created = await createQuest(owner.token, { title: 'Secret quest' });
    const id = created.body.data.quest._id;

    const get = await request(app).get(`/api/quests/${id}`).set(authHeader(intruder.token));
    expect(get.status).toBe(403);

    const complete = await request(app).post(`/api/quests/${id}/complete`).set(authHeader(intruder.token));
    expect(complete.status).toBe(403);

    const update = await request(app)
      .put(`/api/quests/${id}`)
      .set(authHeader(intruder.token))
      .send({ title: 'Hacked' });
    expect(update.status).toBe(403);

    const del = await request(app).delete(`/api/quests/${id}`).set(authHeader(intruder.token));
    expect(del.status).toBe(403);

    const ownerView = await request(app).get(`/api/quests/${id}`).set(authHeader(owner.token));
    expect(ownerView.body.data.quest.title).toBe('Secret quest');
  });

  test('cannot manipulate XP, gold, or level through profile update', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .put('/api/user/profile')
      .set(authHeader(token))
      .send({ name: 'Legit Name', xp: 99999, gold: 99999, level: 99, streak: 50 });

    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe('Legit Name');
    expect(res.body.data.user.xp).toBe(0);
    expect(res.body.data.user.gold).toBe(0);
    expect(res.body.data.user.level).toBe(1);
    expect(res.body.data.user.streak).toBe(0);
  });

  test('cannot manipulate quest rewards from the client', async () => {
    const { token } = await registerUser();
    const created = await createQuest(token, {
      difficulty: 'easy',
      xpReward: 5000,
      goldReward: 5000
    });
    expect(created.body.data.quest.xpReward).toBe(50);
    expect(created.body.data.quest.goldReward).toBe(25);

    const complete = await request(app)
      .post(`/api/quests/${created.body.data.quest._id}/complete`)
      .set(authHeader(token))
      .send({ xp: 99999, gold: 99999, xpReward: 99999 });

    expect(complete.status).toBe(200);
    expect(complete.body.data.rewards.xp).toBe(50);
    expect(complete.body.data.player.xp).toBe(50);
    expect(complete.body.data.player.gold).toBe(25);
  });

  test('cannot manipulate item price when buying', async () => {
    const { token } = await registerUser();
    const badge = await Item.findOne({ name: 'Legendary Badge' });
    const res = await request(app)
      .post(`/api/shop/items/${badge._id}/buy`)
      .set(authHeader(token))
      .send({ price: 0, gold: 99999 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/insufficient gold/i);
  });

  test('cannot read another user history or inventory by guessing routes', async () => {
    const owner = await registerUser();
    const intruder = await registerUser();
    const created = await createQuest(owner.token, { difficulty: 'easy' });
    await request(app)
      .post(`/api/quests/${created.body.data.quest._id}/complete`)
      .set(authHeader(owner.token));

    const history = await request(app).get('/api/history').set(authHeader(intruder.token));
    expect(history.body.data.history).toHaveLength(0);

    const inventory = await request(app).get('/api/inventory').set(authHeader(intruder.token));
    expect(inventory.body.data.items).toHaveLength(0);
  });

  test('protected routes require a valid JWT', async () => {
    const res = await request(app).get('/api/user/dashboard');
    expect(res.status).toBe(401);
  });

  test('rejects invalid ObjectIds', async () => {
    const { token } = await registerUser();
    const res = await request(app).get('/api/quests/not-an-id').set(authHeader(token));
    expect(res.status).toBe(400);
  });
});
