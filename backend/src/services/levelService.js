const { getLevelFromXp, getXpProgress } = require('./xpService');

/**
 * Apply derived level onto a user document from their current XP.
 * Mutates the user object (does not save).
 */
function applyLevelProgression(user, previousLevel = user.level) {
  const oldLevel = previousLevel;
  const newLevel = getLevelFromXp(user.xp);
  user.level = newLevel;

  return {
    levelUp: newLevel > oldLevel,
    oldLevel,
    newLevel,
    currentXp: user.xp,
    levelsGained: Math.max(0, newLevel - oldLevel),
    xpProgress: getXpProgress(user.xp)
  };
}

function detectLevelUp(oldXp, newXp) {
  const oldLevel = getLevelFromXp(oldXp);
  const newLevel = getLevelFromXp(newXp);
  return {
    levelUp: newLevel > oldLevel,
    oldLevel,
    newLevel,
    currentXp: newXp
  };
}

module.exports = {
  applyLevelProgression,
  detectLevelUp
};
