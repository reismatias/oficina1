// services/userService.js
const fs = require('fs');
const path = require('path');
const USERS_FILE = path.join(__dirname, '..', 'users.json');

function readUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) return {};
    return JSON.parse(fs.readFileSync(USERS_FILE,'utf8') || '{}');
  } catch (e) {
    console.error('readUsers error', e);
    return {};
  }
}
function getUser(username) {
  const users = readUsers();
  return users[username];
}
module.exports = { readUsers, getUser };
