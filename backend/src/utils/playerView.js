const { getXpProgress } = require('../services/xpService');

function toPublicUser(user) {
  if (!user) return null;
  const progress = getXpProgress(user.xp);

  return {
    id: user._id,
    _id: user._id,
    name: user.name,
    email: user.email,
    level: user.level,
    xp: user.xp,
    gold: user.gold,
    streak: user.streak,
    longestStreak: user.longestStreak,
    lastActiveDate: user.lastActiveDate || null,
    totalQuestsCompleted: user.totalQuestsCompleted,
    totalGoldEarned: user.totalGoldEarned,
    xpProgress: progress,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

module.exports = {
  toPublicUser
};
