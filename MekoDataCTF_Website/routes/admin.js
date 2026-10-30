const router = require('express').Router();
const adminController = require('../controllers/adminController');
const { requireAdmin } = require('../middlewares/auth');

router.use(requireAdmin);

router.get('/', adminController.dashboard);
router.get('/contents', adminController.contents);
router.post('/contents', adminController.saveContents);
router.get('/schedule', adminController.schedule);
router.post('/schedule', adminController.saveSchedule);
router.get('/teams', adminController.teams);
router.get('/teams/:id', adminController.teamDetail);
router.post('/teams/:id/delete', adminController.deleteTeam);
router.get('/export.xlsx', adminController.exportXlsx);
router.get('/export.csv', adminController.exportCsv);

module.exports = router;
