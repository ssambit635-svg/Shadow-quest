const mongoose = require('mongoose');
const { DIFFICULTIES, CATEGORIES, QUEST_STATUSES, RECURRENCE } = require('../config/game');

const questSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      minlength: [1, 'Title is required'],
      maxlength: [120, 'Title cannot exceed 120 characters']
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [2000, 'Description cannot exceed 2000 characters']
    },
    difficulty: {
      type: String,
      enum: DIFFICULTIES,
      required: true
    },
    category: {
      type: String,
      enum: CATEGORIES,
      default: 'other'
    },
    xpReward: {
      type: Number,
      required: true,
      min: 0
    },
    goldReward: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: QUEST_STATUSES,
      default: 'active',
      index: true
    },
    recurrence: {
      type: String,
      enum: RECURRENCE,
      default: 'none'
    },
    dueDate: {
      type: Date,
      default: null
    },
    completedAt: {
      type: Date,
      default: null
    },
    lastCompletedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

questSchema.index({ userId: 1, status: 1 });
questSchema.index({ userId: 1, createdAt: -1 });
questSchema.index({ userId: 1, dueDate: 1 });

const Quest = mongoose.model('Quest', questSchema);

module.exports = Quest;
