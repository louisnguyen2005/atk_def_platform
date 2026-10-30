const router = require('express').Router();
const authController = require('../controllers/authController');
const { requireGuest, requireLogin } = require('../middlewares/auth');

router.get('/login', requireGuest, authController.showLogin);
router.post('/login', requireGuest, authController.login);
router.get('/register', requireGuest, authController.showRegister);
router.post('/register', requireGuest, authController.register);
router.post('/logout', requireLogin, authController.logout);

module.exports = router;
