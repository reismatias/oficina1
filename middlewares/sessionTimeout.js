// middlewares/sessionTimeout.js
const { logEvent } = require('../utils/logger');

module.exports = function sessionTimeout({ maxAgeMs = 1000*60*60*8, inactivityMs = 1000*60*15 } = {}) {
  return (req, res, next) => {
    if (!req.session) return next();

    if (!req.session.createdAt) req.session.createdAt = Date.now();
    const age = Date.now() - req.session.createdAt;
    const last = req.session.lastActivity || req.session.createdAt;
    const idle = Date.now() - last;
    const ip = req.ip || req.connection.remoteAddress;
    const username = req.session.username;

    if (age > maxAgeMs) {
      req.session.destroy(err => {
        if (err) console.error('err destroying session maxAge', err);
        logEvent('SESSION_EXPIRED_MAX_AGE', { username, ip, reason: `age=${age}ms`});
        if (req.headers.accept && req.headers.accept.includes('application/json')) return res.status(401).json({ message: 'Session expired (max age)'});
        return res.redirect('/login');
      });
      return;
    }

    if (idle > inactivityMs) {
      req.session.destroy(err => {
        if (err) console.error('err destroying session inactivity', err);
        logEvent('SESSION_EXPIRED_INACTIVITY', { username, ip, reason: `idle=${idle}ms`});
        if (req.headers.accept && req.headers.accept.includes('application/json')) return res.status(401).json({ message: 'Session expired (inactivity)'});
        return res.redirect('/login');
      });
      return;
    }

    // touch
    req.session.lastActivity = Date.now();
    if (req.session.cookie) {
      req.session.cookie.expires = new Date(Date.now() + maxAgeMs);
      req.session.cookie.maxAge = maxAgeMs;
    }

    next();
  };
};