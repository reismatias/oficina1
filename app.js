// app.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const os = require('os');

const authRouter = require('./routes/auth');
const { router: guardRouter } = require('./routes/guard');
const apiRouter = require('./routes/api');
const sessionTimeout = require('./middlewares/sessionTimeout');
const { logEvent, logger } = require('./utils/logger');
const { setupSessionMiddleware, MAX_SESSION_AGE_MS } = require('./config/redis');

const app = express();
const PORT = process.env.PORT || 3333;
const INACTIVITY_MS = Number(process.env.SESSION_INACTIVITY_MS) || 1000 * 60 * 15;

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

  // Mount API routes
  app.use(apiRouter);

  // Rota de Login (redundant mount removed if not strictly necessary, but keeping consistent with original if it was intended for specific matching order. Original had it twice. I will keep it once at the top as it was, and maybe the second one was unnecessary. The first one is mounted at '/', so it handles /login. The second one in original was also app.use(authRouter) which defaults to /. I will stick to one mount at the top.)
  // Actually, looking at original:
  // Line 181: app.use('/', authRouter);
  // Line 252: app.use(authRouter);
  // I'll assume the first one is sufficient.

  // Rotas protegida
  app.use('/', guardRouter);

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
    console.log('========================================');
  });
}

// Kick off
startServer().catch(err => {
  logger.error('Failed to start server: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});