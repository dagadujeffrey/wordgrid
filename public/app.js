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
  websocket: null,
  activeOverlay: null,
  musicEnabled: false,
  musicAvailable: false
};

const palette = ['#38bdf8', '#f97316', '#22c55e', '#a855f7'];

let musicController = null;

function setStage(stage) {
  if (stage !== 'play') {
    state.activeOverlay = null;
  }
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

function closeOverlay() {
  if (!state.activeOverlay) {
    return;
  }
  state.activeOverlay = null;
  renderOverlays();
  renderBoardPanel();
}

function openOverlay(name) {
  if (state.activeOverlay === name) {
    closeOverlay();
    return;
  }
  state.activeOverlay = name;
  renderOverlays();
  renderBoardPanel();
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

function renderMusicToggle() {
  const button = document.getElementById('music-toggle');
  if (!button) {
    return;
  }
  if (!state.musicAvailable) {
    button.style.display = 'none';
    button.classList.remove('music-on');
    button.setAttribute('aria-pressed', 'false');
    return;
  }
  button.style.display = 'inline-flex';
  button.classList.toggle('music-on', state.musicEnabled);
  button.textContent = state.musicEnabled ? 'Music: On' : 'Music: Off';
  button.setAttribute('aria-pressed', state.musicEnabled ? 'true' : 'false');
}

function ensureMusicController() {
  if (!state.musicAvailable) {
    return null;
  }
  if (musicController) {
    return musicController;
  }
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    state.musicAvailable = false;
    renderMusicToggle();
    return null;
  }
  const context = new AudioContext();
  const masterGain = context.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(context.destination);
  const oscillators = new Set();
  const sequence = [
    { freq: 261.63, duration: 1.3, type: 'sine', level: 0.5 },
    { freq: 329.63, duration: 0.85, type: 'triangle', level: 0.45 },
    { freq: 392.0, duration: 0.9, type: 'sine', level: 0.52 },
    { freq: 523.25, duration: 1.4, type: 'triangle', level: 0.42 },
    { freq: 392.0, duration: 1.1, type: 'sine', level: 0.5 },
    { freq: 349.23, duration: 0.95, type: 'triangle', level: 0.46 },
    { freq: 293.66, duration: 1.05, type: 'sine', level: 0.48 },
    { freq: 261.63, duration: 1.6, type: 'triangle', level: 0.44 }
  ];
  let playing = false;
  let timerId = null;

  function playStep(index) {
    if (!playing) {
      return;
    }
    const note = sequence[index % sequence.length];
    const oscillator = context.createOscillator();
    oscillator.type = note.type || 'sine';
    const gainNode = context.createGain();
    const now = context.currentTime;
    oscillator.frequency.setValueAtTime(note.freq, now);
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(note.level || 0.55, now + 0.05);
    gainNode.gain.setTargetAtTime(0, now + note.duration, 0.3);
    oscillator.connect(gainNode);
    gainNode.connect(masterGain);
    oscillator.start();
    oscillator.stop(now + note.duration + 0.6);
    oscillators.add(oscillator);
    oscillator.addEventListener('ended', () => {
      oscillators.delete(oscillator);
    });
    timerId = setTimeout(() => playStep(index + 1), note.duration * 1000);
  }

  musicController = {
    start() {
      if (playing) {
        return;
      }
      playing = true;
      if (context.state === 'suspended') {
        context.resume();
      }
      masterGain.gain.cancelScheduledValues(context.currentTime);
      masterGain.gain.linearRampToValueAtTime(0.18, context.currentTime + 0.6);
      playStep(0);
    },
    stop() {
      if (!playing) {
        return;
      }
      playing = false;
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      oscillators.forEach((oscillator) => {
        try {
          oscillator.stop();
        } catch (error) {
          // ignored
        }
      });
      oscillators.clear();
      masterGain.gain.cancelScheduledValues(context.currentTime);
      masterGain.gain.setTargetAtTime(0, context.currentTime, 0.35);
    }
  };

  return musicController;
}

function toggleMusic() {
  if (!state.musicAvailable) {
    return;
  }
  const controller = ensureMusicController();
  if (!controller) {
    return;
  }
  if (state.musicEnabled) {
    controller.stop();
    state.musicEnabled = false;
  } else {
    controller.start();
    state.musicEnabled = true;
  }
  renderMusicToggle();
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
  panel.onclick = null;
  if (state.stage === 'auth') {
    panel.classList.add('card');
    panel.classList.remove('overlay-container', 'overlay-visible');
    panel.innerHTML = '';
    return;
  }

  if (state.stage === 'setup') {
    panel.classList.add('card');
    panel.classList.remove('overlay-container', 'overlay-visible');
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
    if (state.game && state.game.status !== 'completed') {
      actions.push('<button class="button full" id="resume-game">Resume active match</button>');
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
    return;
  }

  // stage === 'play'
  panel.classList.remove('card');
  panel.classList.add('overlay-container');
  if (state.activeOverlay !== 'profile') {
    panel.classList.remove('overlay-visible');
    panel.innerHTML = '';
    return;
  }

  panel.classList.add('overlay-visible');

  if (!state.game) {
    panel.innerHTML = `
      <div class="overlay-card card">
        <div class="overlay-header">
          <div>
            <div class="section-title">Players &amp; Scores</div>
            <p class="muted">Start a match to manage player boards.</p>
          </div>
          <button class="overlay-close" type="button" aria-label="Close players panel">✕</button>
        </div>
        <p class="muted">You don't have an active game yet.</p>
      </div>
    `;
  } else {
    const activeTurnPlayer = state.game.players[state.game.currentTurn] || null;
    const viewingPlayer = state.game.players.find((player) => player.id === state.viewingPlayerId) || state.game.players[0];
    const overlaySubtitle = state.game.status === 'completed'
      ? 'Final standings for the finished match.'
      : 'Every round uses a shared letter across private boards.';
    const cards = state.game.players
      .map((player, index) => {
        const bits = [];
        bits.push(player.type === 'ai' ? `AI · ${player.difficulty}` : 'Human');
        if (viewingPlayer && viewingPlayer.id === player.id) {
          bits.push('Your board');
        }
        if (state.game.status === 'active' && activeTurnPlayer && activeTurnPlayer.id === player.id) {
          bits.push('Taking turn');
        }
        const info = bits.join(' • ');
        const color = palette[index % palette.length];
        const score = state.game.summary?.totals?.[player.id] ?? 0;
        const active = activeTurnPlayer && activeTurnPlayer.id === player.id && state.game.status === 'active';
        return `
          <div class="player-card ${active ? 'active' : ''}" style="border-left: 4px solid ${color};">
            <div>
              <div class="name">${player.username}</div>
              <div class="muted">${info}</div>
            </div>
            <div class="score">${score}</div>
          </div>
        `;
      })
      .join('');

    const playerList = cards || '<p class="muted">Waiting for additional players to join.</p>';

    panel.innerHTML = `
      <div class="overlay-card card">
        <div class="overlay-header">
          <div>
            <div class="section-title">Players &amp; Scores</div>
            <p class="muted">${overlaySubtitle}</p>
          </div>
          <button class="overlay-close" type="button" aria-label="Close players panel">✕</button>
        </div>
        <div class="players">${playerList}</div>
      </div>
    `;
  }

  const close = panel.querySelector('.overlay-close');
  if (close) {
    close.addEventListener('click', () => {
      closeOverlay();
    });
  }
  panel.onclick = (event) => {
    if (event.target === panel) {
      closeOverlay();
    }
  };
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

  const navButtons = [
    { key: 'profile', label: 'Players' },
    { key: 'summary', label: 'Summary' },
    { key: 'leaderboard', label: 'Leaderboard' }
  ];

  const navMarkup = navButtons
    .map(({ key, label }) => {
      const active = state.activeOverlay === key;
      return `
        <button type="button" class="nav-button ${active ? 'active' : ''}" data-overlay="${key}" aria-pressed="${active}">
          ${label}
        </button>
      `;
    })
    .join('');

  panel.innerHTML = `
    <div class="board-shell">
      <div class="board-top">
        <div>
          <div class="section-title">Your Board</div>
          <p class="board-meta">Viewing board for <strong>${viewingPlayer.username}</strong></p>
        </div>
        <div class="play-nav">
          <span class="badge">${state.game.status.toUpperCase()}</span>
          ${navMarkup}
        </div>
      </div>
      <div class="board-panel-wrapper">
        ${overlay}
        <div class="board">${boardMarkup}</div>
      </div>
      <div>
        <div class="section-title">${isForcedPlacement ? 'Shared Letter Placement' : 'Letter Selection'}</div>
        ${isForcedPlacement ? `<div class="shared-letter-banner">Shared letter: <strong>${state.game.currentLetter}</strong></div>` : ''}
        <div class="keyboard">${keyboard}</div>
      </div>
      <p class="board-meta" style="margin-top:0.5rem;">${statusMessage}</p>
    </div>
  `;

  const reveal = panel.querySelector('#reveal-board');
  if (reveal) {
    reveal.addEventListener('click', () => {
      state.needsPrivacyPrompt = false;
      renderBoardPanel();
    });
  }

  panel.querySelectorAll('[data-overlay]').forEach((button) => {
    button.addEventListener('click', () => {
      openOverlay(button.dataset.overlay);
    });
  });

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
  panel.onclick = null;
  if (state.stage !== 'play') {
    panel.classList.add('card');
    panel.classList.remove('overlay-container', 'overlay-visible');
    panel.innerHTML = '';
    return;
  }

  panel.classList.remove('card');
  panel.classList.add('overlay-container');

  if (state.activeOverlay !== 'summary') {
    panel.classList.remove('overlay-visible');
    panel.innerHTML = '';
    return;
  }

  panel.classList.add('overlay-visible');

  let content = '';

  if (!state.game) {
    content = '<p class="muted">Start a match to see scoring details.</p>';
  } else if (!state.game.summary) {
    const waitingCopy = state.game.status === 'active'
      ? 'Complete the game to view your scoring breakdown.'
      : 'No scoring details are available yet.';
    content = `<p class="muted">${waitingCopy}</p>`;
  } else {
    const viewingPlayer = state.game.players.find((player) => player.id === state.viewingPlayerId) || state.game.players[0];
    if (!viewingPlayer) {
      content = '<p class="muted">Select a player to review their results.</p>';
    } else {
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

      content = `
        <p class="muted">Final totals</p>
        <div class="summary">${scoreboardLines}</div>
        <p class="muted" style="margin-top:1.25rem;">${viewingPlayer.username}'s longest words</p>
        <div class="summary">${personalLines || '<p class="muted">No valid words were recorded.</p>'}</div>
      `;
    }
  }

  const subtitle = state.game && state.game.summary
    ? 'Review how each line scored once the match ends.'
    : 'Scores appear here after the shared-letter match concludes.';

  panel.innerHTML = `
    <div class="overlay-card card">
      <div class="overlay-header">
        <div>
          <div class="section-title">Match Summary</div>
          <p class="muted">${subtitle}</p>
        </div>
        <button class="overlay-close" type="button" aria-label="Close summary panel">✕</button>
      </div>
      ${content}
    </div>
  `;

  const close = panel.querySelector('.overlay-close');
  if (close) {
    close.addEventListener('click', () => {
      closeOverlay();
    });
  }

  panel.onclick = (event) => {
    if (event.target === panel) {
      closeOverlay();
    }
  };
}

function renderLeaderboardPanel() {
  const panel = document.getElementById('leaderboard-panel');
  panel.onclick = null;
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

  if (state.stage === 'auth') {
    panel.classList.add('card');
    panel.classList.remove('overlay-container', 'overlay-visible');
    panel.innerHTML = '';
    return;
  }

  if (state.stage === 'setup') {
    panel.classList.add('card');
    panel.classList.remove('overlay-container', 'overlay-visible');
    panel.innerHTML = `
      <div class="flex-between">
        <div class="section-title">Global Leaderboard</div>
        <button class="button ghost" id="refresh-leaderboard">Refresh</button>
      </div>
      <div class="leaderboard">${entries || '<p class="muted">No ranked players yet.</p>'}</div>
    `;
    const refresh = panel.querySelector('#refresh-leaderboard');
    if (refresh) {
      refresh.addEventListener('click', () => {
        loadLeaderboard();
      });
    }
    return;
  }

  // stage === 'play'
  panel.classList.remove('card');
  panel.classList.add('overlay-container');
  if (state.activeOverlay !== 'leaderboard') {
    panel.classList.remove('overlay-visible');
    panel.innerHTML = '';
    return;
  }

  panel.classList.add('overlay-visible');
  panel.innerHTML = `
    <div class="overlay-card card">
      <div class="overlay-header">
        <div>
          <div class="section-title">Global Leaderboard</div>
          <p class="muted">Average score ranking across all completed games.</p>
        </div>
        <button class="overlay-close" type="button" aria-label="Close leaderboard panel">✕</button>
      </div>
      <div class="leaderboard">${entries || '<p class="muted">No ranked players yet.</p>'}</div>
      <button class="button ghost full" id="refresh-leaderboard">Refresh</button>
    </div>
  `;

  const refresh = panel.querySelector('#refresh-leaderboard');
  if (refresh) {
    refresh.addEventListener('click', () => {
      loadLeaderboard();
    });
  }

  const close = panel.querySelector('.overlay-close');
  if (close) {
    close.addEventListener('click', () => {
      closeOverlay();
    });
  }

  panel.onclick = (event) => {
    if (event.target === panel) {
      closeOverlay();
    }
  };
}

function renderOverlays() {
  renderProfilePanel();
  renderSummaryPanel();
  renderLeaderboardPanel();
  const overlayActive = Boolean(state.activeOverlay && state.stage === 'play');
  document.body.classList.toggle('overlay-active', overlayActive);
}

function renderAll() {
  document.body.dataset.stage = state.stage;
  renderAuthActions();
  renderMusicToggle();
  renderAuthPanel();
  renderGameSetup();
  renderBoardPanel();
  renderOverlays();
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
  if (event.key === 'Escape' && state.activeOverlay) {
    event.preventDefault();
    closeOverlay();
    return;
  }
  if (!state.game || state.stage !== 'play' || state.needsPrivacyPrompt || state.activeOverlay) return;
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
  state.musicAvailable = Boolean(window.AudioContext || window.webkitAudioContext);
  const musicToggle = document.getElementById('music-toggle');
  if (musicToggle) {
    musicToggle.addEventListener('click', () => {
      if (!state.musicAvailable) {
        return;
      }
      toggleMusic();
    });
  }
  renderAll();
  await loadDictionaryStatus();
  await loadLeaderboard();
  await loadAvailableGames();
  setInterval(loadAvailableGames, 15000);
}

bootstrap();
