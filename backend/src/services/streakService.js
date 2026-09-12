const { startOfUtcDay, daysBetweenUtc } = require('../utils/dates');

/**
 * Compute the next streak values after a productive action at `now`.
 * Completing multiple quests on the same UTC day does not increase the streak again.
 */
function computeStreakUpdate(user, now = new Date()) {
  const today = startOfUtcDay(now);
  const last = user.lastActiveDate ? startOfUtcDay(user.lastActiveDate) : null;

  if (last && last.getTime() === today.getTime()) {
    return {
      streak: user.streak || 0,
      longestStreak: user.longestStreak || 0,
      lastActiveDate: today,
      alreadyActiveToday: true,
      increased: false
    };
  }

  let streak = 1;
  if (last) {
    const diff = daysBetweenUtc(last, today);
    if (diff === 1) {
      streak = (user.streak || 0) + 1;
    }
  }

  const longestStreak = Math.max(user.longestStreak || 0, streak);

  return {
    streak,
    longestStreak,
    lastActiveDate: today,
    alreadyActiveToday: false,
    increased: streak > (user.streak || 0) || (user.streak || 0) === 0
  };
}

/**
 * If the player skipped a full UTC day, the current streak is broken.
 * Yesterday still counts as "alive" so they can continue today.
 */
function getEffectiveStreak(user, now = new Date()) {
  if (!user.lastActiveDate) {
    return 0;
  }
  const diff = daysBetweenUtc(user.lastActiveDate, now);
  if (diff >= 2) return 0;
  return user.streak || 0;
}

function isStreakStale(user, now = new Date()) {
  if (!user.lastActiveDate) {
    return (user.streak || 0) !== 0;
  }
  return daysBetweenUtc(user.lastActiveDate, now) >= 2 && (user.streak || 0) !== 0;
}

/**
 * Persist a broken streak so dashboard numbers stay accurate after idle days.
 */
async function refreshStreak(user, now = new Date()) {
  if (isStreakStale(user, now)) {
    user.streak = 0;
    await user.save();
  }
  return user;
}

module.exports = {
  computeStreakUpdate,
  getEffectiveStreak,
  isStreakStale,
  refreshStreak
};
