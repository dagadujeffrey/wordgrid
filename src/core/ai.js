const { cloneBoard, applyMove, scoreBoard, getAvailableMoves } = require('./game');

const LETTER_FREQUENCY = 'EEEEEEEEEEEEAAAAAAAARRRRRRRRRRIIIIIIOOOOOOOOOOTTTTTTTTTLLLLSSSSUUUNNNNDDDGGBBCCMMPPFFHHVVWWYYKJXQZ';

function randomLetter() {
  const index = Math.floor(Math.random() * LETTER_FREQUENCY.length);
  return LETTER_FREQUENCY[index];
}

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

async function evaluateMove(board, move, playerId, opponentIds) {
  const temp = cloneBoard(board);
  applyMove(temp, { ...move, playerId });
  const { totals } = await scoreBoard(temp);
  const playerScore = totals[playerId] || 0;
  const opponentScore = opponentIds.reduce((sum, id) => sum + (totals[id] || 0), 0);
  const centerBias = 1 - (Math.abs(1.5 - move.row) + Math.abs(1.5 - move.col)) * 0.1;
  const offensiveBonus = playerScore * 0.1;
  return {
    net: playerScore - opponentScore + centerBias + offensiveBonus,
    playerScore,
    opponentScore,
    centerBias
  };
}

async function evaluateOpponentResponse(board, move, playerId, opponentIds) {
  if (!opponentIds.length) return 0;
  const temp = cloneBoard(board);
  applyMove(temp, { ...move, playerId });
  const available = getAvailableMoves(temp);
  let worst = 0;
  for (const opponentId of opponentIds) {
    let best = -Infinity;
    for (const candidate of available) {
      const testBoard = cloneBoard(temp);
      applyMove(testBoard, { ...candidate, playerId: opponentId, letter: candidate.letter });
      const { totals } = await scoreBoard(testBoard);
      const score = (totals[opponentId] || 0) - (totals[playerId] || 0);
      if (score > best) {
        best = score;
      }
    }
    if (best > worst) {
      worst = best;
    }
  }
  return worst;
}

async function chooseMove(board, playerId, options = {}) {
  const { difficulty = 'medium', opponentIds = [] } = options;
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
    const { net, playerScore } = await evaluateMove(board, move, playerId, opponentIds);
    let adjusted = net;
    if (difficulty === 'medium') {
      const punishment = await evaluateOpponentResponse(board, move, playerId, opponentIds);
      adjusted -= punishment * 0.5;
    } else if (difficulty === 'hard') {
      const punishment = await evaluateOpponentResponse(board, move, playerId, opponentIds);
      adjusted = net * 1.2 - punishment + playerScore;
    }
    scored.push({ move, score: adjusted, playerScore });
  }

  const bestScore = Math.max(...scored.map((item) => item.score));
  const bestMoves = scored.filter((item) => Math.abs(item.score - bestScore) < 0.05);
  return randomChoice(bestMoves).move;
}

module.exports = {
  chooseMove,
  __test: {
    evaluateMove,
    evaluateOpponentResponse
  }
};
