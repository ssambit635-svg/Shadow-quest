const mongoose = require('mongoose');
const Quest = require('../models/Quest');
const QuestCompletion = require('../models/QuestCompletion');
const User = require('../models/User');
const ApiError = require('../utils/apiError');
const { getPeriodKey } = require('../utils/dates');
const { parsePagination, paginationMeta } = require('../utils/pagination');
const { getRewardsForDifficulty } = require('./rewardService');
const { applyLevelProgression } = require('./levelService');
const { computeStreakUpdate } = require('./streakService');
const { evaluateAchievements } = require('./achievementService');
const { toPublicUser } = require('../utils/playerView');
const { CATEGORIES, DIFFICULTIES, QUEST_STATUSES, RECURRENCE } = require('../config/game');

function assertOwned(quest, userId) {
  if (!quest) {
    throw new ApiError(404, 'Quest not found');
  }
  if (String(quest.userId) !== String(userId)) {
    throw new ApiError(403, 'You do not have permission to access this quest');
  }
}

function sanitizeQuestInput(body) {
  const input = {};
  if (body.title !== undefined) input.title = String(body.title).trim();
  if (body.description !== undefined) input.description = String(body.description).trim();
  if (body.difficulty !== undefined) input.difficulty = String(body.difficulty).toLowerCase();
  if (body.category !== undefined) input.category = String(body.category).toLowerCase();
  if (body.recurrence !== undefined) input.recurrence = String(body.recurrence).toLowerCase();
  if (body.dueDate !== undefined) {
    input.dueDate = body.dueDate === null || body.dueDate === '' ? null : new Date(body.dueDate);
    if (input.dueDate && Number.isNaN(input.dueDate.getTime())) {
      throw new ApiError(400, 'Invalid dueDate');
    }
  }
  return input;
}

async function createQuest(userId, body) {
  const input = sanitizeQuestInput(body);

  if (!input.title) {
    throw new ApiError(400, 'Title is required');
  }
  if (!input.difficulty || !DIFFICULTIES.includes(input.difficulty)) {
    throw new ApiError(400, `Difficulty is required and must be one of: ${DIFFICULTIES.join(', ')}`);
  }
  if (input.category && !CATEGORIES.includes(input.category)) {
    throw new ApiError(400, `Category must be one of: ${CATEGORIES.join(', ')}`);
  }
  if (input.recurrence && !RECURRENCE.includes(input.recurrence)) {
    throw new ApiError(400, `Recurrence must be one of: ${RECURRENCE.join(', ')}`);
  }

  const rewards = getRewardsForDifficulty(input.difficulty);

  const quest = await Quest.create({
    userId,
    title: input.title,
    description: input.description || '',
    difficulty: input.difficulty,
    category: input.category || 'other',
    recurrence: input.recurrence || 'none',
    dueDate: input.dueDate || null,
    xpReward: rewards.xp,
    goldReward: rewards.gold,
    status: 'active'
  });

  return quest;
}

async function listQuests(userId, query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { userId };

  if (query.status) {
    if (!QUEST_STATUSES.includes(query.status)) {
      throw new ApiError(400, `Status must be one of: ${QUEST_STATUSES.join(', ')}`);
    }
    filter.status = query.status;
  }
  if (query.category) {
    if (!CATEGORIES.includes(query.category)) {
      throw new ApiError(400, `Category must be one of: ${CATEGORIES.join(', ')}`);
    }
    filter.category = query.category;
  }
  if (query.difficulty) {
    if (!DIFFICULTIES.includes(query.difficulty)) {
      throw new ApiError(400, `Difficulty must be one of: ${DIFFICULTIES.join(', ')}`);
    }
    filter.difficulty = query.difficulty;
  }
  if (query.recurrence) {
    if (!RECURRENCE.includes(query.recurrence)) {
      throw new ApiError(400, `Recurrence must be one of: ${RECURRENCE.join(', ')}`);
    }
    filter.recurrence = query.recurrence;
  }

  const [quests, total] = await Promise.all([
    Quest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Quest.countDocuments(filter)
  ]);

  const now = new Date();
  const questIds = quests.map((q) => q._id);
  const completions = await QuestCompletion.find({
    userId,
    questId: { $in: questIds }
  }).select('questId periodKey completedAt').lean();

  const completionKeys = new Set(completions.map((c) => `${c.questId}:${c.periodKey}`));

  const data = quests.map((quest) => {
    const obj = quest.toObject();
    const periodKey = getPeriodKey(quest.recurrence, now);
    obj.completedInCurrentPeriod = completionKeys.has(`${quest._id}:${periodKey}`);
    return obj;
  });

  return {
    quests: data,
    pagination: paginationMeta({ page, limit, total })
  };
}

async function getQuestById(userId, questId) {
  if (!mongoose.Types.ObjectId.isValid(questId)) {
    throw new ApiError(400, 'Invalid quest ID');
  }
  const quest = await Quest.findById(questId);
  if (!quest) throw new ApiError(404, 'Quest not found');
  assertOwned(quest, userId);

  const periodKey = getPeriodKey(quest.recurrence, new Date());
  const completion = await QuestCompletion.findOne({
    userId,
    questId: quest._id,
    periodKey
  }).lean();

  const obj = quest.toObject();
  obj.completedInCurrentPeriod = Boolean(completion);
  return obj;
}

async function updateQuest(userId, questId, body) {
  if (!mongoose.Types.ObjectId.isValid(questId)) {
    throw new ApiError(400, 'Invalid quest ID');
  }
  const quest = await Quest.findById(questId);
  assertOwned(quest, userId);

  if (body.status !== undefined && body.status !== quest.status) {
    throw new ApiError(400, 'Quest status cannot be changed directly. Complete the quest via POST /api/quests/:id/complete');
  }

  const input = sanitizeQuestInput(body);

  if (input.title !== undefined) {
    if (!input.title) throw new ApiError(400, 'Title cannot be empty');
    quest.title = input.title;
  }
  if (input.description !== undefined) quest.description = input.description;
  if (input.category !== undefined) {
    if (!CATEGORIES.includes(input.category)) {
      throw new ApiError(400, `Category must be one of: ${CATEGORIES.join(', ')}`);
    }
    quest.category = input.category;
  }
  if (input.recurrence !== undefined) {
    if (!RECURRENCE.includes(input.recurrence)) {
      throw new ApiError(400, `Recurrence must be one of: ${RECURRENCE.join(', ')}`);
    }
    if (quest.status === 'completed' && quest.recurrence === 'none') {
      throw new ApiError(400, 'Cannot change recurrence of a completed one-time quest');
    }
    quest.recurrence = input.recurrence;
  }
  if (input.dueDate !== undefined) quest.dueDate = input.dueDate;

  if (input.difficulty !== undefined) {
    if (!DIFFICULTIES.includes(input.difficulty)) {
      throw new ApiError(400, `Difficulty must be one of: ${DIFFICULTIES.join(', ')}`);
    }
    if (quest.status === 'completed' && quest.recurrence === 'none') {
      throw new ApiError(400, 'Cannot change difficulty of a completed one-time quest');
    }
    quest.difficulty = input.difficulty;
    const rewards = getRewardsForDifficulty(input.difficulty);
    quest.xpReward = rewards.xp;
    quest.goldReward = rewards.gold;
  }

  await quest.save();
  return quest;
}

async function deleteQuest(userId, questId) {
  if (!mongoose.Types.ObjectId.isValid(questId)) {
    throw new ApiError(400, 'Invalid quest ID');
  }
  const quest = await Quest.findById(questId);
  assertOwned(quest, userId);
  await quest.deleteOne();
  return { id: questId };
}

/**
 * Critical gameplay path. All rewards come from the stored quest document,
 * which was populated from server constants at creation time.
 */
async function completeQuest(user, questId) {
  if (!mongoose.Types.ObjectId.isValid(questId)) {
    throw new ApiError(400, 'Invalid quest ID');
  }

  const quest = await Quest.findById(questId);
  assertOwned(quest, user._id);

  if (quest.status === 'cancelled') {
    throw new ApiError(400, 'Cannot complete a cancelled quest');
  }
  if (quest.recurrence === 'none' && quest.status === 'completed') {
    throw new ApiError(409, 'Quest has already been completed');
  }

  const now = new Date();
  const periodKey = getPeriodKey(quest.recurrence, now);

  const alreadyRewarded = await QuestCompletion.findOne({
    userId: user._id,
    questId: quest._id,
    periodKey
  }).lean();
  if (alreadyRewarded) {
    throw new ApiError(409, 'Quest has already been completed for this period');
  }

  const xpReward = quest.xpReward;
  const goldReward = quest.goldReward;
  const oldLevel = user.level;
  const previousStreak = user.streak || 0;

  let completion;
  try {
    completion = await QuestCompletion.create({
      userId: user._id,
      questId: quest._id,
      questTitle: quest.title,
      difficulty: quest.difficulty,
      category: quest.category,
      xpEarned: xpReward,
      goldEarned: goldReward,
      recurrence: quest.recurrence,
      periodKey,
      completedAt: now
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, 'Quest has already been completed for this period');
    }
    throw err;
  }

  try {
    if (quest.recurrence === 'none') {
      quest.status = 'completed';
      quest.completedAt = now;
    }
    quest.lastCompletedAt = now;
    await quest.save();

    const streakUpdate = computeStreakUpdate(user, now);

    user.xp += xpReward;
    user.gold += goldReward;
    user.totalGoldEarned += goldReward;
    user.totalQuestsCompleted += 1;
    user.streak = streakUpdate.streak;
    user.longestStreak = streakUpdate.longestStreak;
    user.lastActiveDate = streakUpdate.lastActiveDate;

    const levelResult = applyLevelProgression(user, oldLevel);
    await user.save();

    const achievementsUnlocked = await evaluateAchievements(user);

    const freshUser = await User.findById(user._id);

    return {
      quest,
      completion,
      rewards: {
        xp: xpReward,
        gold: goldReward
      },
      player: toPublicUser(freshUser),
      levelUp: levelResult.levelUp,
      oldLevel: levelResult.oldLevel,
      newLevel: levelResult.newLevel,
      currentXp: freshUser.xp,
      currentGold: freshUser.gold,
      currentLevel: freshUser.level,
      streak: {
        current: freshUser.streak,
        longest: freshUser.longestStreak,
        lastActiveDate: freshUser.lastActiveDate,
        increased: streakUpdate.increased && !streakUpdate.alreadyActiveToday
      },
      previousStreak,
      achievementsUnlocked
    };
  } catch (err) {
    await QuestCompletion.deleteOne({ _id: completion._id });
    throw err;
  }
}

module.exports = {
  createQuest,
  listQuests,
  getQuestById,
  updateQuest,
  deleteQuest,
  completeQuest
};
