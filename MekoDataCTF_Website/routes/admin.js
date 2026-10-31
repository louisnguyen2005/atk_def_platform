const router = require('express').Router();
const adminController = require('../controllers/adminController');
const { requireAdmin } = require('../middlewares/auth');

router.use(requireAdmin);

// Khu quản trị dùng khung riêng (sidebar), không dùng layout của trang công khai.
router.use((req, res, next) => {
  res.locals.layout = 'layouts/admin';
  next();
});

router.get('/', adminController.dashboard);
router.get('/contents', adminController.contents);
router.post('/contents', adminController.saveContents);
router.get('/schedule', adminController.schedule);
router.post('/schedule', adminController.saveSchedule);
router.get('/teams', adminController.teams);
router.get('/teams/:id', adminController.teamDetail);
router.post('/teams/:id/delete', adminController.deleteTeam);
router.post('/teams/:id/token', adminController.regenerateToken);
router.post('/teams/:id/forcad', adminController.saveForcadName);
router.get('/export.xlsx', adminController.exportXlsx);
router.get('/export.csv', adminController.exportCsv);

module.exports = router;
