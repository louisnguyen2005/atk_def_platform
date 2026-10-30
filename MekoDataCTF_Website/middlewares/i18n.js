const path = require('path');

const SUPPORTED = ['vi', 'en'];
const dictionaries = {};
SUPPORTED.forEach((l) => (dictionaries[l] = require(path.join(__dirname, '..', 'locales', `${l}.json`))));

function lookup(dict, key) {
  return key.split('.').reduce((obj, k) => (obj && obj[k] !== undefined ? obj[k] : undefined), dict);
}

// Chọn ngôn ngữ qua ?lang=vi|en (lưu cookie), mặc định tiếng Việt.
// Cung cấp res.locals.t('key', {param}) cho view và req.t cho controller.
module.exports = function i18n(req, res, next) {
  let lang = req.cookies.lang;
  if (req.query.lang && SUPPORTED.includes(req.query.lang)) {
    lang = req.query.lang;
    res.cookie('lang', lang, { maxAge: 365 * 24 * 3600 * 1000, sameSite: 'lax' });
  }
  if (!SUPPORTED.includes(lang)) lang = 'vi';

  const t = (key, params = {}) => {
    let str = lookup(dictionaries[lang], key) ?? lookup(dictionaries.vi, key) ?? key;
    Object.entries(params).forEach(([k, v]) => (str = str.replaceAll(`{${k}}`, v)));
    return str;
  };

  req.lang = lang;
  req.t = t;
  res.locals.lang = lang;
  res.locals.t = t;
  next();
};
