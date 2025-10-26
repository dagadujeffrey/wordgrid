const test = require('node:test');
const assert = require('node:assert');

const { createGame, recordMove } = require('../src/core/game-service');
const { loadStore, saveStore } = require('../src/core/store');

function resetGames() {
  const store = loadStore();
  store.games = [];
  saveStore(store);
}

function createTestGame() {
  resetGames();
  return createGame({
    mode: 'local',
    host: { username: 'Alice' },
    players: [{ username: 'Bob' }]
  });
}

test('records moves and completes game flow', async () => {
  const game = createTestGame();
  const players = game.players;
  let updated = game;
  let currentIndex = 0;

  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const move = {
        playerId: players[currentIndex].id,
        row,
        col,
        letter: String.fromCharCode(65 + ((row * 4 + col) % 26))
      };
      const result = await recordMove(game.id, move);
      updated = result.game;
      currentIndex = updated.currentTurn;
    }
  }

  assert.strictEqual(updated.status, 'completed');
  assert.ok(updated.summary);
  const totalScore = Object.values(updated.summary.totals).reduce((sum, value) => sum + value, 0);
  assert.ok(totalScore >= 0);
});
