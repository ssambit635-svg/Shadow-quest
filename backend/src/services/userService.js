const User = require('../models/User');
const Quest = require('../models/Quest');
const QuestCompletion = require('../models/QuestCompletion');
const Inventory = require('../models/Inventory');
const ApiError = require('../utils/apiError');
const { toPublicUser } = require('../utils/playerView');
const { refreshStreak } = require('./streakService');
const { getUnlockedAchievements } = require('./achievementService');
const { getPeriodKey, startOfUtcDay, endOfUtcDay } = require('../utils/dates');

async function updateProfile(user, { name, email }) {
  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (trimmed.length < 2 || trimmed.length > 50) {
      throw new ApiError(400, 'Name must be between 2 and 50 characters');
    }
    user.name = trimmed;
  }

  if (email !== undefined) {
    const normalized = String(email).toLowerCase().trim();
    if (!/^\S+@\S+\.\S+$/.test(normalized)) {
      throw new ApiError(400, 'Please provide a valid email');
    }
    const existing = await User.findOne({ email: normalized, _id: { $ne: user._id } });
    if (existing) {
      throw new ApiError(409, 'Email is already in use');
    }
    user.email = normalized;
  }

  await user.save();
  return toPublicUser(user);
}

async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select('+password');
  if (!user) throw new ApiError(404, 'User not found');

  const matches = await user.matchPassword(currentPassword);
  if (!matches) {
    throw new ApiError(401, 'Current password is incorrect');
  }
  if (!newPassword || String(newPassword).length < 8) {
    throw new ApiError(400, 'New password must be at least 8 characters');
  }
  if (currentPassword === newPassword) {
    throw new ApiError(400, 'New password must be different from the current password');
  }

  user.password = newPassword;
  await user.save();
  return true;
}

async function getDashboard(user) {
  await refreshStreak(user);
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const todayEnd = endOfUtcDay(now);

  const [
    activeQuests,
    recentCompletions,
    completionsToday,
    inventoryItems,
    unlockedAchievements,
    totalActive,
    totalCompleted
  ] = await Promise.all([
    Quest.find({ userId: user._id, status: 'active' }).sort({ dueDate: 1, createdAt: -1 }).limit(50).lean(),
    QuestCompletion.find({ userId: user._id }).sort({ completedAt: -1 }).limit(8).lean(),
    QuestCompletion.countDocuments({
      userId: user._id,
      completedAt: { $gte: todayStart, $lt: todayEnd }
    }),
    Inventory.find({ userId: user._id }).populate('itemId').sort({ updatedAt: -1 }).limit(12).lean(),
    getUnlockedAchievements(user._id, 20),
    Quest.countDocuments({ userId: user._id, status: 'active' }),
    Quest.countDocuments({ userId: user._id, status: 'completed' })
  ]);

  const periodCompletions = await QuestCompletion.find({
    userId: user._id,
    questId: { $in: activeQuests.map((q) => q._id) }
  })
    .select('questId periodKey')
    .lean();

  const completionKeys = new Set(periodCompletions.map((c) => `${c.questId}:${c.periodKey}`));

  const todaysQuests = activeQuests.map((quest) => {
    const periodKey = getPeriodKey(quest.recurrence, now);
    return {
      ...quest,
      completedInCurrentPeriod: completionKeys.has(`${quest._id}:${periodKey}`)
    };
  });

  const dueToday = todaysQuests.filter((quest) => {
    if (!quest.dueDate) return false;
    const due = new Date(quest.dueDate);
    return due >= todayStart && due < todayEnd;
  });

  const inventorySummary = {
    uniqueItems: inventoryItems.length,
    totalQuantity: inventoryItems.reduce((sum, row) => sum + (row.quantity || 0), 0),
    items: inventoryItems
      .filter((row) => row.itemId)
      .map((row) => ({
        inventoryId: row._id,
        quantity: row.quantity,
        acquiredAt: row.acquiredAt,
        item: row.itemId
      }))
  };

  return {
    player: toPublicUser(user),
    stats: {
      level: user.level,
      xp: user.xp,
      gold: user.gold,
      currentStreak: user.streak,
      longestStreak: user.longestStreak,
      lastActiveDate: user.lastActiveDate,
      totalQuestsCompleted: user.totalQuestsCompleted,
      totalGoldEarned: user.totalGoldEarned,
      activeQuests: totalActive,
      completedQuests: totalCompleted,
      completionsToday
    },
    xpProgress: toPublicUser(user).xpProgress,
    todaysQuests,
    dueToday,
    recentlyCompletedQuests: recentCompletions,
    unlockedAchievements,
    inventorySummary
  };
}

module.exports = {
  updateProfile,
  changePassword,
  getDashboard,
  toPublicUser
};
