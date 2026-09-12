const Item = require('../src/models/Item');
const { registerUser, createQuest, request, app, authHeader } = require('./helpers');

async function earnGold(token, hardQuests) {
  for (let i = 0; i < hardQuests; i += 1) {
    const created = await createQuest(token, { title: `Gold farm ${i}`, difficulty: 'hard' });
    const res = await request(app)
      .post(`/api/quests/${created.body.data.quest._id}/complete`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
  }
}

describe('Shop, gold, and inventory', () => {
  test('lists seeded shop items', async () => {
    const { token } = await registerUser();
    const res = await request(app).get('/api/shop/items').set(authHeader(token));
    expect(res.status).toBe(200);
    const names = res.body.data.items.map((item) => item.name);
    expect(names).toEqual(expect.arrayContaining(['Iron Sword', 'Magic Potion', 'Golden Crown', 'Legendary Badge', 'XP Booster']));
  });

  test('filters shop items by rarity', async () => {
    const { token } = await registerUser();
    const res = await request(app).get('/api/shop/items?rarity=legendary').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].name).toBe('Legendary Badge');
  });

  test('purchases an item, deducts gold, and adds it to inventory', async () => {
    const { token } = await registerUser();
    await earnGold(token, 4);

    const sword = await Item.findOne({ name: 'Iron Sword' });
    const buy = await request(app)
      .post(`/api/shop/items/${sword._id}/buy`)
      .set(authHeader(token))
      .send({ price: 1 });

    expect(buy.status).toBe(200);
    expect(buy.body.data.goldSpent).toBe(200);
    expect(buy.body.data.unitPrice).toBe(200);
    expect(buy.body.data.gold).toBe(200);
    expect(buy.body.data.inventoryItem.quantity).toBe(1);
    expect(buy.body.data.inventoryItem.item.name).toBe('Iron Sword');

    const inventory = await request(app).get('/api/inventory').set(authHeader(token));
    expect(inventory.status).toBe(200);
    expect(inventory.body.data.items).toHaveLength(1);

    const detail = await request(app).get(`/api/inventory/${sword._id}`).set(authHeader(token));
    expect(detail.status).toBe(200);
    expect(detail.body.data.quantity).toBe(1);
  });

  test('increases quantity when the same item is purchased again', async () => {
    const { token } = await registerUser();
    await earnGold(token, 4);
    const sword = await Item.findOne({ name: 'Iron Sword' });

    await request(app).post(`/api/shop/items/${sword._id}/buy`).set(authHeader(token));
    const second = await request(app).post(`/api/shop/items/${sword._id}/buy`).set(authHeader(token));

    expect(second.status).toBe(200);
    expect(second.body.data.inventoryItem.quantity).toBe(2);
    expect(second.body.data.gold).toBe(0);
  });

  test('rejects purchases when gold is insufficient', async () => {
    const { token } = await registerUser();
    const badge = await Item.findOne({ name: 'Legendary Badge' });
    const res = await request(app).post(`/api/shop/items/${badge._id}/buy`).set(authHeader(token));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/insufficient gold/i);

    const me = await request(app).get('/api/auth/me').set(authHeader(token));
    expect(me.body.data.user.gold).toBe(0);
  });
});
