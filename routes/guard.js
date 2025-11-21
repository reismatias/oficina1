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
  return res.render('login', { layout: false });
});

// /login.html
router.get('/login.html', requireGuest, (req, res) => {
  return res.redirect('/login');
});

// dashboard
router.get('/dashboard', requireAuth, (req, res) => {
  return res.render('dashboard', {
    page: 'dashboard',
    title: 'Dashboard',
    contentStyle: 'flex-direction: column; gap: 18px;',
    extraHead: `
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3.0.1/dist/chartjs-plugin-annotation.min.js"></script>
    `,
    extraScripts: '<script src="/js/dashboard.js"></script>'
  });
});

// /dashboard.html
router.get('/dashboard.html', requireAuth, (req, res) => {
  return res.redirect('/dashboard');
});

// devices
router.get('/devices', requireAuth, (req, res) => {
  return res.render('devices', {
    page: 'devices',
    title: 'Gerenciar Devices',
    contentStyle: 'flex-direction: row; gap: 18px;',
    extraHead: '',
    extraScripts: '<script src="/js/devices.js"></script>'
  });
});

// /devices.html
router.get('/devices.html', requireAuth, (req, res) => {
  return res.redirect('/devices');
});

module.exports = {
  router,
  requireAuth,
  requireGuest
};