const User = require('../models/User');
const TokenBlacklist = require('../models/TokenBlacklist');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');
const { generateToken, decodeToken } = require('../utils/generateToken');
const { sendSuccess } = require('../utils/apiResponse');
const { toPublicUser } = require('../utils/playerView');
const { refreshStreak } = require('../services/streakService');

const register = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').toLowerCase().trim();
  const password = req.body.password;

  const existing = await User.findOne({ email });
  if (existing) {
    throw new ApiError(409, 'Email is already registered');
  }

  const user = await User.create({
    name,
    email,
    password,
    level: 1,
    xp: 0,
    gold: 0,
    streak: 0,
    longestStreak: 0,
    totalQuestsCompleted: 0,
    totalGoldEarned: 0
  });

  const token = generateToken(user._id);

  return sendSuccess(res, {
    status: 201,
    message: 'Registration successful',
    data: {
      token,
      user: toPublicUser(user)
    }
  });
});

const login = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const password = req.body.password;

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.matchPassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }

  await refreshStreak(user);
  const token = generateToken(user._id);

  return sendSuccess(res, {
    message: 'Login successful',
    data: {
      token,
      user: toPublicUser(user)
    }
  });
});

const me = asyncHandler(async (req, res) => {
  return sendSuccess(res, {
    message: 'Current player',
    data: {
      user: toPublicUser(req.user)
    }
  });
});

const logout = asyncHandler(async (req, res) => {
  const token = req.token;
  const decoded = decodeToken(token);
  const expiresAt = decoded && decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await TokenBlacklist.updateOne(
    { token },
    { $set: { token, expiresAt } },
    { upsert: true }
  );

  return sendSuccess(res, {
    message: 'Logged out successfully',
    data: null
  });
});

module.exports = {
  register,
  login,
  me,
  logout
};
