const mongoose = require('mongoose');
const ApiError = require('../utils/apiError');
const { sendError } = require('../utils/apiResponse');

function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Route ${req.method} ${req.originalUrl} not found`));
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  let status = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details;

  if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = 'Invalid ID format';
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => e.message);
  } else if (err.code === 11000) {
    status = 409;
    const fields = Object.keys(err.keyPattern || err.keyValue || {});
    if (fields.includes('email')) {
      message = 'Email is already registered';
    } else {
      message = 'Duplicate resource';
    }
  } else if (err.name === 'JsonWebTokenError') {
    status = 401;
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    status = 401;
    message = 'Token has expired';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Invalid JSON payload';
  }

  if (status >= 500 && process.env.NODE_ENV !== 'test') {
    console.error(err);
  }

  const payload = { status, message, details };
  if (process.env.NODE_ENV === 'development') {
    payload.details = payload.details || err.stack;
  }

  return sendError(res, payload);
}

module.exports = {
  notFoundHandler,
  errorHandler
};
