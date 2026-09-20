import { Router } from 'express';
import {
  getConversations,
  getMessages,
  sendMessage,
} from '../controllers/chatController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/conversations', getConversations);
router.get('/:userId', getMessages);
router.post('/', sendMessage);

export default router;
