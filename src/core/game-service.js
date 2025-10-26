const { loadStore, saveStore, createId, upsertLeaderboard } = require('./store');
const { createEmptyBoard, applyMove, scoreBoard, isBoardFull, cloneBoard } = require('./game');

function sanitizeGame(game) {
  return JSON.parse(JSON.stringify(game));
}

function createPlayerEntry({ userId, username, type = 'human', difficulty = 'medium' }) {
  return {
    id: userId || createId('player'),
    userId: userId || null,
    username,
    type,
    difficulty
  };
}

function createGame({ mode, host, players = [], aiDifficulty = 'medium' }) {
  const store = loadStore();
  const hostEntry = createPlayerEntry({ userId: host.userId, username: host.username, type: host.type || 'human' });
  const gamePlayers = [hostEntry];

  if (mode === 'single') {
    const aiPlayer = createPlayerEntry({ username: `AI (${aiDifficulty})`, type: 'ai', difficulty: aiDifficulty });
    gamePlayers.push(aiPlayer);
  } else if (players.length) {
    players.forEach((p) => {
      gamePlayers.push(createPlayerEntry(p));
    });
  }

  const game = {
    id: createId('game'),
    mode,
    status: mode === 'online' ? 'waiting' : 'active',
    board: createEmptyBoard(),
    moves: [],
    players: gamePlayers,
    currentTurn: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    summary: null
  };
  store.games.push(game);
  saveStore(store);
  return sanitizeGame(game);
}

function findGame(gameId) {
  const store = loadStore();
  const game = store.games.find((g) => g.id === gameId);
  if (!game) {
    throw new Error('Game not found');
  }
  return { game, store };
}

function joinGame(gameId, player) {
  const { game, store } = findGame(gameId);
  if (game.status !== 'waiting') {
    throw new Error('Game is not joinable');
  }
  game.players.push(createPlayerEntry(player));
  if (game.players.length >= 2) {
    game.status = 'active';
  }
  game.updatedAt = new Date().toISOString();
  saveStore(store);
  return sanitizeGame(game);
}

async function recordMove(gameId, move) {
  const { game, store } = findGame(gameId);
  if (game.status !== 'active') {
    throw new Error('Game is not active');
  }
  const playerIndex = game.players.findIndex((p) => p.id === move.playerId);
  if (playerIndex === -1) {
    throw new Error('Player not part of this game');
  }
  if (playerIndex !== game.currentTurn) {
    throw new Error('Not this player\'s turn');
  }
  applyMove(game.board, move);
  game.moves.push({ ...move, timestamp: new Date().toISOString() });
  game.currentTurn = (game.currentTurn + 1) % game.players.length;
  game.updatedAt = new Date().toISOString();

  let completed = false;
  if (isBoardFull(game.board)) {
    const scoring = await scoreBoard(game.board);
    game.summary = scoring;
    game.status = 'completed';
    completed = true;

    Object.entries(scoring.totals).forEach(([playerId, total]) => {
      const player = game.players.find((p) => p.id === playerId);
      if (player && player.userId) {
        const user = store.users.find((u) => u.id === player.userId);
        if (user) {
          user.games_played = (user.games_played || 0) + 1;
          user.total_points = (user.total_points || 0) + total;
          user.average_points = user.total_points / user.games_played;
          upsertLeaderboard(store, user.id, {
            username: user.username,
            games_played: user.games_played,
            total_points: user.total_points,
            average_points: user.average_points
          });
        }
      }
    });
  }

  saveStore(store);
  return { game: sanitizeGame(game), completed };
}

function listPublicGames() {
  const store = loadStore();
  return store.games
    .filter((game) => game.mode === 'online' && game.status !== 'completed')
    .map((game) => sanitizeGame(game));
}

module.exports = {
  createGame,
  joinGame,
  recordMove,
  listPublicGames,
  findGame
};
