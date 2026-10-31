const router = require('express').Router();
const teamController = require('../controllers/teamController');
const { requireCaptain, requireTeamAccess } = require('../middlewares/auth');

router.get('/', requireTeamAccess, teamController.show);
router.get('/edit', requireCaptain, teamController.edit);
router.post('/', requireCaptain, teamController.save);

module.exports = router;
