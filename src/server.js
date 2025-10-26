const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const { registerUser, loginUser, authenticate, getLeaderboard } = require('./core/user-service');
const { createGame, joinGame, recordMove, listPublicGames, findGame } = require('./core/game-service');
const { chooseMove } = require('./core/ai');
const { loadDictionary } = require('./core/dictionary');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const websocketClients = new Set();
const roomClients = new Map();

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  res.end(payload);
}

function notFound(res) {
  sendJson(res, 404, { error: 'Not found' });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function serveStatic(req, res) {
  const parsed = url.parse(req.url);
  let pathname = parsed.pathname;
  if (pathname === '/') {
    pathname = '/index.html';
  }
  const filePath = path.join(PUBLIC_DIR, pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return notFound(res);
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      return notFound(res);
    }
    const ext = path.extname(filePath);
    const type = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json'
    }[ext] || 'text/plain';
    res.writeHead(200, {
      'Content-Type': type,
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
}

async function handleApi(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const { pathname } = parsedUrl;
  const method = req.method.toUpperCase();

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    });
    res.end();
    return;
  }

  try {
    if (pathname === '/api/dictionary/status' && method === 'GET') {
      const dictionary = await loadDictionary();
      sendJson(res, 200, { words: dictionary.size });
      return;
    }

    if (pathname === '/api/auth/register' && method === 'POST') {
      const body = await parseBody(req);
      const { username, email, password } = body;
      if (!username || !email || !password) {
        sendJson(res, 400, { error: 'Missing fields' });
        return;
      }
      const result = registerUser({ username, email, password });
      sendJson(res, 201, result);
      return;
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await parseBody(req);
      const { usernameOrEmail, password } = body;
      if (!usernameOrEmail || !password) {
        sendJson(res, 400, { error: 'Missing fields' });
        return;
      }
      const result = loginUser({ usernameOrEmail, password });
      sendJson(res, 200, result);
      return;
    }

    if (pathname === '/api/profile' && method === 'GET') {
      const token = req.headers.authorization ? req.headers.authorization.replace('Bearer ', '') : null;
      const user = authenticate(token);
      if (!user) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
      }
      sendJson(res, 200, { user });
      return;
    }

    if (pathname === '/api/leaderboard' && method === 'GET') {
      const leaderboard = getLeaderboard();
      sendJson(res, 200, { leaderboard });
      return;
    }

    if (pathname === '/api/games' && method === 'GET') {
      const games = listPublicGames();
      sendJson(res, 200, { games });
      return;
    }

    if (pathname === '/api/games' && method === 'POST') {
      const body = await parseBody(req);
      const token = req.headers.authorization ? req.headers.authorization.replace('Bearer ', '') : null;
      const authUser = token ? authenticate(token) : null;
      const host = authUser ? { userId: authUser.id, username: authUser.username } : { username: body.hostName || 'Guest' };
      const mode = body.mode || 'local';
      const players = Array.isArray(body.players) ? body.players : [];
      const aiDifficulty = body.aiDifficulty || 'medium';
      const game = createGame({ mode, host, players, aiDifficulty });
      sendJson(res, 201, { game });
      broadcastGame(game.id, { type: 'game:created', game });
      return;
    }

    const joinMatch = pathname.match(/^\/api\/games\/([^/]+)\/join$/);
    if (joinMatch && method === 'POST') {
      const body = await parseBody(req);
      const player = { username: body.username || 'Guest' };
      const game = joinGame(joinMatch[1], player);
      sendJson(res, 200, { game });
      broadcastGame(game.id, { type: 'game:updated', game });
      return;
    }

    const moveMatch = pathname.match(/^\/api\/games\/([^/]+)\/move$/);
    if (moveMatch && method === 'POST') {
      const body = await parseBody(req);
      const gameId = moveMatch[1];
      const move = {
        playerId: body.playerId,
        row: body.row,
        col: body.col,
        letter: body.letter
      };
      const { game, completed } = await recordMove(gameId, move);
      sendJson(res, 200, { game });
      broadcastGame(game.id, { type: 'game:updated', game });

      if (!completed) {
        await runAiTurns(game.id, game);
      }
      return;
    }

    const gameMatch = pathname.match(/^\/api\/games\/([^/]+)$/);
    if (gameMatch && method === 'GET') {
      const { game } = findGame(gameMatch[1]);
      sendJson(res, 200, { game });
      return;
    }

    notFound(res);
  } catch (error) {
    console.error('API error', error);
    sendJson(res, 400, { error: error.message || 'Bad request' });
  }
}

function handleRequest(req, res) {
  if (req.url.startsWith('/api/')) {
    handleApi(req, res);
    return;
  }
  serveStatic(req, res);
}

function setupWebSocket(server) {
  server.on('upgrade', (req, socket) => {
    if (!req.headers['sec-websocket-key']) {
      socket.destroy();
      return;
    }
    const acceptKey = crypto
      .createHash('sha1')
      .update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');
    const responseHeaders = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`
    ];
    socket.write(`${responseHeaders.join('\r\n')}\r\n\r\n`);

    const client = { socket, rooms: new Set() };
    websocketClients.add(client);

    socket.on('data', (buffer) => {
      const message = decodeFrame(buffer);
      if (!message) return;
      try {
        const payload = JSON.parse(message);
        if (payload.type === 'subscribe' && payload.gameId) {
          subscribeClient(client, payload.gameId);
          sendFrame(socket, JSON.stringify({ type: 'subscribed', gameId: payload.gameId }));
        }
      } catch (error) {
        console.error('WebSocket payload error', error);
      }
    });

    socket.on('close', () => cleanupClient(client));
    socket.on('end', () => cleanupClient(client));
    socket.on('error', () => cleanupClient(client));
  });
}

function decodeFrame(buffer) {
  const firstByte = buffer[0];
  const opcode = firstByte & 0x0f;
  if (opcode === 0x8) {
    return null;
  }
  const secondByte = buffer[1];
  const isMasked = (secondByte & 0x80) === 0x80;
  let payloadLength = secondByte & 0x7f;
  let offset = 2;
  if (payloadLength === 126) {
    payloadLength = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLength === 127) {
    // Large payloads are not supported in this lightweight server.
    return null;
  }
  let maskingKey = null;
  if (isMasked) {
    maskingKey = buffer.slice(offset, offset + 4);
    offset += 4;
  }
  const payload = buffer.slice(offset, offset + payloadLength);
  const data = Buffer.alloc(payloadLength);
  for (let i = 0; i < payloadLength; i += 1) {
    data[i] = isMasked ? payload[i] ^ maskingKey[i % 4] : payload[i];
  }
  return data.toString('utf8');
}

function sendFrame(socket, data) {
  const payload = Buffer.from(data);
  const length = payload.length;
  let frame = null;
  if (length < 126) {
    frame = Buffer.alloc(2 + length);
    frame[0] = 0x81;
    frame[1] = length;
    payload.copy(frame, 2);
  } else if (length < 65536) {
    frame = Buffer.alloc(4 + length);
    frame[0] = 0x81;
    frame[1] = 126;
    frame.writeUInt16BE(length, 2);
    payload.copy(frame, 4);
  } else {
    throw new Error('Payload too large to send');
  }
  socket.write(frame);
}

function cleanupClient(client) {
  if (websocketClients.has(client)) {
    websocketClients.delete(client);
  }
  client.rooms.forEach((roomId) => {
    const room = roomClients.get(roomId);
    if (!room) return;
    room.delete(client);
    if (room.size === 0) {
      roomClients.delete(roomId);
    }
  });
}

function subscribeClient(client, roomId) {
  if (!roomClients.has(roomId)) {
    roomClients.set(roomId, new Set());
  }
  roomClients.get(roomId).add(client);
  client.rooms.add(roomId);
}

function broadcastGame(gameId, payload) {
  const room = roomClients.get(gameId);
  if (!room) return;
  const message = JSON.stringify(payload);
  room.forEach((client) => {
    try {
      sendFrame(client.socket, message);
    } catch (error) {
      console.error('Broadcast error', error);
    }
  });
}

async function runAiTurns(gameId, initialGame) {
  let snapshot = initialGame;
  while (snapshot.status === 'active') {
    const nextPlayer = snapshot.players[snapshot.currentTurn];
    if (!nextPlayer || nextPlayer.type !== 'ai') {
      break;
    }
    const sourceBoard = snapshot.boards[nextPlayer.id] || [];
    const board = sourceBoard.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
    const options = { difficulty: nextPlayer.difficulty };
    if (snapshot.expectedAction === 'place' && snapshot.currentLetter) {
      options.forcedLetter = snapshot.currentLetter;
    }
    const aiMove = await chooseMove(board, nextPlayer.id, options);
    const resolvedLetter =
      snapshot.expectedAction === 'place' && snapshot.currentLetter ? snapshot.currentLetter : aiMove.letter;
    const autoMove = {
      row: aiMove.row,
      col: aiMove.col,
      letter: resolvedLetter,
      playerId: nextPlayer.id
    };
    const result = await recordMove(gameId, autoMove);
    snapshot = result.game;
    broadcastGame(gameId, { type: 'game:updated', game: snapshot });
    if (result.completed) {
      break;
    }
  }
  return snapshot;
}

const server = http.createServer(handleRequest);
setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`WordGrid server running on http://localhost:${PORT}`);
});
