// ========================================
// Create User
// Script para criar um novo usuário.
// ========================================
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const USERS_FILE = path.join(__dirname, 'users.json');

// Cria um novo usuário
async function createUser(username, password, role = 'admin') {
  const hash = await bcrypt.hash(password, 10);
  let users = {};
  if (fs.existsSync(USERS_FILE)) {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '{}');
  }
  users[username] = { hash, role };
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  console.log(`Created user ${username}`);
}

// Pega os argumentos do processo
const [, , username, password] = process.argv;
if (!username || !password) {
  console.log('Usage: node create-user.js <username> <password>');
  process.exit(1);
}
createUser(username, password).catch(console.error);