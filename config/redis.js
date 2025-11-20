const session = require('express-session');
const { createClient } = require('redis');
const { logger } = require('../utils/logger');

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const MAX_SESSION_AGE_MS = Number(process.env.SESSION_MAX_AGE_MS) || 1000 * 60 * 60 * 8;

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
    const redisClient = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 2000,
        reconnectStrategy: false
      }
    });
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

module.exports = {
  setupSessionMiddleware,
  MAX_SESSION_AGE_MS
};
