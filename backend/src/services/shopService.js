const mongoose = require('mongoose');
const Item = require('../models/Item');
const Inventory = require('../models/Inventory');
const User = require('../models/User');
const ApiError = require('../utils/apiError');
const { ITEM_RARITIES, ITEM_TYPES } = require('../config/game');
const { toPublicUser } = require('../utils/playerView');

async function listItems(query = {}) {
  const filter = { active: true };
  if (query.rarity) {
    if (!ITEM_RARITIES.includes(query.rarity)) {
      throw new ApiError(400, `Rarity must be one of: ${ITEM_RARITIES.join(', ')}`);
    }
    filter.rarity = query.rarity;
  }
  if (query.type) {
    if (!ITEM_TYPES.includes(query.type)) {
      throw new ApiError(400, `Type must be one of: ${ITEM_TYPES.join(', ')}`);
    }
    filter.type = query.type;
  }

  return Item.find(filter).sort({ price: 1, name: 1 }).lean();
}

async function buyItem(user, itemId, requestedQuantity = 1) {
  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    throw new ApiError(400, 'Invalid item ID');
  }

  const quantity = Number(requestedQuantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    throw new ApiError(400, 'Quantity must be an integer between 1 and 50');
  }

  const item = await Item.findById(itemId);
  if (!item || !item.active) {
    throw new ApiError(404, 'Item not found');
  }

  // Price is ALWAYS read from the database — never from the request body.
  const unitPrice = item.price;
  const totalPrice = unitPrice * quantity;

  const updatedUser = await User.findOneAndUpdate(
    { _id: user._id, gold: { $gte: totalPrice } },
    { $inc: { gold: -totalPrice } },
    { new: true }
  );

  if (!updatedUser) {
    const latest = await User.findById(user._id).select('gold');
    throw new ApiError(400, 'Insufficient gold', {
      required: totalPrice,
      balance: latest ? latest.gold : 0
    });
  }

  try {
    const inventoryItem = await Inventory.findOneAndUpdate(
      { userId: user._id, itemId: item._id },
      {
        $inc: { quantity },
        $setOnInsert: { acquiredAt: new Date() }
      },
      { upsert: true, new: true }
    );

    const populated = await inventoryItem.populate('itemId');

    return {
      goldSpent: totalPrice,
      quantityPurchased: quantity,
      unitPrice,
      player: toPublicUser(updatedUser),
      gold: updatedUser.gold,
      inventoryItem: {
        id: populated._id,
        item: populated.itemId,
        quantity: populated.quantity,
        acquiredAt: populated.acquiredAt
      }
    };
  } catch (err) {
    await User.findByIdAndUpdate(user._id, { $inc: { gold: totalPrice } });
    throw err;
  }
}

module.exports = {
  listItems,
  buyItem
};
