const {
  getConversations,
  getMessages,
  sendMessage,
} = require('../controllers/chatController');
const { authenticate } = require('../middleware/auth');

const router = require('express').Router();

router.use(authenticate);

router.get('/conversations', getConversations);
router.get('/:userId', getMessages);
router.post('/', sendMessage);

module.exports = router;
