const { cloneBoard, applyMove, scoreBoard } = require('./game');

const LETTER_FREQUENCY = 'EEEEEEEEEEEEAAAAAAAARRRRRRRRRRIIIIIIOOOOOOOOOOTTTTTTTTTLLLLSSSSUUUNNNNDDDGGBBCCMMPPFFHHVVWWYYKJXQZ';

function randomLetter() {
  const index = Math.floor(Math.random() * LETTER_FREQUENCY.length);
  return LETTER_FREQUENCY[index];
}

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

async function evaluateMove(board, move, playerId) {
  const temp = cloneBoard(board);
  applyMove(temp, { ...move, playerId });
  const { totals } = await scoreBoard(temp);
  const playerScore = totals[playerId] || 0;
  const centerBias = 1 - (Math.abs(1.5 - move.row) + Math.abs(1.5 - move.col)) * 0.1;
  const coverage = Math.max(playerScore, 0) * 0.1;
  return {
    net: playerScore + centerBias + coverage,
    playerScore,
    centerBias
  };
}

async function chooseMove(board, playerId, options = {}) {
  const { difficulty = 'medium' } = options;
  const availableCells = [];
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      if (!board[row][col]) {
        availableCells.push({ row, col });
      }
    }
  }
  if (!availableCells.length) {
    throw new Error('Board is full');
  }

  if (difficulty === 'easy') {
    const cell = randomChoice(availableCells);
    return { ...cell, letter: randomLetter() };
  }

  const candidateMoves = [];
  for (const cell of availableCells) {
    for (let code = 65; code <= 90; code += 1) {
      candidateMoves.push({ row: cell.row, col: cell.col, letter: String.fromCharCode(code) });
    }
  }

  const scored = [];
  for (const move of candidateMoves) {
    const { net, playerScore } = await evaluateMove(board, move, playerId);
    let adjusted = net;
    if (difficulty === 'medium') {
      adjusted = net * 1.05;
    } else if (difficulty === 'hard') {
      const depthBonus = playerScore * 0.5;
      adjusted = net * 1.2 + depthBonus;
    }
    scored.push({ move, score: adjusted });
  }

  const bestScore = Math.max(...scored.map((item) => item.score));
  const tolerance = difficulty === 'hard' ? 0.01 : 0.1;
  const bestMoves = scored.filter((item) => Math.abs(item.score - bestScore) <= tolerance);
  return randomChoice(bestMoves).move;
}

module.exports = {
  chooseMove,
  __test: {
    evaluateMove
  }
};
