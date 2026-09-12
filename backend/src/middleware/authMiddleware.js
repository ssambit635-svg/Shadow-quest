const jwt = require('jsonwebtoken');
const User = require('../models/User');
const TokenBlacklist = require('../models/TokenBlacklist');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');
const { refreshStreak } = require('../services/streakService');

function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  return null;
}

const protect = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    throw new ApiError(401, 'Not authorized. Token missing');
  }

  const blacklisted = await TokenBlacklist.findOne({ token }).lean();
  if (blacklisted) {
    throw new ApiError(401, 'Token has been invalidated. Please log in again');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new ApiError(401, 'Token has expired');
    }
    throw new ApiError(401, 'Invalid token');
  }

  const user = await User.findById(decoded.id);
  if (!user) {
    throw new ApiError(401, 'User no longer exists');
  }

  await refreshStreak(user);

  req.user = user;
  req.token = token;
  next();
});

module.exports = {
  protect,
  extractToken
};
