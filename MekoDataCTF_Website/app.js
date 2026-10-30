require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const expressLayouts = require('express-ejs-layouts');

const db = require('./config/database');
const i18n = require('./middlewares/i18n');
const locals = require('./middlewares/locals');
const csrf = require('./middlewares/csrf');
const { renderBody, formatDateTime } = require('./helpers/format');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

if (!process.env.SESSION_SECRET) {
  console.warn('[!] SESSION_SECRET chưa được đặt trong .env — đang dùng khóa tạm thời.');
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/main');
if (isProd) app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'style-src': ["'self'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:'],
      },
    },
  })
);
app.use(express.static(path.join(__dirname, 'public'), { maxAge: isProd ? '7d' : 0 }));
app.use(express.json({limit:'20kb'}));
app.use(express.urlencoded({ extended: true, limit: '200kb' }));
app.use(cookieParser());
app.use(
  session({
    store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 15 * 60 * 1000 } }),
    name: 'mekodata.sid',
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 7 * 24 * 3600 * 1000 },
  })
);
app.use(i18n);
app.use(locals);
app.use(csrf);
app.use(expressLayouts);

app.locals.renderBody = renderBody;
app.locals.formatDateTime = formatDateTime;

app.use('/', require('./routes/scoreboard'));
app.use('/', require('./routes/index'));
app.use('/', require('./routes/auth'));
app.use('/team', require('./routes/team'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('error', { title: '404', message: req.t('errors.notFound') });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if(req.path === '/scoreboard/submit') return res.status(400).json({error:'Yêu cầu nộp flag không hợp lệ.'});
  console.error(err);
  res.status(500).render('error', { title: '500', message: req.t ? req.t('errors.server') : 'Server error' });
});

app.listen(PORT, () => {
  console.log(`MekoDataCTF đang chạy tại http://localhost:${PORT}`);
});
