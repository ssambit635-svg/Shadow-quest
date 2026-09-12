const mongoose = require('mongoose');
const { DIFFICULTIES, CATEGORIES, RECURRENCE } = require('../config/game');

const questCompletionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    questId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quest',
      required: true
    },
    questTitle: {
      type: String,
      required: true
    },
    difficulty: {
      type: String,
      enum: DIFFICULTIES,
      required: true
    },
    category: {
      type: String,
      enum: CATEGORIES,
      required: true
    },
    xpEarned: {
      type: Number,
      required: true,
      min: 0
    },
    goldEarned: {
      type: Number,
      required: true,
      min: 0
    },
    recurrence: {
      type: String,
      enum: RECURRENCE,
      default: 'none'
    },
    /**
     * Anti-duplicate key:
     *  - none   → "once"
     *  - daily  → "YYYY-MM-DD"
     *  - weekly → "YYYY-Www"
     */
    periodKey: {
      type: String,
      required: true
    },
    completedAt: {
      type: Date,
      required: true,
      default: Date.now
    }
  },
  { timestamps: true }
);

questCompletionSchema.index({ userId: 1, completedAt: -1 });
questCompletionSchema.index({ userId: 1, questId: 1, periodKey: 1 }, { unique: true });
questCompletionSchema.index({ userId: 1, category: 1 });
questCompletionSchema.index({ userId: 1, difficulty: 1 });

const QuestCompletion = mongoose.model('QuestCompletion', questCompletionSchema);

module.exports = QuestCompletion;
