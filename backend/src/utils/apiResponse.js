function sendSuccess(res, { status = 200, message = 'Success', data = null } = {}) {
  return res.status(status).json({
    success: true,
    message,
    data
  });
}

function sendError(res, { status = 500, message = 'Server error', details = undefined } = {}) {
  const payload = {
    success: false,
    message
  };
  if (details !== undefined) {
    payload.details = details;
  }
  return res.status(status).json(payload);
}

module.exports = {
  sendSuccess,
  sendError
};
