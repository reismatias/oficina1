// utils/logger.js
function nowISO() { return (new Date()).toISOString(); }
function logEvent(event, info = {}) {
  const parts = [`[${nowISO()}]`, event];
  if (info.username) parts.push(`user=${info.username}`);
  if (info.ip) parts.push(`ip=${info.ip}`);
  if (info.reason) parts.push(`reason=${info.reason}`);
  if (info.info) parts.push(info.info);
  console.log(parts.join(' | '));
}
module.exports = { logEvent, nowISO };
