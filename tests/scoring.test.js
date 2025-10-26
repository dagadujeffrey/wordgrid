const test = require('node:test');
const assert = require('node:assert');

const { createEmptyBoard, applyMove, scoreBoard } = require('../src/core/game');
const { resetDictionaryCache } = require('../src/core/dictionary');

function buildBoardFromStrings(rows, playerId = 'test-player') {
  const board = createEmptyBoard();
  rows.forEach((row, rowIndex) => {
    row.split('').forEach((letter, colIndex) => {
      if (letter !== '.') {
        applyMove(board, { row: rowIndex, col: colIndex, letter, playerId });
      }
    });
  });
  return board;
}

test('scores rows and columns with longest valid words', async () => {
  resetDictionaryCache();
  const board = buildBoardFromStrings(['WORD', 'GRID', '....', '....']);
  const { totals, lines } = await scoreBoard(board);
  assert.strictEqual(totals['test-player'], 8, 'Two 4-letter words worth 4 points each');
  assert.strictEqual(lines.length, 2, 'Two scoring rows identified');
  const words = lines.map((line) => line.text).sort();
  assert.deepStrictEqual(words, ['GRID', 'WORD']);
});

test('ignores incomplete or single-letter sequences', async () => {
  resetDictionaryCache();
  const board = buildBoardFromStrings(['WO..', 'R...', '....', '....']);
  const { totals } = await scoreBoard(board);
  assert.strictEqual(totals['test-player'] || 0, 0);
});
