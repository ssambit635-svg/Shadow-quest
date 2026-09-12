const { body, query, param, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const ApiError = require('../utils/apiError');
const { CATEGORIES, DIFFICULTIES, RECURRENCE, ITEM_RARITIES, ITEM_TYPES } = require('../config/game');

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }
  const details = errors.array().map((err) => ({
    field: err.path,
    message: err.msg
  }));
  return next(new ApiError(400, details[0].message, details));
}

function validateObjectId(paramName = 'id') {
  return (req, res, next) => {
    const value = req.params[paramName];
    if (!mongoose.Types.ObjectId.isValid(value)) {
      return next(new ApiError(400, `Invalid ${paramName}`));
    }
    next();
  };
}

/**
 * Strip any attempt to set authoritative game fields from the client.
 */
function stripForbiddenFields(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    const forbidden = [
      'xp',
      'gold',
      'level',
      'streak',
      'longestStreak',
      'totalQuestsCompleted',
      'totalGoldEarned',
      'lastActiveDate',
      'xpReward',
      'goldReward',
      'xpEarned',
      'goldEarned',
      'price',
      'userId',
      '_id',
      'id',
      'role'
    ];
    for (const key of forbidden) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        delete req.body[key];
      }
    }
  }
  next();
}

const registerRules = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email').trim().isEmail().withMessage('Please provide a valid email').normalizeEmail(),
  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters'),
  handleValidation
];

const loginRules = [
  body('email').trim().isEmail().withMessage('Please provide a valid email').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidation
];

const createQuestRules = [
  body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 120 }),
  body('description').optional().isString().isLength({ max: 2000 }),
  body('difficulty')
    .notEmpty()
    .withMessage('Difficulty is required')
    .isIn(DIFFICULTIES)
    .withMessage(`Difficulty must be one of: ${DIFFICULTIES.join(', ')}`),
  body('category')
    .optional()
    .isIn(CATEGORIES)
    .withMessage(`Category must be one of: ${CATEGORIES.join(', ')}`),
  body('recurrence')
    .optional()
    .isIn(RECURRENCE)
    .withMessage(`Recurrence must be one of: ${RECURRENCE.join(', ')}`),
  body('dueDate').optional({ nullable: true }).isISO8601().withMessage('dueDate must be a valid ISO date'),
  handleValidation
];

const updateQuestRules = [
  body('title').optional().trim().notEmpty().withMessage('Title cannot be empty').isLength({ max: 120 }),
  body('description').optional().isString().isLength({ max: 2000 }),
  body('difficulty')
    .optional()
    .isIn(DIFFICULTIES)
    .withMessage(`Difficulty must be one of: ${DIFFICULTIES.join(', ')}`),
  body('category')
    .optional()
    .isIn(CATEGORIES)
    .withMessage(`Category must be one of: ${CATEGORIES.join(', ')}`),
  body('recurrence')
    .optional()
    .isIn(RECURRENCE)
    .withMessage(`Recurrence must be one of: ${RECURRENCE.join(', ')}`),
  body('dueDate').optional({ nullable: true }).isISO8601().withMessage('dueDate must be a valid ISO date'),
  handleValidation
];

const updateProfileRules = [
  body('name').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  body('email').optional().trim().isEmail().withMessage('Please provide a valid email').normalizeEmail(),
  handleValidation
];

const changePasswordRules = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8, max: 128 })
    .withMessage('New password must be between 8 and 128 characters'),
  handleValidation
];

const shopFilterRules = [
  query('rarity').optional().isIn(ITEM_RARITIES).withMessage(`Rarity must be one of: ${ITEM_RARITIES.join(', ')}`),
  query('type').optional().isIn(ITEM_TYPES).withMessage(`Type must be one of: ${ITEM_TYPES.join(', ')}`),
  handleValidation
];

const buyItemRules = [
  param('id').isMongoId().withMessage('Invalid item ID'),
  body('quantity').optional().isInt({ min: 1, max: 50 }).withMessage('Quantity must be between 1 and 50'),
  handleValidation
];

const historyFilterRules = [
  query('difficulty').optional().isIn(DIFFICULTIES),
  query('category').optional().isIn(CATEGORIES),
  query('date').optional().isISO8601().withMessage('date must be a valid ISO date'),
  query('from').optional().isISO8601().withMessage('from must be a valid ISO date'),
  query('to').optional().isISO8601().withMessage('to must be a valid ISO date'),
  handleValidation
];

module.exports = {
  handleValidation,
  validateObjectId,
  stripForbiddenFields,
  registerRules,
  loginRules,
  createQuestRules,
  updateQuestRules,
  updateProfileRules,
  changePasswordRules,
  shopFilterRules,
  buyItemRules,
  historyFilterRules
};
