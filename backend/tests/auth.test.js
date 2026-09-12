const { request, app, registerUser, loginUser, authHeader } = require('./helpers');

describe('Authentication', () => {
  test('registers a player with default RPG stats and a JWT', async () => {
    const { res, user, token } = await registerUser({ name: 'Sam', email: 'sam@example.com' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(token).toBeTruthy();
    expect(user.password).toBeUndefined();
    expect(user.level).toBe(1);
    expect(user.xp).toBe(0);
    expect(user.gold).toBe(0);
    expect(user.streak).toBe(0);
    expect(user.totalQuestsCompleted).toBe(0);
    expect(user.email).toBe('sam@example.com');
  });

  test('rejects duplicate email', async () => {
    await registerUser({ email: 'dup@example.com' });
    const { res } = await registerUser({ email: 'dup@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  test('rejects invalid registration payloads', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'A',
      email: 'not-an-email',
      password: 'short'
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('logs in with valid credentials', async () => {
    const { payload } = await registerUser({ email: 'login@example.com', password: 'password123' });
    const res = await loginUser(payload.email, payload.password);
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.email).toBe(payload.email);
    expect(res.body.data.user.password).toBeUndefined();
  });

  test('rejects invalid login', async () => {
    await registerUser({ email: 'wrong@example.com', password: 'password123' });
    const res = await loginUser('wrong@example.com', 'bad-password');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('returns the current player via GET /api/auth/me', async () => {
    const { token, user } = await registerUser();
    const res = await request(app).get('/api/auth/me').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(user.email);
    expect(res.body.data.user.xpProgress).toBeDefined();
    expect(res.body.data.user.xpProgress.level).toBe(1);
  });

  test('logout blacklists the JWT', async () => {
    const { token } = await registerUser();
    const logout = await request(app).post('/api/auth/logout').set(authHeader(token));
    expect(logout.status).toBe(200);

    const me = await request(app).get('/api/auth/me').set(authHeader(token));
    expect(me.status).toBe(401);
  });

  test('rejects requests without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
