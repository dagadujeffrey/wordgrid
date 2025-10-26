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

function findFirstEmptyCell(board) {
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      if (!board[row][col]) {
        return { row, col };
      }
    }
  }
  throw new Error('Board is full');
}

test('records moves and completes game flow', async () => {
  const game = createTestGame();
  let updated = game;
  let letterIndex = 0;
  const sequence = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  while (updated.status !== 'completed') {
    const player = updated.players[updated.currentTurn];
    const board = updated.boards[player.id];
    const cell = findFirstEmptyCell(board);
    const isSuggestion = updated.expectedAction === 'suggest';
    const letter = isSuggestion
      ? sequence[letterIndex % sequence.length]
      : updated.currentLetter;
    if (isSuggestion) {
      letterIndex += 1;
    }
    const result = await recordMove(game.id, {
      playerId: player.id,
      row: cell.row,
      col: cell.col,
      letter
    });
    updated = result.game;
  }

  assert.strictEqual(updated.status, 'completed');
  assert.ok(updated.summary);
  const totalScore = Object.values(updated.summary.totals).reduce((sum, value) => sum + value, 0);
  assert.ok(totalScore >= 0);
});

test('enforces shared letter placements', async () => {
  const game = createTestGame();
  const [alice, bob] = game.players;

  let result = await recordMove(game.id, {
    playerId: alice.id,
    row: 0,
    col: 0,
    letter: 'A'
  });

  assert.strictEqual(result.game.expectedAction, 'place');
  await assert.rejects(
    () =>
      recordMove(game.id, {
        playerId: bob.id,
        row: 0,
        col: 0,
        letter: 'B'
      }),
    /shared letter/i
  );

  result = await recordMove(game.id, {
    playerId: bob.id,
    row: 0,
    col: 0,
    letter: 'A'
  });

  assert.strictEqual(result.game.expectedAction, 'suggest');
  assert.strictEqual(result.game.currentLetter, null);
});
