const express = require('express');
const historyController = require('../controllers/historyController');
const { protect } = require('../middleware/authMiddleware');
const { historyFilterRules } = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(protect);
router.get('/', historyFilterRules, historyController.listHistory);

module.exports = router;
