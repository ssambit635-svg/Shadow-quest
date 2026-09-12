const express = require('express');
const shopController = require('../controllers/shopController');
const { protect } = require('../middleware/authMiddleware');
const { shopFilterRules, buyItemRules, stripForbiddenFields } = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(protect);
router.use(stripForbiddenFields);

router.get('/items', shopFilterRules, shopController.listItems);
router.post('/items/:id/buy', buyItemRules, shopController.buyItem);

module.exports = router;
