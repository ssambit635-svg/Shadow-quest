const mongoose = require('mongoose');

const achievementSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    requirement: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      enum: ['quests', 'level', 'streak', 'gold'],
      required: true
    },
    threshold: {
      type: Number,
      required: true,
      min: 1
    },
    icon: {
      type: String,
      default: 'achievement'
    }
  },
  { timestamps: true }
);

const Achievement = mongoose.model('Achievement', achievementSchema);

module.exports = Achievement;
