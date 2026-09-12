const QuestCompletion = require('../models/QuestCompletion');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { parsePagination, paginationMeta } = require('../utils/pagination');
const { startOfUtcDay, endOfUtcDay } = require('../utils/dates');
const ApiError = require('../utils/apiError');
const { CATEGORIES, DIFFICULTIES } = require('../config/game');

const listHistory = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { userId: req.user._id };

  if (req.query.difficulty) {
    if (!DIFFICULTIES.includes(req.query.difficulty)) {
      throw new ApiError(400, `Difficulty must be one of: ${DIFFICULTIES.join(', ')}`);
    }
    filter.difficulty = req.query.difficulty;
  }
  if (req.query.category) {
    if (!CATEGORIES.includes(req.query.category)) {
      throw new ApiError(400, `Category must be one of: ${CATEGORIES.join(', ')}`);
    }
    filter.category = req.query.category;
  }

  if (req.query.date) {
    const day = new Date(req.query.date);
    if (Number.isNaN(day.getTime())) {
      throw new ApiError(400, 'Invalid date');
    }
    filter.completedAt = { $gte: startOfUtcDay(day), $lt: endOfUtcDay(day) };
  } else {
    const range = {};
    if (req.query.from) {
      const from = new Date(req.query.from);
      if (Number.isNaN(from.getTime())) throw new ApiError(400, 'Invalid from date');
      range.$gte = startOfUtcDay(from);
    }
    if (req.query.to) {
      const to = new Date(req.query.to);
      if (Number.isNaN(to.getTime())) throw new ApiError(400, 'Invalid to date');
      range.$lt = endOfUtcDay(to);
    }
    if (Object.keys(range).length) {
      filter.completedAt = range;
    }
  }

  const [entries, total] = await Promise.all([
    QuestCompletion.find(filter).sort({ completedAt: -1 }).skip(skip).limit(limit).lean(),
    QuestCompletion.countDocuments(filter)
  ]);

  return sendSuccess(res, {
    message: 'Productivity history retrieved',
    data: {
      history: entries,
      pagination: paginationMeta({ page, limit, total })
    }
  });
});

module.exports = {
  listHistory
};
