const express = require('express');
const authController = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { registerRules, loginRules } = require('../middleware/validationMiddleware');

const router = express.Router();

router.post('/register', registerRules, authController.register);
router.post('/login', loginRules, authController.login);
router.get('/me', protect, authController.me);
router.post('/logout', protect, authController.logout);

module.exports = router;
