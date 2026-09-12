/**
 * Idempotent catalog seed.
 *
 * Usage:
 *   npm run seed
 *
 * Safe to re-run. Upserts shop items and achievements by unique name/key.
 * Does NOT delete users, quests, inventory, or progression data.
 */
require('dotenv').config();

const { connectDatabase, disconnectDatabase } = require('../config/database');
const Item = require('../models/Item');
const Achievement = require('../models/Achievement');
const { ACHIEVEMENT_KEYS } = require('../config/game');

const SHOP_ITEMS = [
  {
    name: 'Iron Sword',
    description: 'A sturdy blade that represents discipline and daily effort.',
    price: 200,
    rarity: 'common',
    type: 'weapon',
    icon: 'iron-sword',
    active: true
  },
  {
    name: 'Magic Potion',
    description: 'A shimmering brew said to restore focus and motivation.',
    price: 500,
    rarity: 'uncommon',
    type: 'potion',
    icon: 'magic-potion',
    active: true
  },
  {
    name: 'XP Booster',
    description: 'A mystical charm kept as a trophy of your grind. Stored in inventory.',
    price: 750,
    rarity: 'epic',
    type: 'booster',
    icon: 'xp-booster',
    active: true
  },
  {
    name: 'Golden Crown',
    description: 'A crown awarded to those who stay consistent in their quests.',
    price: 1000,
    rarity: 'rare',
    type: 'accessory',
    icon: 'golden-crown',
    active: true
  },
  {
    name: 'Legendary Badge',
    description: 'A rare badge of honor for elite productivity adventurers.',
    price: 2000,
    rarity: 'legendary',
    type: 'badge',
    icon: 'legendary-badge',
    active: true
  }
];

const ACHIEVEMENTS = [
  {
    key: ACHIEVEMENT_KEYS.FIRST_QUEST,
    name: 'First Quest',
    description: 'Complete your first quest.',
    requirement: 'Complete 1 quest',
    type: 'quests',
    threshold: 1,
    icon: 'first-quest'
  },
  {
    key: ACHIEVEMENT_KEYS.QUEST_MASTER,
    name: 'Quest Master',
    description: 'Complete 10 quests.',
    requirement: 'Complete 10 quests',
    type: 'quests',
    threshold: 10,
    icon: 'quest-master'
  },
  {
    key: ACHIEVEMENT_KEYS.QUEST_LEGEND,
    name: 'Quest Legend',
    description: 'Complete 50 quests.',
    requirement: 'Complete 50 quests',
    type: 'quests',
    threshold: 50,
    icon: 'quest-legend'
  },
  {
    key: ACHIEVEMENT_KEYS.LEVEL_5,
    name: 'Level 5',
    description: 'Reach level 5.',
    requirement: 'Reach level 5',
    type: 'level',
    threshold: 5,
    icon: 'level-5'
  },
  {
    key: ACHIEVEMENT_KEYS.LEVEL_10,
    name: 'Level 10',
    description: 'Reach level 10.',
    requirement: 'Reach level 10',
    type: 'level',
    threshold: 10,
    icon: 'level-10'
  },
  {
    key: ACHIEVEMENT_KEYS.WEEK_WARRIOR,
    name: 'Week Warrior',
    description: 'Maintain a 7-day streak.',
    requirement: 'Reach a 7-day streak',
    type: 'streak',
    threshold: 7,
    icon: 'week-warrior'
  },
  {
    key: ACHIEVEMENT_KEYS.GOLD_COLLECTOR,
    name: 'Gold Collector',
    description: 'Earn 1000 total Gold.',
    requirement: 'Earn 1000 total gold',
    type: 'gold',
    threshold: 1000,
    icon: 'gold-collector'
  }
];

async function seedCatalog() {
  for (const item of SHOP_ITEMS) {
    await Item.findOneAndUpdate({ name: item.name }, { $set: item }, { upsert: true, new: true });
  }
  for (const achievement of ACHIEVEMENTS) {
    await Achievement.findOneAndUpdate(
      { key: achievement.key },
      { $set: achievement },
      { upsert: true, new: true }
    );
  }
}

async function run() {
  await connectDatabase();
  await seedCatalog();
  const itemCount = await Item.countDocuments();
  const achievementCount = await Achievement.countDocuments();
  console.log(`Seed complete. Shop items: ${itemCount}. Achievements: ${achievementCount}.`);
  await disconnectDatabase();
}

if (require.main === module) {
  run().catch(async (err) => {
    console.error('Seed failed:', err.message);
    try {
      await disconnectDatabase();
    } catch (_) {
      /* ignore */
    }
    process.exit(1);
  });
}

module.exports = {
  SHOP_ITEMS,
  ACHIEVEMENTS,
  seedCatalog
};
