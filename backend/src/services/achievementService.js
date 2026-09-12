const Achievement = require('../models/Achievement');
const UserAchievement = require('../models/UserAchievement');
const { ACHIEVEMENT_KEYS } = require('../config/game');

function playerValueFor(user, definition) {
  switch (definition.key) {
    case ACHIEVEMENT_KEYS.FIRST_QUEST:
    case ACHIEVEMENT_KEYS.QUEST_MASTER:
    case ACHIEVEMENT_KEYS.QUEST_LEGEND:
      return user.totalQuestsCompleted || 0;
    case ACHIEVEMENT_KEYS.LEVEL_5:
    case ACHIEVEMENT_KEYS.LEVEL_10:
      return user.level || 1;
    case ACHIEVEMENT_KEYS.WEEK_WARRIOR:
      return Math.max(user.streak || 0, user.longestStreak || 0);
    case ACHIEVEMENT_KEYS.GOLD_COLLECTOR:
      return user.totalGoldEarned || 0;
    default:
      if (definition.type === 'quests') return user.totalQuestsCompleted || 0;
      if (definition.type === 'level') return user.level || 1;
      if (definition.type === 'streak') return Math.max(user.streak || 0, user.longestStreak || 0);
      if (definition.type === 'gold') return user.totalGoldEarned || 0;
      return 0;
  }
}

function meetsRequirement(user, definition) {
  return playerValueFor(user, definition) >= definition.threshold;
}

function serializeAchievement(definition, unlock = null) {
  return {
    id: definition._id,
    _id: definition._id,
    key: definition.key,
    name: definition.name,
    description: definition.description,
    requirement: definition.requirement,
    type: definition.type,
    threshold: definition.threshold,
    icon: definition.icon,
    unlocked: Boolean(unlock),
    unlockedAt: unlock ? unlock.unlockedAt : null
  };
}

async function evaluateAchievements(user) {
  const [definitions, existing] = await Promise.all([
    Achievement.find().lean(),
    UserAchievement.find({ userId: user._id }).lean()
  ]);

  const owned = new Set(existing.map((row) => String(row.achievementId)));
  const newlyUnlocked = [];

  for (const definition of definitions) {
    if (owned.has(String(definition._id))) continue;
    if (!meetsRequirement(user, definition)) continue;

    try {
      const unlock = await UserAchievement.create({
        userId: user._id,
        achievementId: definition._id,
        unlockedAt: new Date()
      });
      newlyUnlocked.push(serializeAchievement(definition, unlock));
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }

  return newlyUnlocked;
}

async function getAchievementsForUser(userId) {
  const [definitions, unlocks] = await Promise.all([
    Achievement.find().sort({ threshold: 1, name: 1 }).lean(),
    UserAchievement.find({ userId }).lean()
  ]);

  const unlockByAchievement = new Map(unlocks.map((row) => [String(row.achievementId), row]));

  return definitions.map((definition) =>
    serializeAchievement(definition, unlockByAchievement.get(String(definition._id)))
  );
}

async function getUnlockedAchievements(userId, limit = 20) {
  const unlocks = await UserAchievement.find({ userId })
    .sort({ unlockedAt: -1 })
    .limit(limit)
    .populate('achievementId')
    .lean();

  return unlocks
    .filter((row) => row.achievementId)
    .map((row) => serializeAchievement(row.achievementId, row));
}

module.exports = {
  playerValueFor,
  meetsRequirement,
  serializeAchievement,
  evaluateAchievements,
  getAchievementsForUser,
  getUnlockedAchievements
};
