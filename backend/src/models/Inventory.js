const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1
    },
    acquiredAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

inventorySchema.index({ userId: 1, itemId: 1 }, { unique: true });

const Inventory = mongoose.model('Inventory', inventorySchema);

module.exports = Inventory;
