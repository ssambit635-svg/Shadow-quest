const express = require('express');
const questController = require('../controllers/questController');
const { protect } = require('../middleware/authMiddleware');
const {
  stripForbiddenFields,
  createQuestRules,
  updateQuestRules,
  validateObjectId
} = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(protect);
router.use(stripForbiddenFields);

router.post('/', createQuestRules, questController.createQuest);
router.get('/', questController.listQuests);
router.get('/:id', validateObjectId('id'), questController.getQuest);
router.put('/:id', validateObjectId('id'), updateQuestRules, questController.updateQuest);
router.delete('/:id', validateObjectId('id'), questController.deleteQuest);
router.post('/:id/complete', validateObjectId('id'), questController.completeQuest);

module.exports = router;
