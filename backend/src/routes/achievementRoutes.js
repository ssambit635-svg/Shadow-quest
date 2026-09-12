const express = require('express');
const achievementController = require('../controllers/achievementController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);
router.get('/', achievementController.listAchievements);

module.exports = router;
