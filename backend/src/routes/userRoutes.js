const express = require('express');
const userController = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const {
  stripForbiddenFields,
  updateProfileRules,
  changePasswordRules
} = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(protect);
router.use(stripForbiddenFields);

router.get('/dashboard', userController.getDashboard);
router.get('/profile', userController.getProfile);
router.put('/profile', updateProfileRules, userController.updateProfile);
router.put('/password', changePasswordRules, userController.changePassword);

module.exports = router;
