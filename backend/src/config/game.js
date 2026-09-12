/**
 * Authoritative game constants.
 * Clients must never override these values.
 */

const DIFFICULTIES = ['easy', 'medium', 'hard'];

const REWARDS_BY_DIFFICULTY = Object.freeze({
  easy: Object.freeze({ xp: 50, gold: 25 }),
  medium: Object.freeze({ xp: 100, gold: 50 }),
  hard: Object.freeze({ xp: 200, gold: 100 })
});

const CATEGORIES = [
  'study',
  'fitness',
  'work',
  'health',
  'mindfulness',
  'creative',
  'social',
  'chores',
  'other'
];

const QUEST_STATUSES = ['active', 'completed', 'cancelled'];
const RECURRENCE = ['none', 'daily', 'weekly'];

const ITEM_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const ITEM_TYPES = ['weapon', 'potion', 'accessory', 'badge', 'booster', 'cosmetic'];

/**
 * Cumulative XP required to REACH a given level.
 * Level 1 → 0
 * Level 2 → 1000
 * Level 3 → 2500
 * Level 4 → 4500
 * Level 5 → 7000
 *
 * Formula: xpForLevel(n) = 500 * (n(n+1)/2 - 1) for n >= 2
 * XP to go from n → n+1 = 500 * (n + 1)
 */
const XP_LEVEL_FACTOR = 500;

const ACHIEVEMENT_KEYS = Object.freeze({
  FIRST_QUEST: 'FIRST_QUEST',
  QUEST_MASTER: 'QUEST_MASTER',
  QUEST_LEGEND: 'QUEST_LEGEND',
  LEVEL_5: 'LEVEL_5',
  LEVEL_10: 'LEVEL_10',
  WEEK_WARRIOR: 'WEEK_WARRIOR',
  GOLD_COLLECTOR: 'GOLD_COLLECTOR'
});

const FORBIDDEN_PLAYER_FIELDS = [
  'xp',
  'gold',
  'level',
  'streak',
  'longestStreak',
  'totalQuestsCompleted',
  'totalGoldEarned',
  'lastActiveDate',
  'password',
  'role',
  'xpReward',
  'goldReward',
  'price'
];

module.exports = {
  DIFFICULTIES,
  REWARDS_BY_DIFFICULTY,
  CATEGORIES,
  QUEST_STATUSES,
  RECURRENCE,
  ITEM_RARITIES,
  ITEM_TYPES,
  XP_LEVEL_FACTOR,
  ACHIEVEMENT_KEYS,
  FORBIDDEN_PLAYER_FIELDS
};
