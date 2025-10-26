const { hashPassword, verifyPassword, createToken, verifyToken } = require('./auth');
const { loadStore, saveStore, createId, findUserByUsername, findUserByEmail } = require('./store');

function sanitizeUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

function registerUser({ username, email, password }) {
  const store = loadStore();
  if (findUserByUsername(store, username)) {
    throw new Error('Username already exists');
  }
  if (findUserByEmail(store, email)) {
    throw new Error('Email already exists');
  }
  const user = {
    id: createId('user'),
    username,
    email,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
    games_played: 0,
    total_points: 0,
    average_points: 0
  };
  store.users.push(user);
  saveStore(store);
  const token = createToken({ sub: user.id, username: user.username });
  return { user: sanitizeUser(user), token };
}

function loginUser({ usernameOrEmail, password }) {
  const store = loadStore();
  const user =
    findUserByUsername(store, usernameOrEmail) ||
    findUserByEmail(store, usernameOrEmail);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new Error('Invalid credentials');
  }
  const token = createToken({ sub: user.id, username: user.username });
  return { user: sanitizeUser(user), token };
}

function authenticate(token) {
  const payload = verifyToken(token);
  if (!payload) {
    return null;
  }
  const store = loadStore();
  const user = store.users.find((u) => u.id === payload.sub);
  if (!user) {
    return null;
  }
  return sanitizeUser(user);
}

function getLeaderboard() {
  const store = loadStore();
  return store.leaderboard
    .slice()
    .sort((a, b) => b.average_points - a.average_points)
    .map((entry) => ({
      userId: entry.userId,
      username: entry.username,
      games_played: entry.games_played,
      total_points: entry.total_points,
      average_points: Number(entry.average_points.toFixed(2))
    }));
}

module.exports = {
  registerUser,
  loginUser,
  authenticate,
  getLeaderboard
};
