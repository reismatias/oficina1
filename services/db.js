const Datastore = require('nedb-promises');
const path = require('path');
const { logger } = require('../utils/logger');

const DB_PATH = path.join(__dirname, '..', 'data', 'devices.db');

const db = Datastore.create({ filename: DB_PATH, autoload: true });

logger.info('Connected to NeDB database at ' + DB_PATH);

module.exports = db;
