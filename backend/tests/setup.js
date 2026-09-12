const { installMemoryMongo, resetMemoryMongo } = require('./memoryMongo');
const { seedCatalog } = require('../src/seed/seedDatabase');

beforeAll(async () => {
  installMemoryMongo();
  await seedCatalog();
});

afterEach(() => {
  resetMemoryMongo(['items', 'achievements']);
});
