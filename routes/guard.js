const express = require('express');
const path = require('path');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const router = express.Router();

// GET /
// Proteje as rotas para que não sejam acessadas se não tiver feito o
// login, e caso já esteja logado não der pra voltar para a página de login.

// func: Verifica se está authenticado
function requireAuth(req, res, next) {
  if (!req.session || !req.session.username) {

    // PARA APIs
    if (req.path.startsWith('/api') || req.originalUrl.startsWith('/api') ||
      req.path.startsWith('/auth') || req.originalUrl.startsWith('/auth')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // PARA PÁGINAS
    return res.redirect('/login');
  }
  next();
}

// func: Evita acesso tela de login caso esteja logado
function requireGuest(req, res, next) {
  if (req.session && req.session.username) {
    return res.redirect('/dashboard');
  }
  next();
}

// -------------------------------
// Rotas protegidas:
// -------------------------------

// /
router.get('/', (req, res) => res.redirect('/login'));

// login
router.get('/login', requireGuest, (req, res) => {
  return res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

// /login.html
router.get('/login.html', requireGuest, (req, res) => {
  return res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

// dashboard
router.get('/dashboard', requireAuth, (req, res) => {
  return res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
});

// /dashboard.html
router.get('/dashboard.html', requireAuth, (req, res) => {
  return res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
});

// devices
router.get('/devices', requireAuth, (req, res) => {
  return res.sendFile(path.join(PUBLIC_DIR, 'devices.html'));
});

// /devices.html
router.get('/devices.html', requireAuth, (req, res) => {
  return res.sendFile(path.join(PUBLIC_DIR, 'devices.html'));
});

// /api/user

module.exports = {
  router,
  requireAuth,
  requireGuest
};