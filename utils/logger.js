const path = require('path');
const fs = require('fs');
const { createLogger, format, transports } = require('winston');
require('winston-daily-rotate-file');

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '..', 'logs');
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const dailyRotateTransport = new transports.DailyRotateFile({
  filename: path.join(LOG_DIR, 'app-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  level: LOG_LEVEL
});

const logger = createLogger({
  level: LOG_LEVEL,
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.printf(info => {
      const base = `[${info.timestamp}] ${info.level.toUpperCase()} : ${info.message}`;
      if (info.stack) return `${base}\n${info.stack}`;
      return base;
    })
  ),
  transports: [
    dailyRotateTransport,
    new transports.Console({ format: format.combine(format.colorize(), format.simple()) })
  ],
  exitOnError: false,
});

function nowISO() { return (new Date()).toISOString(); }

function logEvent(event, info = {}) {
  const parts = [`[${nowISO()}]`, event];
  if (info.username) parts.push(`user=${info.username}`);
  if (info.ip) parts.push(`ip=${info.ip}`);
  if (info.reason) parts.push(`reason=${info.reason}`);
  if (info.info) parts.push(info.info);
  const message = parts.join(' | ');
  logger.info(message);
}

module.exports = {
  logger,
  logEvent,
  nowISO
};
