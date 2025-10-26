const state = {
  token: null,
  user: null,
  authMode: 'login',
  dictionaryWords: 0,
  error: null,
  mode: 'local',
  localPlayers: ['Player 1', 'Player 2'],
  singleName: 'You',
  aiDifficulty: 'medium',
  onlineName: 'Guest',
  joinGameId: '',
  leaderboard: [],
  availableGames: [],
  game: null,
  controlledPlayerId: null,
  selectedLetter: 'A',
  websocket: null
};

const palette = ['#38bdf8', '#f97316', '#22c55e', '#a855f7'];

function api(path, options = {}) {
  const headers = options.headers || {};
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  }).then((response) => {
    if (!response.ok) {
      return response.json().then((data) => {
        throw new Error(data.error || 'Request failed');
      });
    }
    return response.json();
  });
}

function renderAuthActions() {
  const container = document.getElementById('auth-actions');
  container.innerHTML = '';
  if (state.user) {
    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.textContent = state.user.username;
    container.appendChild(badge);
    const logout = document.createElement('button');
    logout.className = 'button ghost';
    logout.textContent = 'Log out';
    logout.addEventListener('click', () => {
      state.token = null;
      state.user = null;
      state.controlledPlayerId = null;
      renderAll();
    });
    container.appendChild(logout);
  } else {
    const login = document.createElement('button');
    login.className = 'button ghost';
    login.textContent = state.authMode === 'login' ? 'Need an account?' : 'Already registered?';
    login.addEventListener('click', () => {
      state.authMode = state.authMode === 'login' ? 'register' : 'login';
      renderAll();
    });
    container.appendChild(login);
  }
}

function renderAuthPanel() {
  const panel = document.getElementById('auth-panel');
  if (state.user) {
    panel.innerHTML = `
      <div class="section-title">Profile</div>
      <p>Signed in as <strong>${state.user.username}</strong></p>
      <p class="muted">Games played: ${state.user.games_played} · Average score: ${state.user.average_points.toFixed(2)}</p>
    `;
    return;
  }

  if (state.authMode === 'login') {
    panel.innerHTML = `
      <div class="section-title">Login</div>
      <form id="login-form" class="grid-layout" style="gap: 0.75rem; grid-template-columns: 1fr;">
        <input class="input" required name="usernameOrEmail" placeholder="Username or email" />
        <input class="input" required name="password" type="password" placeholder="Password" />
        <button class="button full" type="submit">Sign in</button>
      </form>
      ${state.error ? `<div class="alert">${state.error}</div>` : ''}
    `;
    panel.querySelector('#login-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(event.target);
      try {
        const { user, token } = await api('/api/auth/login', {
          method: 'POST',
          body: Object.fromEntries(formData.entries())
        });
        state.user = user;
        state.token = token;
        state.error = null;
        state.controlledPlayerId = null;
        renderAll();
      } catch (error) {
        state.error = error.message;
        renderAll();
      }
    });
  } else {
    panel.innerHTML = `
      <div class="section-title">Create Account</div>
      <form id="register-form" class="grid-layout" style="gap: 0.75rem; grid-template-columns: 1fr;">
        <input class="input" required name="username" placeholder="Username" />
        <input class="input" required name="email" type="email" placeholder="Email" />
        <input class="input" required name="password" type="password" placeholder="Password" />
        <button class="button full" type="submit">Register</button>
      </form>
      ${state.error ? `<div class="alert">${state.error}</div>` : ''}
    `;
    panel.querySelector('#register-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(event.target);
      try {
        const { user, token } = await api('/api/auth/register', {
          method: 'POST',
          body: Object.fromEntries(formData.entries())
        });
        state.user = user;
        state.token = token;
        state.error = null;
        renderAll();
      } catch (error) {
        state.error = error.message;
        renderAll();
      }
    });
  }
}

function renderGameSetup() {
  const panel = document.getElementById('game-setup');
  const modeButtons = ['local', 'single', 'online']
    .map(
      (mode) => `
        <button class="button ${state.mode === mode ? '' : 'secondary'}" data-mode="${mode}">
          ${mode === 'local' ? 'Local Hot-Seat' : mode === 'single' ? 'Solo vs AI' : 'Online Multiplayer'}
        </button>
      `
    )
    .join('');

  const localPlayers = state.localPlayers
    .map(
      (name, index) => `
        <div class="flex" data-player-index="${index}">
          <input class="input" value="${name}" data-field="player-name" placeholder="Player ${index + 1}" />
          ${index >= 2
            ? '<button class="button ghost" data-action="remove-player" type="button">Remove</button>'
            : ''}
        </div>
      `
    )
    .join('');

  const difficultyOptions = ['easy', 'medium', 'hard']
    .map((d) => `<option value="${d}" ${state.aiDifficulty === d ? 'selected' : ''}>${d.toUpperCase()}</option>`)
    .join('');

  const availableGames = state.availableGames
    .map(
      (game) => `
        <div class="player-card">
          <div>
            <div class="name">${game.players.map((p) => p.username).join(' vs ')}</div>
            <div class="muted">Game ID: ${game.id}</div>
          </div>
          <button class="button secondary" data-action="join-online" data-game="${game.id}">Join</button>
        </div>
      `
    )
    .join('');

  panel.innerHTML = `
    <div class="section-title">Game Setup</div>
    <div class="flex">${modeButtons}</div>
    ${state.mode === 'local'
      ? `<div class="players">${localPlayers}</div>
         <button class="button ghost" type="button" id="add-player">Add Player</button>
         <button class="button full" id="start-local">Start Local Game</button>`
      : ''}
    ${state.mode === 'single'
      ? `<div class="players">
           <label class="flex-between">
             <span>Your display name</span>
             <input class="input" value="${state.singleName}" id="single-name" />
           </label>
           <label class="flex-between">
             <span>AI Difficulty</span>
             <select class="input" id="ai-difficulty">${difficultyOptions}</select>
           </label>
         </div>
         <button class="button full" id="start-single">Start Solo Match</button>`
      : ''}
    ${state.mode === 'online'
      ? `<div class="players">
           <label class="flex-between">
             <span>Display name</span>
             <input class="input" value="${state.onlineName}" id="online-name" />
           </label>
           <button class="button full" id="create-online">Create Online Room</button>
           <label class="flex-between">
             <span>Join existing game</span>
             <input class="input" value="${state.joinGameId}" id="join-game-id" placeholder="Enter Game ID" />
           </label>
           <button class="button full secondary" id="join-manual">Join Game by ID</button>
           <div class="section-title" style="margin-top:1rem;">Public Lobbies</div>
           <div class="players">${availableGames || '<p class="muted">No active public rooms.</p>'}</div>
         </div>`
      : ''}
  `;

  panel.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.mode = button.dataset.mode;
      renderAll();
    });
  });

  panel.querySelectorAll('[data-field="player-name"]').forEach((input) => {
    input.addEventListener('input', () => {
      const index = Number(input.closest('[data-player-index]').dataset.playerIndex);
      state.localPlayers[index] = input.value;
    });
  });

  panel.querySelectorAll('[data-action="remove-player"]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.closest('[data-player-index]').dataset.playerIndex);
      state.localPlayers.splice(index, 1);
      renderAll();
    });
  });

  const addButton = panel.querySelector('#add-player');
  if (addButton) {
    addButton.addEventListener('click', () => {
      if (state.localPlayers.length < 4) {
        state.localPlayers.push(`Player ${state.localPlayers.length + 1}`);
        renderAll();
      }
    });
  }

  const startLocal = panel.querySelector('#start-local');
  if (startLocal) {
    startLocal.addEventListener('click', async () => {
      try {
        const hostName = state.localPlayers[0];
        const players = state.localPlayers.slice(1).map((name) => ({ username: name }));
        const { game } = await api('/api/games', {
          method: 'POST',
          body: { mode: 'local', hostName, players }
        });
        state.game = game;
        state.controlledPlayerId = null;
        connectWebSocket(game.id);
        renderAll();
      } catch (error) {
        alert(error.message);
      }
    });
  }

  const singleName = panel.querySelector('#single-name');
  if (singleName) {
    singleName.addEventListener('input', () => {
      state.singleName = singleName.value;
    });
  }

  const aiSelect = panel.querySelector('#ai-difficulty');
  if (aiSelect) {
    aiSelect.addEventListener('change', () => {
      state.aiDifficulty = aiSelect.value;
    });
  }

  const startSingle = panel.querySelector('#start-single');
  if (startSingle) {
    startSingle.addEventListener('click', async () => {
      try {
        const { game } = await api('/api/games', {
          method: 'POST',
          body: {
            mode: 'single',
            hostName: state.singleName,
            aiDifficulty: state.aiDifficulty
          }
        });
        state.game = game;
        const player = game.players.find((p) => p.type !== 'ai');
        state.controlledPlayerId = player ? player.id : null;
        connectWebSocket(game.id);
        renderAll();
      } catch (error) {
        alert(error.message);
      }
    });
  }

  const onlineNameInput = panel.querySelector('#online-name');
  if (onlineNameInput) {
    onlineNameInput.addEventListener('input', () => {
      state.onlineName = onlineNameInput.value;
    });
  }

  const createOnline = panel.querySelector('#create-online');
  if (createOnline) {
    createOnline.addEventListener('click', async () => {
      try {
        const { game } = await api('/api/games', {
          method: 'POST',
          body: {
            mode: 'online',
            hostName: state.onlineName
          }
        });
        state.game = game;
        const player = game.players[0];
        state.controlledPlayerId = player.id;
        connectWebSocket(game.id);
        renderAll();
      } catch (error) {
        alert(error.message);
      }
    });
  }

  const joinManual = panel.querySelector('#join-manual');
  if (joinManual) {
    joinManual.addEventListener('click', async () => {
      if (!state.joinGameId) {
        alert('Enter a game ID to join');
        return;
      }
      await joinOnlineGame(state.joinGameId);
    });
  }

  panel.querySelectorAll('[data-action="join-online"]').forEach((button) => {
    button.addEventListener('click', async () => {
      await joinOnlineGame(button.dataset.game);
    });
  });

  const joinInput = panel.querySelector('#join-game-id');
  if (joinInput) {
    joinInput.addEventListener('input', () => {
      state.joinGameId = joinInput.value;
    });
  }
}

async function joinOnlineGame(gameId) {
  try {
    const { game } = await api(`/api/games/${gameId}/join`, {
      method: 'POST',
      body: { username: state.onlineName }
    });
    state.game = game;
    const player = game.players.find((p) => p.username === state.onlineName);
    state.controlledPlayerId = player ? player.id : null;
    connectWebSocket(game.id);
    renderAll();
  } catch (error) {
    alert(error.message);
  }
}

function renderBoardPanel() {
  const panel = document.getElementById('board-panel');
  if (!state.game) {
    panel.innerHTML = `
      <div class="section-title">Game Board</div>
      <p class="muted">Create or join a game to begin placing letters.</p>
    `;
    return;
  }

  const playersMarkup = state.game.players
    .map((player, index) => {
      const score = (state.game.summary?.totals?.[player.id]) || 0;
      const active = state.game.status === 'active' && state.game.players[state.game.currentTurn].id === player.id;
      const color = palette[index % palette.length];
      return `
        <div class="player-card ${active ? 'active' : ''}" style="border-left: 4px solid ${color};">
          <div>
            <div class="name">${player.username}</div>
            <div class="muted">${player.type === 'ai' ? `AI · ${player.difficulty}` : 'Human'}</div>
          </div>
          <div class="score">${score}</div>
        </div>
      `;
    })
    .join('');

  const boardMarkup = state.game.board
    .map((row, rowIndex) =>
      row
        .map((cell, colIndex) => {
          const playerIndex = cell
            ? state.game.players.findIndex((player) => player.id === cell.playerId)
            : -1;
          const color = playerIndex >= 0 ? palette[playerIndex % palette.length] : 'transparent';
          return `
            <div class="cell ${cell ? 'filled' : ''}" data-row="${rowIndex}" data-col="${colIndex}" style="color: ${color};">
              ${cell ? cell.letter : ''}
            </div>
          `;
        })
        .join('')
    )
    .join('');

  const keyboard = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index))
    .map((letter) => `<div class="key ${state.selectedLetter === letter ? 'active' : ''}" data-letter="${letter}">${letter}</div>`)
    .join('');

  panel.innerHTML = `
    <div class="flex-between">
      <div class="section-title">Game Board</div>
      <div class="badge">${state.game.status.toUpperCase()}</div>
    </div>
    <div class="players">${playersMarkup}</div>
    <div class="board">${boardMarkup}</div>
    <div class="section-title" style="margin-top:1.5rem;">Letter Selection</div>
    <div class="keyboard">${keyboard}</div>
  `;

  panel.querySelectorAll('.cell').forEach((cell) => {
    cell.addEventListener('click', () => {
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      if (state.game.status !== 'active') {
        return;
      }
      if (state.game.board[row][col]) {
        return;
      }
      const currentPlayer = state.game.players[state.game.currentTurn];
      if (currentPlayer.type === 'ai') {
        alert('AI is thinking...');
        return;
      }
      if (state.controlledPlayerId && currentPlayer.id !== state.controlledPlayerId) {
        alert('Waiting for your turn.');
        return;
      }
      submitMove(row, col, state.selectedLetter);
    });
  });

  panel.querySelectorAll('.key').forEach((key) => {
    key.addEventListener('click', () => {
      state.selectedLetter = key.dataset.letter;
      renderBoardPanel();
    });
  });
}

async function submitMove(row, col, letter) {
  if (!state.game) return;
  try {
    const { game } = await api(`/api/games/${state.game.id}/move`, {
      method: 'POST',
      body: {
        playerId: state.game.players[state.game.currentTurn].id,
        row,
        col,
        letter
      }
    });
    state.game = game;
    renderAll();
  } catch (error) {
    alert(error.message);
  }
}

function renderSummaryPanel() {
  const panel = document.getElementById('summary-panel');
  if (!state.game || !state.game.summary) {
    panel.innerHTML = `
      <div class="section-title">Match Summary</div>
      <p class="muted">Completed games will display detailed scoring breakdown here.</p>
    `;
    return;
  }

  const lines = state.game.summary.lines
    .map((line) => {
      const label = `${line.type === 'row' ? 'Row' : 'Column'} ${line.index + 1}`;
      const owners = line.ownerIds
        .map((id) => state.game.players.find((player) => player.id === id)?.username)
        .filter(Boolean)
        .join(', ');
      return `
        <div class="summary-line">
          <div>
            <div class="label">${label}</div>
            <div class="muted">${owners || '—'}</div>
          </div>
          <div class="word">${line.text} · +${line.score}</div>
        </div>
      `;
    })
    .join('');

  panel.innerHTML = `
    <div class="section-title">Match Summary</div>
    <div class="summary">${lines || '<p>No scoring sequences.</p>'}</div>
  `;
}

function renderLeaderboardPanel() {
  const panel = document.getElementById('leaderboard-panel');
  const entries = state.leaderboard
    .map(
      (entry, index) => `
        <div class="leaderboard-entry">
          <span>${index + 1}</span>
          <span>${entry.username}</span>
          <span>${entry.average_points.toFixed(2)}</span>
          <span>${entry.games_played} GP</span>
        </div>
      `
    )
    .join('');
  panel.innerHTML = `
    <div class="flex-between">
      <div class="section-title">Global Leaderboard</div>
      <button class="button ghost" id="refresh-leaderboard">Refresh</button>
    </div>
    <div class="leaderboard">${entries || '<p class="muted">No ranked players yet.</p>'}</div>
  `;
  panel.querySelector('#refresh-leaderboard').addEventListener('click', () => {
    loadLeaderboard();
  });
}

function renderAll() {
  renderAuthActions();
  renderAuthPanel();
  renderGameSetup();
  renderBoardPanel();
  renderSummaryPanel();
  renderLeaderboardPanel();
}

async function loadDictionaryStatus() {
  try {
    const { words } = await api('/api/dictionary/status');
    state.dictionaryWords = words;
  } catch (error) {
    console.warn('Dictionary status unavailable', error);
  }
}

async function loadLeaderboard() {
  try {
    const { leaderboard } = await api('/api/leaderboard');
    state.leaderboard = leaderboard;
    renderLeaderboardPanel();
  } catch (error) {
    console.warn('Leaderboard unavailable', error);
  }
}

async function loadAvailableGames() {
  try {
    const { games } = await api('/api/games');
    state.availableGames = games;
    if (state.mode === 'online') {
      renderGameSetup();
    }
  } catch (error) {
    console.warn('Failed to load games', error);
  }
}

function connectWebSocket(gameId) {
  if (state.websocket) {
    state.websocket.close();
    state.websocket = null;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  const ws = new WebSocket(`${protocol}${window.location.host}`);
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'subscribe', gameId }));
  });
  ws.addEventListener('message', (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === 'game:updated' && state.game && payload.game.id === state.game.id) {
        state.game = payload.game;
        renderAll();
      }
      if (payload.type === 'game:created') {
        loadAvailableGames();
      }
    } catch (error) {
      console.error('WebSocket message error', error);
    }
  });
  ws.addEventListener('close', () => {
    state.websocket = null;
  });
  state.websocket = ws;
}

window.addEventListener('keydown', (event) => {
  if (!state.game) return;
  const key = event.key.toUpperCase();
  if (key >= 'A' && key <= 'Z') {
    state.selectedLetter = key;
    renderBoardPanel();
  }
});

async function bootstrap() {
  renderAll();
  await loadDictionaryStatus();
  await loadLeaderboard();
  await loadAvailableGames();
  setInterval(loadAvailableGames, 15000);
}

bootstrap();
