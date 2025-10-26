const test = require('node:test');
const assert = require('node:assert');

const { createEmptyBoard, applyMove, scoreBoard } = require('../src/core/game');
const { chooseMove } = require('../src/core/ai');

function withSeededRandom(value, callback) {
  const original = Math.random;
  Math.random = () => value;
  try {
    return callback();
  } finally {
    Math.random = original;
  }
}

test('hard AI prefers completing the highest scoring word', async () => {
  const board = createEmptyBoard();
  applyMove(board, { row: 0, col: 0, letter: 'C', playerId: 'human' });
  applyMove(board, { row: 0, col: 1, letter: 'A', playerId: 'human' });

  const move = await withSeededRandom(0, () =>
    chooseMove(board, 'ai', { difficulty: 'hard', opponentIds: ['human'] })
  );

  assert.deepStrictEqual({ row: move.row, col: move.col }, { row: 0, col: 2 });
  const { scoreBoard } = require('../src/core/game');
  const clone = createEmptyBoard();
  applyMove(clone, { row: 0, col: 0, letter: 'C', playerId: 'human' });
  applyMove(clone, { row: 0, col: 1, letter: 'A', playerId: 'human' });
  applyMove(clone, { row: move.row, col: move.col, letter: move.letter, playerId: 'ai' });
  const { totals } = await scoreBoard(clone);
  assert.ok((totals['ai'] || 0) >= 3, 'AI creates an immediate scoring opportunity');
});

test('easy AI returns a plausible random move', async () => {
  const board = createEmptyBoard();
  const move = await withSeededRandom(0.1, () => chooseMove(board, 'ai', { difficulty: 'easy' }));
  assert.ok(move.letter.length === 1 && move.letter >= 'A' && move.letter <= 'Z');
  assert.ok(move.row >= 0 && move.row < 4);
  assert.ok(move.col >= 0 && move.col < 4);
});
