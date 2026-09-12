const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');

const listInventory = asyncHandler(async (req, res) => {
  const items = await Inventory.find({ userId: req.user._id })
    .populate('itemId')
    .sort({ updatedAt: -1 })
    .lean();

  const data = items
    .filter((row) => row.itemId)
    .map((row) => ({
      id: row._id,
      quantity: row.quantity,
      acquiredAt: row.acquiredAt,
      updatedAt: row.updatedAt,
      item: row.itemId
    }));

  return sendSuccess(res, {
    message: 'Inventory retrieved',
    data: {
      count: data.length,
      totalQuantity: data.reduce((sum, row) => sum + row.quantity, 0),
      items: data
    }
  });
});

const getInventoryItem = asyncHandler(async (req, res) => {
  const { itemId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    throw new ApiError(400, 'Invalid item ID');
  }

  const row = await Inventory.findOne({ userId: req.user._id, itemId }).populate('itemId');
  if (!row || !row.itemId) {
    throw new ApiError(404, 'Item not found in inventory');
  }

  return sendSuccess(res, {
    message: 'Inventory item retrieved',
    data: {
      id: row._id,
      quantity: row.quantity,
      acquiredAt: row.acquiredAt,
      item: row.itemId
    }
  });
});

module.exports = {
  listInventory,
  getInventoryItem
};
