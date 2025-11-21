// ========================================
// Database Service
// Camada de serviço para gerenciar banco de dados.
// ========================================
const Datastore = require('nedb-promises');
const path = require('path');
const { logger } = require('../utils/logger');

const DB_PATH = path.join(__dirname, '..', 'data', 'devices.db');

// Cria a instância do banco de dados
const db = Datastore.create({ filename: DB_PATH, autoload: true });

logger.info('Connected to NeDB database at ' + DB_PATH);

module.exports = db;
