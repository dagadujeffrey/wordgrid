const state = {
  token: null,
  user: null,
  authMode: 'login',
  stage: 'auth',
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
  viewingPlayerId: null,
  needsPrivacyPrompt: false,
  selectedLetter: 'A',
  websocket: null
};

const palette = ['#38bdf8', '#f97316', '#22c55e', '#a855f7'];

function setStage(stage) {
  if (state.stage === stage) {
    if (document.body.dataset.stage !== stage) {
      document.body.dataset.stage = stage;
    }
    return;
  }
  state.stage = stage;
  if (stage !== 'play') {
    state.needsPrivacyPrompt = false;
  }
  document.body.dataset.stage = stage;
}

function syncViewingPlayer(game) {
  if (!game) {
    state.viewingPlayerId = null;
    state.needsPrivacyPrompt = false;
    return;
  }

  if (game.mode === 'local') {
    const activePlayer =
      game.status === 'completed'
        ? state.viewingPlayerId || (game.players[0] ? game.players[0].id : null)
        : game.players[game.currentTurn]?.id || null;
    if (activePlayer && state.viewingPlayerId !== activePlayer) {
      state.viewingPlayerId = activePlayer;
      if (game.status === 'active') {
        state.needsPrivacyPrompt = true;
      }
    }
    if (game.status !== 'active') {
      state.needsPrivacyPrompt = false;
    }
  } else {
    if (state.controlledPlayerId) {
      state.viewingPlayerId = state.controlledPlayerId;
    } else {
      const human = game.players.find((player) => player.type !== 'ai');
      if (human) {
        state.viewingPlayerId = human.id;
      }
    }
    state.needsPrivacyPrompt = false;
  }
}

function applyGameUpdate(game, options = {}) {
  state.game = game;
  if (game) {
    if (game.expectedAction === 'place' && game.currentLetter) {
      state.selectedLetter = game.currentLetter;
    } else if (!state.selectedLetter) {
      state.selectedLetter = 'A';
    }
  }
  syncViewingPlayer(game);
  if (game && game.status === 'completed') {
    state.needsPrivacyPrompt = false;
  }
  if (!options.preserveStage && game) {
    setStage('play');
  }
}

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
      state.viewingPlayerId = null;
      state.game = null;
      if (state.websocket) {
        state.websocket.close();
        state.websocket = null;
      }
      setStage('auth');
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

  if (state.game) {
    const navButton = document.createElement('button');
    navButton.className = 'button ghost';
    if (state.stage === 'play') {
      navButton.textContent = 'Back to setup';
      navButton.addEventListener('click', () => {
        setStage('setup');
        renderAll();
      });
    } else {
      navButton.textContent = 'Go to board';
      navButton.addEventListener('click', () => {
        setStage('play');
        renderAll();
      });
    }
    container.appendChild(navButton);
  }
}

function renderAuthPanel() {
  const panel = document.getElementById('auth-panel');
  if (state.stage !== 'auth') {
    panel.innerHTML = '';
    return;
  }

  if (state.user) {
    setStage('setup');
    renderAll();
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
      <button class="button ghost full" type="button" id="continue-guest">Continue as guest</button>
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
        setStage('setup');
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
      <button class="button ghost full" type="button" id="continue-guest">Continue as guest</button>
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
        setStage('setup');
        renderAll();
      } catch (error) {
        state.error = error.message;
        renderAll();
      }
    });
  }

  const guestButton = panel.querySelector('#continue-guest');
  if (guestButton) {
    guestButton.addEventListener('click', () => {
      state.error = null;
      setStage('setup');
      renderAll();
    });
  }
}

function renderProfilePanel() {
  const panel = document.getElementById('profile-panel');
  if (state.stage === 'auth') {
    panel.innerHTML = '';
    return;
  }

  const username = state.user ? state.user.username : 'Guest player';
  const gamesPlayed = state.user?.games_played ?? 0;
  const averagePoints = Number(state.user?.average_points ?? 0);
  const subtitle = state.user
    ? `Games played: ${gamesPlayed} · Average score: ${averagePoints.toFixed(2)}`
    : 'Playing without an account – progress will not be saved.';

  const badge = state.game ? `<div class="badge">${state.game.status.toUpperCase()}</div>` : '';
  const dictionaryNote = state.dictionaryWords
    ? `<p class="muted" style="margin-top: 0.75rem;">Dictionary cache: ${state.dictionaryWords.toLocaleString()} short words ready.</p>`
    : '';

  const actions = [];
  if (state.stage === 'setup' && state.game && state.game.status !== 'completed') {
    actions.push('<button class="button full" id="resume-game">Resume active match</button>');
  }
  if (state.stage === 'play') {
    actions.push('<button class="button ghost full" id="back-to-setup">Back to setup</button>');
  }

  panel.innerHTML = `
    <div class="flex-between" style="gap: 1rem; align-items: flex-start;">
      <div>
        <div class="section-title">${username}</div>
        <p class="muted">${subtitle}</p>
      </div>
      ${badge}
    </div>
    ${dictionaryNote}
    ${actions.length ? `<div class="grid-layout" style="margin-top:1rem; gap:0.75rem; grid-template-columns: 1fr;">${actions.join('')}</div>` : ''}
  `;

  const resume = panel.querySelector('#resume-game');
  if (resume) {
    resume.addEventListener('click', () => {
      setStage('play');
      renderAll();
    });
  }

  const back = panel.querySelector('#back-to-setup');
  if (back) {
    back.addEventListener('click', () => {
      setStage('setup');
      renderAll();
    });
  }
}

function renderGameSetup() {
  const panel = document.getElementById('game-setup');
  if (state.stage !== 'setup') {
    panel.innerHTML = '';
    return;
  }
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
        state.controlledPlayerId = null;
        applyGameUpdate(game);
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
        const player = game.players.find((p) => p.type !== 'ai');
        state.controlledPlayerId = player ? player.id : null;
        applyGameUpdate(game);
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
        const player = game.players[0];
        state.controlledPlayerId = player.id;
        applyGameUpdate(game);
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
    const player = game.players.find((p) => p.username === state.onlineName);
    state.controlledPlayerId = player ? player.id : null;
    applyGameUpdate(game);
    connectWebSocket(game.id);
    renderAll();
  } catch (error) {
    alert(error.message);
  }
}

function renderBoardPanel() {
  const panel = document.getElementById('board-panel');
  if (state.stage !== 'play') {
    panel.innerHTML = `
      <div class="section-title">Game Board</div>
      <p class="muted">Start or resume a match from the setup screen to access your board.</p>
    `;
    return;
  }

  if (!state.game) {
    panel.innerHTML = `
      <div class="section-title">Game Board</div>
      <p class="muted">No active match. Visit the setup stage to configure a game.</p>
    `;
    return;
  }

  const viewingPlayer = state.game.players.find((player) => player.id === state.viewingPlayerId) || state.game.players[0];
  const viewingIndex = state.game.players.findIndex((player) => player.id === viewingPlayer?.id);
  const board = viewingPlayer ? state.game.boards?.[viewingPlayer.id] : null;

  if (!viewingPlayer || !board) {
    panel.innerHTML = `
      <div class="section-title">Game Board</div>
      <p class="muted">Waiting for your board to become available…</p>
    `;
    return;
  }

  const activeTurnPlayer = state.game.players[state.game.currentTurn] || null;

  const playersMarkup = state.game.players
    .map((player, index) => {
      const score = state.game.summary?.totals?.[player.id] || 0;
      const active = state.game.status === 'active' && activeTurnPlayer && activeTurnPlayer.id === player.id;
      const viewing = player.id === viewingPlayer.id;
      const color = palette[index % palette.length];
      return `
        <div class="player-card ${active ? 'active' : ''}" style="border-left: 4px solid ${color};">
          <div>
            <div class="name">${player.username}</div>
            <div class="muted">${player.type === 'ai' ? `AI · ${player.difficulty}` : 'Human'}${viewing ? ' • Viewing' : ''}</div>
          </div>
          <div class="score">${score}</div>
        </div>
      `;
    })
    .join('');

  const letterColor = palette[(viewingIndex >= 0 ? viewingIndex : 0) % palette.length];
  const boardMarkup = board
    .map((row, rowIndex) =>
      row
        .map((cell, colIndex) => `
          <div class="cell ${cell ? 'filled' : ''}" data-row="${rowIndex}" data-col="${colIndex}" style="color: ${cell ? letterColor : 'inherit'};">
            ${cell ? cell.letter : ''}
          </div>
        `)
        .join('')
    )
    .join('');

  const isForcedPlacement = state.game.expectedAction === 'place' && state.game.currentLetter;
  const activeLetter = isForcedPlacement ? state.game.currentLetter : state.selectedLetter || 'A';
  const canMove =
    state.game.status === 'active' &&
    !state.needsPrivacyPrompt &&
    activeTurnPlayer &&
    activeTurnPlayer.id === viewingPlayer.id;
  const canSelectLetter = canMove && !isForcedPlacement;

  const statusMessage = (() => {
    if (state.game.status === 'waiting') {
      return 'Waiting for additional players to join.';
    }
    if (state.game.status === 'completed') {
      return 'Match complete. Review your final board and summary.';
    }
    if (canMove) {
      if (isForcedPlacement) {
        return `Place the shared letter ${state.game.currentLetter} anywhere on your grid.`;
      }
      return 'Choose the next shared letter and place it on your grid.';
    }
    if (!activeTurnPlayer) {
      return 'Waiting for the next move.';
    }
    if (state.game.expectedAction === 'place' && state.game.currentLetter) {
      return `Waiting for ${activeTurnPlayer.username} to place the shared letter ${state.game.currentLetter}.`;
    }
    return `Waiting for ${activeTurnPlayer.username} to choose the next letter.`;
  })();

  const keyboard = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index))
    .map((letter) => {
      const classes = ['key'];
      if (activeLetter === letter) {
        classes.push('active');
      }
      if (!canSelectLetter || (isForcedPlacement && letter !== state.game.currentLetter)) {
        classes.push('disabled');
      }
      return `
        <div class="${classes.join(' ')}" data-letter="${letter}">
          ${letter}
        </div>
      `;
    })
    .join('');

  const overlay =
    state.game.mode === 'local' &&
    state.needsPrivacyPrompt &&
    state.game.status === 'active'
      ? `
        <div class="privacy-overlay">
          <div class="section-title" style="margin:0;">${viewingPlayer.username}, it's your turn!</div>
          <p>Ask the other players to look away, then reveal your board to place the next letter.</p>
          <button class="button" id="reveal-board">Reveal board</button>
        </div>
      `
      : '';

  panel.innerHTML = `
    <div class="flex-between">
      <div>
        <div class="section-title">Game Board</div>
        <p class="muted">Viewing board for <strong>${viewingPlayer.username}</strong></p>
      </div>
      <div class="badge">${state.game.status.toUpperCase()}</div>
    </div>
    <div class="players">${playersMarkup}</div>
    <div class="board-panel-wrapper">
      ${overlay}
      <div class="board">${boardMarkup}</div>
    </div>
    <div class="section-title" style="margin-top:1.5rem;">${isForcedPlacement ? 'Shared Letter Placement' : 'Letter Selection'}</div>
    ${isForcedPlacement ? `<div class="shared-letter-banner">Shared letter: <strong>${state.game.currentLetter}</strong></div>` : ''}
    <div class="keyboard">${keyboard}</div>
    <p class="muted" style="margin-top:0.75rem;">${statusMessage}</p>
  `;

  const reveal = panel.querySelector('#reveal-board');
  if (reveal) {
    reveal.addEventListener('click', () => {
      state.needsPrivacyPrompt = false;
      renderBoardPanel();
    });
  }

  if (canMove) {
    panel.querySelectorAll('.cell').forEach((cell) => {
      cell.addEventListener('click', () => {
        const row = Number(cell.dataset.row);
        const col = Number(cell.dataset.col);
        if (board[row][col]) {
          return;
        }
        submitMove(row, col);
      });
    });

    panel.querySelectorAll('.key').forEach((key) => {
      key.addEventListener('click', () => {
        if (!canSelectLetter) {
          return;
        }
        state.selectedLetter = key.dataset.letter;
        renderBoardPanel();
      });
    });
  }
}

async function submitMove(row, col) {
  if (!state.game) return;
  const letter =
    state.game.expectedAction === 'place' && state.game.currentLetter
      ? state.game.currentLetter
      : state.selectedLetter || 'A';
  try {
    const { game } = await api(`/api/games/${state.game.id}/move`, {
      method: 'POST',
      body: {
        playerId: state.viewingPlayerId,
        row,
        col,
        letter
      }
    });
    applyGameUpdate(game, { preserveStage: true });
    renderAll();
  } catch (error) {
    alert(error.message);
  }
}

function renderSummaryPanel() {
  const panel = document.getElementById('summary-panel');
  if (state.stage !== 'play') {
    panel.innerHTML = '';
    return;
  }

  if (!state.game) {
    panel.innerHTML = `
      <div class="section-title">Match Summary</div>
      <p class="muted">Start a match to see scoring details.</p>
    `;
    return;
  }

  if (!state.game.summary) {
    const waitingCopy = state.game.status === 'active'
      ? 'Complete the game to view your scoring breakdown.'
      : 'No scoring details are available yet.';
    panel.innerHTML = `
      <div class="section-title">Match Summary</div>
      <p class="muted">${waitingCopy}</p>
    `;
    return;
  }

  const viewingPlayer = state.game.players.find((player) => player.id === state.viewingPlayerId) || state.game.players[0];
  if (!viewingPlayer) {
    panel.innerHTML = `
      <div class="section-title">Match Summary</div>
      <p class="muted">Select a player to review their results.</p>
    `;
    return;
  }

  const totals = state.game.summary.totals || {};
  const scoreboardLines = state.game.players
    .map((player, index) => {
      const score = totals[player.id] || 0;
      const label = player.id === viewingPlayer.id ? 'Your final score' : 'Opponent score';
      const color = palette[index % palette.length];
      return `
        <div class="summary-line">
          <div>
            <div class="label" style="color:${color};">${player.username}</div>
            <div class="muted">${label}</div>
          </div>
          <div class="word">${score}</div>
        </div>
      `;
    })
    .join('');

  const personalLines = state.game.summary.lines
    .filter((line) => line.playerId === viewingPlayer.id || line.ownerIds?.includes(viewingPlayer.id))
    .map((line) => {
      const label = `${line.type === 'row' ? 'Row' : 'Column'} ${line.index + 1}`;
      return `
        <div class="summary-line">
          <div>
            <div class="label">${label}</div>
            <div class="muted">${line.text}</div>
          </div>
          <div class="word">+${line.score}</div>
        </div>
      `;
    })
    .join('');

  panel.innerHTML = `
    <div class="section-title">Match Summary</div>
    <p class="muted">Final totals</p>
    <div class="summary">${scoreboardLines}</div>
    <p class="muted" style="margin-top:1.25rem;">${viewingPlayer.username}'s longest words</p>
    <div class="summary">${personalLines || '<p class="muted">No valid words were recorded.</p>'}</div>
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
  document.body.dataset.stage = state.stage;
  renderAuthActions();
  renderAuthPanel();
  renderProfilePanel();
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
      if (payload.type === 'game:updated' && (!state.game || payload.game.id === state.game.id)) {
        applyGameUpdate(payload.game, { preserveStage: true });
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
  if (!state.game || state.stage !== 'play' || state.needsPrivacyPrompt) return;
  if (state.game.status !== 'active') return;
  const current = state.game.players[state.game.currentTurn];
  if (!current || current.id !== state.viewingPlayerId) return;
  if (state.game.expectedAction === 'place' && state.game.currentLetter) return;
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
