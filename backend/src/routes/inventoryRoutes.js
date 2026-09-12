const express = require('express');
const inventoryController = require('../controllers/inventoryController');
const { protect } = require('../middleware/authMiddleware');
const { validateObjectId } = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(protect);

router.get('/', inventoryController.listInventory);
router.get('/:itemId', validateObjectId('itemId'), inventoryController.getInventoryItem);

module.exports = router;
