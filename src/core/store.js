const path = require('path');
const crypto = require('crypto');
const { readJson, writeJson, ensureDir } = require('../utils/file');

const DATA_PATH = path.join(__dirname, '..', 'data', 'store.json');
ensureDir(DATA_PATH);

function loadStore() {
  return readJson(DATA_PATH, { users: [], sessions: [], games: [], leaderboard: [] });
}

function saveStore(store) {
  writeJson(DATA_PATH, store);
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function findUserByUsername(store, username) {
  return store.users.find((user) => user.username.toLowerCase() === username.toLowerCase());
}

function findUserByEmail(store, email) {
  return store.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
}

function upsertLeaderboard(store, userId, stats) {
  const existing = store.leaderboard.find((entry) => entry.userId === userId);
  if (existing) {
    Object.assign(existing, stats);
  } else {
    store.leaderboard.push({ userId, ...stats });
  }
}

module.exports = {
  DATA_PATH,
  loadStore,
  saveStore,
  createId,
  findUserByUsername,
  findUserByEmail,
  upsertLeaderboard
};
