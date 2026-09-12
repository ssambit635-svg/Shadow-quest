const mongoose = require('mongoose');
const { ITEM_RARITIES, ITEM_TYPES } = require('../config/game');

const itemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    rarity: {
      type: String,
      enum: ITEM_RARITIES,
      default: 'common'
    },
    type: {
      type: String,
      enum: ITEM_TYPES,
      default: 'cosmetic'
    },
    icon: {
      type: String,
      default: 'item'
    },
    active: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

itemSchema.index({ active: 1, rarity: 1, type: 1 });

const Item = mongoose.model('Item', itemSchema);

module.exports = Item;
