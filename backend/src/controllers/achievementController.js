const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { getAchievementsForUser } = require('../services/achievementService');

const listAchievements = asyncHandler(async (req, res) => {
  const achievements = await getAchievementsForUser(req.user._id);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return sendSuccess(res, {
    message: 'Achievements retrieved',
    data: {
      unlockedCount,
      total: achievements.length,
      achievements
    }
  });
});

module.exports = {
  listAchievements
};
