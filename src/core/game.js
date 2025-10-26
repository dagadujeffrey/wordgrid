const { loadDictionary } = require('./dictionary');

const BOARD_SIZE = 4;

function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => null));
}

function cloneBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

function isWithinBoard(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function applyMove(board, move) {
  const { row, col, letter, playerId } = move;
  if (!isWithinBoard(row, col)) {
    throw new Error('Invalid position');
  }
  if (board[row][col]) {
    throw new Error('Cell already filled');
  }
  board[row][col] = { letter: letter.toUpperCase(), playerId };
}

function getLineCells(board, type, index) {
  if (type === 'row') {
    return board[index].map((cell, col) => ({ cell, position: { row: index, col } }));
  }
  return board.map((row, rowIndex) => ({ cell: row[index], position: { row: rowIndex, col: index } }));
}

function extractWord(cells, start, length) {
  const slice = cells.slice(start, start + length);
  if (slice.some(({ cell }) => !cell)) {
    return null;
  }
  return {
    text: slice.map(({ cell }) => cell.letter).join(''),
    ownerIds: Array.from(new Set(slice.map(({ cell }) => cell.playerId))),
    positions: slice.map(({ position }) => position)
  };
}

async function evaluateLine(cells, dictionary) {
  const segments = [];
  for (let length = BOARD_SIZE; length >= 2; length -= 1) {
    for (let start = 0; start <= BOARD_SIZE - length; start += 1) {
      const candidate = extractWord(cells, start, length);
      if (candidate && dictionary.has(candidate.text)) {
        segments.push({ ...candidate, score: length });
        break; // prefer longest from this start length
      }
    }
    if (segments.length) {
      break;
    }
  }
  return segments[0] || null;
}

async function scoreBoard(board) {
  const dictionary = await loadDictionary();
  const totals = {};
  const lines = [];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    const cells = getLineCells(board, 'row', row);
    const best = await evaluateLine(cells, dictionary);
    if (best) {
      best.ownerIds.forEach((ownerId) => {
        totals[ownerId] = (totals[ownerId] || 0) + best.score;
      });
      lines.push({ type: 'row', index: row, ...best });
    }
  }

  for (let col = 0; col < BOARD_SIZE; col += 1) {
    const cells = getLineCells(board, 'col', col);
    const best = await evaluateLine(cells, dictionary);
    if (best) {
      best.ownerIds.forEach((ownerId) => {
        totals[ownerId] = (totals[ownerId] || 0) + best.score;
      });
      lines.push({ type: 'col', index: col, ...best });
    }
  }

  return { totals, lines };
}

function getAvailableMoves(board) {
  const moves = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (!board[row][col]) {
        for (let code = 65; code <= 90; code += 1) {
          moves.push({ row, col, letter: String.fromCharCode(code) });
        }
      }
    }
  }
  return moves;
}

function isBoardFull(board) {
  return board.every((row) => row.every((cell) => !!cell));
}

module.exports = {
  BOARD_SIZE,
  createEmptyBoard,
  cloneBoard,
  applyMove,
  scoreBoard,
  getAvailableMoves,
  isBoardFull
};
