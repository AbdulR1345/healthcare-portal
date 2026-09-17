const {
  uploadDocument,
  getMyDocuments,
  summarizeDocument,
} = require('../controllers/documentController');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = require('express').Router();

router.use(authenticate);

router.get('/', getMyDocuments);
router.post('/upload', upload.single('file'), uploadDocument);
router.post('/:id/summarize', summarizeDocument);

module.exports = router;
