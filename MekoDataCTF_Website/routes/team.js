const router = require('express').Router();
const teamController = require('../controllers/teamController');
const { requireLogin } = require('../middlewares/auth');

router.use(requireLogin);
router.get('/', teamController.show);
router.get('/edit', teamController.edit);
router.post('/', teamController.save);

module.exports = router;
