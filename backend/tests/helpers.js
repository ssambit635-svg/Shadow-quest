const request = require('supertest');
const app = require('../src/app');

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

async function registerUser(overrides = {}) {
  const payload = {
    name: overrides.name || 'Hero',
    email: overrides.email || `hero-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
    password: overrides.password || 'password123'
  };
  const res = await request(app).post('/api/auth/register').send(payload);
  return {
    res,
    payload,
    token: res.body.data && res.body.data.token,
    user: res.body.data && res.body.data.user
  };
}

async function loginUser(email, password) {
  return request(app).post('/api/auth/login').send({ email, password });
}

async function createQuest(token, body = {}) {
  return request(app)
    .post('/api/quests')
    .set(authHeader(token))
    .send({
      title: body.title || 'Study for 1 hour',
      description: body.description || 'Deep work session',
      difficulty: body.difficulty || 'easy',
      category: body.category || 'study',
      recurrence: body.recurrence || 'none',
      ...body
    });
}

module.exports = {
  app,
  request,
  authHeader,
  registerUser,
  loginUser,
  createQuest
};
