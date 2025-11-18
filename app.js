// app.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const session = require('express-session');
const { createClient } = require('redis');

const authRouter = require('./routes/auth');
const sessionTimeout = require('./middlewares/sessionTimeout');
const { logEvent, logger } = require('./utils/logger'); // winston-based logger

const app = express();
const PORT = process.env.PORT || 3333;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const MAX_SESSION_AGE_MS = Number(process.env.SESSION_MAX_AGE_MS) || 1000 * 60 * 60 * 8;
const INACTIVITY_MS = Number(process.env.SESSION_INACTIVITY_MS) || 1000 * 60 * 15;
const MAX_ENTRIES_PER_DEVICE = Number(process.env.MAX_ENTRIES_PER_DEVICE) || 500;

// Express parsers (lightweight, before session init)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// small helper to get local IP for console output
const getLocalIp = () => {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces || {})) {
    for (const a of iface) if (a && a.family === 'IPv4' && !a.internal) return a.address;
  }
  return '127.0.0.1';
};

// Build redis URL from env
function getRedisUrlFromEnv() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = process.env.REDIS_PORT || '6379';
  const pwd = process.env.REDIS_PASSWORD || '';
  const db = process.env.REDIS_DB || '0';
  if (pwd) return `redis://:${pwd}@${host}:${port}/${db}`;
  return `redis://${host}:${port}/${db}`;
}

// Create session middleware, trying Redis (compatible with connect-redis v6/v7) and falling back to memory
async function setupSessionMiddleware() {
  const redisUrl = getRedisUrlFromEnv();
  let usingRedis = false;
  let sessionMiddleware;

  try {
    const redisClient = createClient({ url: redisUrl });
    redisClient.on('error', (err) => logger.error('Redis client error: ' + (err && err.message)));
    await redisClient.connect();
    logger.info('Connected to Redis: ' + redisUrl);

    // dynamic require to support multiple connect-redis versions
    const cr = require('connect-redis');
    let RedisStoreClass;

    if (typeof cr === 'function' && cr.length === 1) {
      // connect-redis v6: module exports a function that takes session and returns a Store
      RedisStoreClass = cr(session);
    } else if (cr && cr.default) {
      // connect-redis v7+: default export is the class/constructor
      RedisStoreClass = cr.default;
    } else if (cr && typeof cr === 'object' && cr.RedisStore) {
      // legacy shape
      RedisStoreClass = cr.RedisStore;
    } else {
      // last resort: use what was required
      RedisStoreClass = cr;
    }

    // instantiate store
    const redisStore = new RedisStoreClass({ client: redisClient, prefix: 'sess:' });

    sessionMiddleware = session({
      store: redisStore,
      name: 'sid',
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        // secure: true, // enable in production with HTTPS
        maxAge: MAX_SESSION_AGE_MS
      }
    });

    usingRedis = true;
    return { sessionMiddleware, usingRedis };
  } catch (err) {
    logger.warn('Redis not available or failed to init store, falling back to in-memory session store. Error: ' + (err && err.message));
    sessionMiddleware = session({
      name: 'sid',
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        maxAge: MAX_SESSION_AGE_MS
      }
    });
    usingRedis = false;
    return { sessionMiddleware, usingRedis };
  }
}

// Helper used by single-file endpoint (normalize timestamps)
function normalizeTimestampValue(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') {
    // if in seconds (10 digits) convert to ms
    return (v < 1e11) ? v * 1000 : v;
  }
  const parsed = Date.parse(String(v));
  if (!isNaN(parsed)) return parsed;
  return null;
}

// Helper to read one file and return cleaned entries
function readFileEntries(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8') || '';
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const parsed = [];
  for (const l of lines) {
    try { parsed.push(JSON.parse(l)); } catch (e) { /* ignore invalid lines */ }
  }
  if (parsed.length === 0) return [];
  // attach inferred _ts for sorting
  const candTsKeys = ['timestamp', 'time', 'ts', 'date', 'createdAt'];
  const enriched = parsed.map(p => {
    let _ts = null;
    for (const k of candTsKeys) {
      if (p[k] !== undefined && p[k] !== null) {
        const t = normalizeTimestampValue(p[k]);
        if (t) { _ts = t; break; }
      }
    }
    if (!_ts) {
      // fallback: numeric fields that look like epoch
      for (const k of Object.keys(p)) {
        const v = p[k];
        if (typeof v === 'number' && v > 1e9) { _ts = (v < 1e12) ? v * 1000 : v; break; }
      }
    }
    return Object.assign({}, p, { _ts });
  });

  // sort with _ts if present, else keep file order
  enriched.sort((a, b) => {
    if (a._ts && b._ts) return a._ts - b._ts;
    if (a._ts) return -1;
    if (b._ts) return 1;
    return 0;
  });

  // keep last MAX_ENTRIES_PER_DEVICE
  const sliced = enriched.slice(-MAX_ENTRIES_PER_DEVICE);

  // remove internal _ts
  return sliced.map(({ _ts, ...rest }) => rest);
}

// Start server after setting up session middleware
async function startServer() {
  const { sessionMiddleware, usingRedis } = await setupSessionMiddleware();

  // Apply session middleware
  app.use((req, res, next) => sessionMiddleware(req, res, next));

  // Apply session timeout/inactivity middleware (must come after session middleware)
  app.use(sessionTimeout({
    maxAgeMs: MAX_SESSION_AGE_MS,
    inactivityMs: INACTIVITY_MS
  }));

  // Mount auth routes BEFORE static so POST /logout works and /login route override works
  app.use('/', authRouter);

  // Serve static assets (css/js/images)
  app.use(express.static(path.join(__dirname, 'public')));

  // ----- API: list devices with limited entries -----
  app.get('/api/dados', (req, res) => {
    if (!req.session || !req.session.username) return res.status(401).json({ message: 'Unauthorized' });
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) return res.json({ devices: [] });

    try {
      const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
      const devices = [];

      for (const file of files) {
        const filePath = path.join(dataDir, file);
        const entries = readFileEntries(filePath); // already limited by MAX_ENTRIES_PER_DEVICE
        devices.push({ filename: path.basename(file), entries });
      }

      return res.json({ devices });
    } catch (err) {
      logger.error('Error reading data dir: ' + (err && err.message));
      return res.status(500).json({ message: 'Erro lendo dados' });
    }
  });

  app.get('/api/dados/:filename', (req, res) => {
    if (!req.session || !req.session.username) return res.status(401).json({ message: 'Unauthorized' });

    const requested = req.params.filename;
    if (typeof requested !== 'string' || requested.includes('..') || requested.includes('/')) {
      return res.status(400).json({ message: 'Invalid filename' });
    }

    const dataDir = path.join(__dirname, 'data');
    let filePath = path.join(dataDir, requested);
    if (!fs.existsSync(filePath)) {
      // try with .json appended
      if (fs.existsSync(filePath + '.json')) filePath = filePath + '.json';
      else return res.status(404).json({ message: 'File not found' });
    }

    try {
      const entries = readFileEntries(filePath);
      return res.json({ filename: path.basename(filePath), entries });
    } catch (err) {
      logger.error('Error reading file ' + filePath + ' : ' + (err && err.message));
      return res.status(500).json({ message: 'Erro lendo arquivo' });
    }
  });

  // ----- Device ingestion endpoint (ESP32) -----
  app.post('/dados', (req, res) => {
    const deviceId = req.body.device_id;
    if (!deviceId) return res.status(400).json({ message: 'device_id é obrigatório' });
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const filename = `${deviceId}.json`;
    const dataToWrite = JSON.stringify(req.body) + '\n';
    fs.appendFile(path.join(dataDir, filename), dataToWrite, (err) => {
      if (err) {
        logger.error('Erro ao salvar os dados: ' + (err && err.message));
        return res.status(500).json({ message: 'Erro ao salvar os dados' });
      }
      return res.status(200).json({ message: `Dados recebidos e salvos no arquivo ${filename}` });
    });
  });

  // Friendly routes (login / dashboard)
  // GET /login should redirect to /dashboard when already authenticated (authRouter handles POST /login)
  app.get('/login', (req, res) => {
    if (req.session && req.session.username) return res.redirect('/dashboard');
    return res.sendFile(path.join(__dirname, 'public', 'login.html'));
  });

  // Also explicitly guard /login.html
  app.get('/login.html', (req, res) => {
    if (req.session && req.session.username) return res.redirect('/dashboard');
    return res.sendFile(path.join(__dirname, 'public', 'login.html'));
  });

  app.get('/', (req, res) => res.redirect('/login'));
  app.get('/dashboard', (req, res) => {
    if (!req.session || !req.session.username) return res.redirect('/login');
    return res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  });
  app.get('/dashboard.html', (req, res) => {
    if (!req.session || !req.session.username) return res.redirect('/login');
    return res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  });

  // Start listening
  app.listen(PORT, '0.0.0.0', () => {
    const localIp = getLocalIp();
    logEvent('SERVER_START', { info: `Listening on http://${localIp}:${PORT} | sessions:${usingRedis ? 'redis' : 'memory'}` });
    console.log('========================================');
    console.log('   Servidor rodando com sucesso!');
    console.log('----------------------------------------');
    console.log(`   IP local:    ${localIp}`);
    console.log(`   Porta:       ${PORT}`);
    console.log(`   Session store: ${usingRedis ? 'redis' : 'memory (fallback)'}`);
    console.log(`   Endpoint POST (esp32): http://${localIp}:${PORT}/dados`);
    console.log(`   Endpoint GET (dashboard API): http://${localIp}:${PORT}/api/dados`);
    console.log('----------------------------------------');
    console.log(`   Pages:`);
    console.log(`     Login:     http://${localIp}:${PORT}/login`);
    console.log(`     Dashboard: http://${localIp}:${PORT}/dashboard`);
    console.log('----------------------------------------');
    console.log(`   Session max age (ms): ${MAX_SESSION_AGE_MS}`);
    console.log(`   Session inactivity timeout (ms): ${INACTIVITY_MS}`);
    console.log(`   Max entries per device: ${MAX_ENTRIES_PER_DEVICE}`);
    console.log('========================================');
  });
}

// Kick off
startServer().catch(err => {
  logger.error('Failed to start server: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});