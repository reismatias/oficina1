const express = require('express');
const bcrypt = require('bcrypt');
const path = require('path');
const { getUser, readUsers } = require('../services/userService');
const { logEvent } = require('../utils/logger');
const { requireAuth } = require('./guard');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  if (!username || !password) return res.status(400).json({ message: 'username and password required' });

  const user = getUser(username);
  if (!user) {
    logEvent('LOGIN_FAILED', { username, ip, reason: 'no-such-user' });
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const ok = await bcrypt.compare(password, user.hash);
  if (!ok) {
    logEvent('LOGIN_FAILED', { username, ip, reason: 'bad-password' });
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  req.session.username = username;
  req.session.role = user.role || 'user';
  req.session.createdAt = Date.now();
  req.session.lastActivity = Date.now();

  if (req.session.cookie) {
    req.session.cookie.expires = new Date(Date.now() + (req.app.get('sessionMaxAge') || req.session.cookie.maxAge));
  }

  logEvent('LOGIN_SUCCESS', { username, ip });
  res.json({ message: 'ok' });
});

router.post('/logout', (req, res) => {
  const username = req.session && req.session.username;
  const ip = req.ip || req.connection.remoteAddress;
  req.session.destroy(err => {
    if (err) console.error('destroy session:', err);
    logEvent('LOGOUT', { username, ip });
    res.clearCookie('sid');
    res.json({ message: 'logged out' });
  });
});

router.get('/auth/status', requireAuth, (req, res) => {
  return res.json({
    authenticated: true,
    username: req.session.username,
    createdAt: req.session.createdAt,
    lastActivity: req.session.lastActivity
  });
});

module.exports = router;