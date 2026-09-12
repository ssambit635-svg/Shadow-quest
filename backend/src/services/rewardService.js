const { REWARDS_BY_DIFFICULTY, DIFFICULTIES } = require('../config/game');
const ApiError = require('../utils/apiError');

function getRewardsForDifficulty(difficulty) {
  const key = String(difficulty || '').toLowerCase();
  const rewards = REWARDS_BY_DIFFICULTY[key];
  if (!rewards) {
    throw new ApiError(400, `Invalid difficulty. Must be one of: ${DIFFICULTIES.join(', ')}`);
  }
  return { xp: rewards.xp, gold: rewards.gold };
}

/**
 * Gold deduction is always computed from a trusted server-side price.
 */
function canAfford(balance, price) {
  return Number(balance) >= Number(price);
}

function deductGold(balance, price) {
  const next = Number(balance) - Number(price);
  if (next < 0) {
    throw new ApiError(400, 'Insufficient gold');
  }
  return next;
}

module.exports = {
  getRewardsForDifficulty,
  canAfford,
  deductGold
};
