const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const userService = require('../services/userService');
const { toPublicUser } = require('../utils/playerView');

const getProfile = asyncHandler(async (req, res) => {
  return sendSuccess(res, {
    message: 'Player profile',
    data: { user: toPublicUser(req.user) }
  });
});

const updateProfile = asyncHandler(async (req, res) => {
  const user = await userService.updateProfile(req.user, {
    name: req.body.name,
    email: req.body.email
  });
  return sendSuccess(res, {
    message: 'Profile updated',
    data: { user }
  });
});

const changePassword = asyncHandler(async (req, res) => {
  await userService.changePassword(req.user._id, req.body.currentPassword, req.body.newPassword);
  return sendSuccess(res, {
    message: 'Password updated successfully',
    data: null
  });
});

const getDashboard = asyncHandler(async (req, res) => {
  const dashboard = await userService.getDashboard(req.user);
  return sendSuccess(res, {
    message: 'Dashboard data',
    data: dashboard
  });
});

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  getDashboard
};
