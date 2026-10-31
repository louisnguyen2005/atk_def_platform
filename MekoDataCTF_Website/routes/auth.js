const router = require('express').Router();
const authController = require('../controllers/authController');
const { requireGuest, requireSession } = require('../middlewares/auth');

router.get('/login', requireGuest, authController.showLogin);
router.post('/login', requireGuest, authController.login);
router.post('/login/token', requireGuest, authController.tokenLogin);
router.get('/register', requireGuest, authController.showRegister);
router.post('/register', requireGuest, authController.register);
router.post('/logout', requireSession, authController.logout);

module.exports = router;
