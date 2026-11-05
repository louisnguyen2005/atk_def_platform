const router = require('express').Router();
const path = require('path');
const { sessionTeam } = require('../middlewares/auth');

const API = process.env.CRYPTO_API_URL || 'http://127.0.0.1:8088';
const DASHBOARD = path.join(__dirname, '..', '..', 'crypto-lab', 'dashboard');
const sendError = (res, status, message) => res.status(status).json({ ok: false, error: message });

async function forward(req, pathName, { body, admin = false, token = '' } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['X-Team-Token'] = token;
  if (admin) headers.Authorization = `Bearer ${process.env.CRYPTO_ADMIN_TOKEN || ''}`;
  const response = await fetch(new URL(pathName, API), {
    method: body === undefined ? 'GET' : 'POST', headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error', signal: AbortSignal.timeout(8000),
  });
  return { status: response.status, data: await response.json() };
}

// Express treats a trailing slash as optional by default, so redirecting
// /crypto to /crypto/ here would loop. Serve both forms directly.
router.get(['/crypto', '/crypto/'], (req, res) => res.sendFile(path.join(DASHBOARD, 'index.html')));
// Three.js modules and optional .glb ship models; express.static refuses paths outside these folders.
router.use('/crypto/assets/vendor', require('express').static(path.join(DASHBOARD, 'vendor'), { maxAge: '1d', fallthrough: false }));
router.use('/crypto/assets/arena3d', require('express').static(path.join(DASHBOARD, 'arena3d'), { maxAge: 0, fallthrough: false }));
router.use('/crypto/assets/models', require('express').static(path.join(DASHBOARD, 'assets', 'models'), { maxAge: 0, fallthrough: false }));
router.get('/crypto/assets/:asset', (req, res) => {
  const asset = req.params.asset;
  if (['dashboard.css', 'dashboard.js', 'arena.js', 'arena3d.js'].includes(asset)) return res.sendFile(path.join(DASHBOARD, asset));
  if (['space-bg.webp', 'ship-saucer.png', 'ship-raptor.png', 'ship-manta.png', 'crown.png'].includes(asset)) {
    res.set('Cache-Control', 'public, max-age=86400');
    return res.sendFile(path.join(DASHBOARD, 'assets', asset));
  }
  return sendError(res, 404, 'not_found');
});

router.get('/crypto/api/session', (req, res) => {
  const team = sessionTeam(req);
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, csrfToken: res.locals.csrfToken, signedInAsAdmin: req.user?.role === 'admin',
    signedInAsTeam: !!team, signedTeamName: team?.team?.name || '' });
});

router.get('/crypto/api/state', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const result = await forward(req, '/api/state');
    res.status(result.status).json(result.data);
  } catch (_) { sendError(res, 503, 'scoreboard_unavailable'); }
});

router.post('/crypto/api/submit', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const flags = req.body?.flags;
  if (!Array.isArray(flags) || flags.length < 1 || flags.length > 50 || flags.some(flag => typeof flag !== 'string' || flag.length > 80)) {
    return sendError(res, 400, 'invalid_flags');
  }
  const signed = sessionTeam(req);
  const demoToken = process.env.CRYPTO_DEMO_MODE === '1' ? req.get('X-Team-Token') : '';
  const token = signed?.team?.token || demoToken;
  if (!token) return sendError(res, 401, 'sign_in_to_your_team_first');
  try {
    const result = await forward(req, '/api/submit', { body: { flags }, token });
    res.status(result.status).json(result.data);
  } catch (_) { sendError(res, 503, 'scoreboard_unavailable'); }
});

router.get('/crypto/api/admin/state', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.user?.role !== 'admin') return sendError(res, 401, 'organizer_login_required');
  if (!process.env.CRYPTO_ADMIN_TOKEN) return sendError(res, 503, 'organizer_key_not_configured');
  try {
    const result = await forward(req, '/api/admin/state', { admin: true });
    res.status(result.status).json(result.data);
  } catch (_) { sendError(res, 503, 'scoreboard_unavailable'); }
});

router.post('/crypto/api/admin/action', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.user?.role !== 'admin') return sendError(res, 401, 'organizer_login_required');
  if (!process.env.CRYPTO_ADMIN_TOKEN) return sendError(res, 503, 'organizer_key_not_configured');
  if (!['start', 'pause', 'retry', 'reset'].includes(req.body?.action)) return sendError(res, 400, 'invalid_action');
  try {
    const result = await forward(req, '/api/admin/action', { body: { action: req.body.action }, admin: true });
    res.status(result.status).json(result.data);
  } catch (_) { sendError(res, 503, 'scoreboard_unavailable'); }
});

module.exports = router;
