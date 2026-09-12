const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const shopService = require('../services/shopService');

const listItems = asyncHandler(async (req, res) => {
  const items = await shopService.listItems(req.query);
  return sendSuccess(res, {
    message: 'Shop items retrieved',
    data: { items }
  });
});

const buyItem = asyncHandler(async (req, res) => {
  const result = await shopService.buyItem(req.user, req.params.id, req.body.quantity || 1);
  return sendSuccess(res, {
    message: 'Item purchased successfully',
    data: result
  });
});

module.exports = {
  listItems,
  buyItem
};
