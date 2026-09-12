const { XP_LEVEL_FACTOR } = require('../config/game');

/**
 * Cumulative XP required to reach `level`.
 * Level 1 is 0 XP.
 */
function getXpRequiredForLevel(level) {
  const n = Number(level);
  if (!Number.isFinite(n) || n <= 1) return 0;
  return XP_LEVEL_FACTOR * ((n * (n + 1)) / 2 - 1);
}

/**
 * Inverse of getXpRequiredForLevel.
 */
function getLevelFromXp(xp) {
  const value = Math.max(0, Number(xp) || 0);
  const c = 2 * (value / XP_LEVEL_FACTOR + 1);
  const n = Math.floor((-1 + Math.sqrt(1 + 4 * c)) / 2);
  return Math.max(1, n);
}

function getXpProgress(xp) {
  const currentXp = Math.max(0, Number(xp) || 0);
  const level = getLevelFromXp(currentXp);
  const xpForCurrentLevel = getXpRequiredForLevel(level);
  const xpForNextLevel = getXpRequiredForLevel(level + 1);
  const xpIntoLevel = currentXp - xpForCurrentLevel;
  const xpForThisLevel = xpForNextLevel - xpForCurrentLevel;
  const progressPercent =
    xpForThisLevel <= 0 ? 100 : Math.min(100, Math.round((xpIntoLevel / xpForThisLevel) * 10000) / 100);

  return {
    level,
    currentXp,
    xpForCurrentLevel,
    xpForNextLevel,
    xpIntoLevel,
    xpToNextLevel: Math.max(0, xpForNextLevel - currentXp),
    progressPercent
  };
}

function addXp(currentXp, amount) {
  const safeAmount = Math.max(0, Number(amount) || 0);
  const previousXp = Math.max(0, Number(currentXp) || 0);
  const nextXp = previousXp + safeAmount;
  return {
    previousXp,
    xpGained: safeAmount,
    currentXp: nextXp,
    previousLevel: getLevelFromXp(previousXp),
    newLevel: getLevelFromXp(nextXp)
  };
}

module.exports = {
  getXpRequiredForLevel,
  getLevelFromXp,
  getXpProgress,
  addXp
};
