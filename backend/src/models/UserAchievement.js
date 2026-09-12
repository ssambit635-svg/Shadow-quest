const mongoose = require('mongoose');

const userAchievementSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    achievementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Achievement',
      required: true
    },
    unlockedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

userAchievementSchema.index({ userId: 1, achievementId: 1 }, { unique: true });

const UserAchievement = mongoose.model('UserAchievement', userAchievementSchema);

module.exports = UserAchievement;
