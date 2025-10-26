const { loadStore, saveStore, createId, upsertLeaderboard } = require('./store');
const { createEmptyBoard, applyMove, scoreBoard, isBoardFull } = require('./game');

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

  const boards = {};
  gamePlayers.forEach((player) => {
    boards[player.id] = createEmptyBoard();
  });

  const game = {
    id: createId('game'),
    mode,
    status: mode === 'online' ? 'waiting' : 'active',
    boards,
    moves: [],
    players: gamePlayers,
    currentTurn: 0,
    expectedAction: 'suggest',
    currentLetter: null,
    pendingPlacements: {},
    currentSuggestionIndex: null,
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
  const entry = createPlayerEntry(player);
  game.players.push(entry);
  game.boards[entry.id] = createEmptyBoard();
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
  const board = game.boards[move.playerId];
  if (!board) {
    throw new Error('Player board unavailable');
  }
  const timestamp = new Date().toISOString();

  if (game.expectedAction === 'place') {
    if (!game.currentLetter) {
      throw new Error('No shared letter to place');
    }
    const expectedLetter = game.currentLetter.toUpperCase();
    if (move.letter && move.letter.toUpperCase() !== expectedLetter) {
      throw new Error('Letter must match the shared letter choice');
    }
    const placement = { ...move, letter: expectedLetter, playerId: move.playerId };
    applyMove(board, placement);
    game.moves.push({ ...placement, timestamp });
    game.pendingPlacements[move.playerId] = true;

    const allPlaced = game.players.every((player) => game.pendingPlacements[player.id]);
    if (allPlaced) {
      game.expectedAction = 'suggest';
      game.currentLetter = null;
      game.pendingPlacements = {};
      const suggestionIndex =
        typeof game.currentSuggestionIndex === 'number' ? game.currentSuggestionIndex : playerIndex;
      const nextIndex = (suggestionIndex + 1) % game.players.length;
      game.currentTurn = nextIndex;
      game.currentSuggestionIndex = null;
    } else {
      let nextIndex = (game.currentTurn + 1) % game.players.length;
      while (game.pendingPlacements[game.players[nextIndex].id]) {
        nextIndex = (nextIndex + 1) % game.players.length;
      }
      game.currentTurn = nextIndex;
    }
  } else {
    if (!move.letter || !/^[a-z]$/i.test(move.letter)) {
      throw new Error('A letter choice is required');
    }
    const chosenLetter = move.letter.toUpperCase();
    const placement = { ...move, letter: chosenLetter, playerId: move.playerId };
    applyMove(board, placement);
    game.moves.push({ ...placement, timestamp });
    game.expectedAction = 'place';
    game.currentLetter = chosenLetter;
    game.pendingPlacements = { [move.playerId]: true };
    game.currentSuggestionIndex = playerIndex;

    const allPlaced = game.players.every((player) => game.pendingPlacements[player.id]);
    if (allPlaced) {
      game.expectedAction = 'suggest';
      game.currentLetter = null;
      game.pendingPlacements = {};
      game.currentTurn = (playerIndex + 1) % game.players.length;
      game.currentSuggestionIndex = null;
    } else {
      let nextIndex = (game.currentTurn + 1) % game.players.length;
      while (game.pendingPlacements[game.players[nextIndex].id]) {
        nextIndex = (nextIndex + 1) % game.players.length;
      }
      game.currentTurn = nextIndex;
    }
  }

  game.updatedAt = new Date().toISOString();

  let completed = false;
  const allBoardsFilled = game.players.every((player) => isBoardFull(game.boards[player.id]));
  if (allBoardsFilled) {
    const totals = {};
    const lines = [];
    for (const player of game.players) {
      const result = await scoreBoard(game.boards[player.id]);
      totals[player.id] = (result.totals[player.id] || 0);
      result.lines.forEach((line) => {
        lines.push({ ...line, playerId: player.id });
      });
    }
    const scoring = { totals, lines };
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
