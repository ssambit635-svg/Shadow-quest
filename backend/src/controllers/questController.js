const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const questService = require('../services/questService');

const createQuest = asyncHandler(async (req, res) => {
  const quest = await questService.createQuest(req.user._id, req.body);
  return sendSuccess(res, {
    status: 201,
    message: 'Quest created',
    data: { quest }
  });
});

const listQuests = asyncHandler(async (req, res) => {
  const result = await questService.listQuests(req.user._id, req.query);
  return sendSuccess(res, {
    message: 'Quests retrieved',
    data: result
  });
});

const getQuest = asyncHandler(async (req, res) => {
  const quest = await questService.getQuestById(req.user._id, req.params.id);
  return sendSuccess(res, {
    message: 'Quest retrieved',
    data: { quest }
  });
});

const updateQuest = asyncHandler(async (req, res) => {
  const quest = await questService.updateQuest(req.user._id, req.params.id, req.body);
  return sendSuccess(res, {
    message: 'Quest updated',
    data: { quest }
  });
});

const deleteQuest = asyncHandler(async (req, res) => {
  await questService.deleteQuest(req.user._id, req.params.id);
  return sendSuccess(res, {
    message: 'Quest deleted',
    data: null
  });
});

const completeQuest = asyncHandler(async (req, res) => {
  const result = await questService.completeQuest(req.user, req.params.id);
  return sendSuccess(res, {
    message: 'Quest completed successfully',
    data: result
  });
});

module.exports = {
  createQuest,
  listQuests,
  getQuest,
  updateQuest,
  deleteQuest,
  completeQuest
};
