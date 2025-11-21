// ========================================
// Server Configuration
// Entry point da aplicação. Configura Express, middlewares e rotas.
// ========================================
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========================================
// Helper Functions
// ========================================
const getLocalIp = () => {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces || {})) {
    for (const a of iface) if (a && a.family === 'IPv4' && !a.internal) return a.address;
  }
  return '127.0.0.1';
};

// ========================================
// Server Initialization
// Configura sessões (Redis ou memória) e inicia o servidor.
// ========================================
async function startServer() {
  const { sessionMiddleware, usingRedis } = await setupSessionMiddleware();

  app.use((req, res, next) => sessionMiddleware(req, res, next));

  app.use(sessionTimeout({
    maxAgeMs: MAX_SESSION_AGE_MS,
    inactivityMs: INACTIVITY_MS
  }));

  // Rotas de autenticação (deve vir antes dos assets estáticos)
  app.use('/', authRouter);

  // Assets estáticos (CSS, JS, imagens)
  app.use(express.static(path.join(__dirname, 'public')));

  // Rotas da API
  app.use(apiRouter);

  // Rotas protegidas (dashboard, devices, etc)
  app.use('/', guardRouter);

  // Inicia o servidor
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

// ========================================
// Start Application
// ========================================
startServer().catch(err => {
  logger.error('Failed to start server: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});