// app.js
const express = require('express');
const path = require('path');
const os = require('os');
const session = require('express-session');
const authRouter = require('./routes/auth');
const sessionTimeout = require('./middlewares/sessionTimeout');
const { logEvent, nowISO } = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3333;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const MAX_SESSION_AGE_MS = Number(process.env.SESSION_MAX_AGE_MS) || 1000 * 60 * 60 * 8;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// session
app.use(session({
  name: 'sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: MAX_SESSION_AGE_MS }
}));

// session activity middleware (aplica a todas rotas depois daqui)
app.use(sessionTimeout({
  maxAgeMs: MAX_SESSION_AGE_MS,
  inactivityMs: Number(process.env.SESSION_INACTIVITY_MS) || 1000 * 60 * 15
}));

// mount routers
app.use('/', authRouter);

// protected API example (keep your /dados and /api/dados here or separated later)
const fs = require('fs');
app.post('/dados', (req, res) => {
  const deviceId = req.body.device_id;
  if (!deviceId) return res.status(400).json({ message: 'device_id é obrigatório' });
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const filename = `${deviceId}.json`;
  fs.appendFile(path.join(dataDir, filename), JSON.stringify(req.body) + '\n', (err) => {
    if (err) return res.status(500).json({ message: 'Erro ao salvar' });
    res.json({ ok: true });
  });
});

app.get('/api/dados', (req, res) => {
  if (!req.session || !req.session.username) return res.status(401).json({ message: 'Unauthorized' });
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) return res.json({ devices: [] });
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
  const devices = files.map(f => {
    const content = fs.readFileSync(path.join(dataDir, f), 'utf8').trim();
    const parsed = content ? content.split('\n').map(l => { try { return JSON.parse(l); } catch { return null } }).filter(Boolean) : [];
    return { filename: f, entries: parsed };
  });
  res.json({ devices });
});

// friendly routes
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/dashboard', (req, res) => {
  if (!req.session || !req.session.username) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

const getLocalIp = () => {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const a of iface) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return '127.0.0.1';
};

app.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  logEvent('SERVER_START', { info: `Listening on http://${localIp}:${PORT}`});
  console.log(`Pages: http://${localIp}:${PORT}/login  http://${localIp}:${PORT}/dashboard`);
});