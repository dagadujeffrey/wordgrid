# WordGrid

WordGrid is a strategic 4×4 word building arena featuring local hot-seat play, online multiplayer lobbies, and adaptive AI opponents. Every contender maintains a private grid: on their turn they propose a letter and decide where to place it on their own board. When the dust settles, each board is scored against an offline dictionary and points are awarded for the longest valid horizontal and vertical words.

## Features

- **Three game modes**
  - Local hot-seat for up to four players on one device.
  - Online multiplayer rooms powered by a lightweight WebSocket server.
  - Solo play versus an AI rival with easy, medium, and hard heuristics.
- **Deterministic scoring** that inspects every row and column, awards only the longest valid words, and updates the leaderboard.
- **Offline-first dictionary** with automatic caching and optional online bootstrap on first run.
- **Persistent stats** stored in a JSON data file (users, games, leaderboard).
- **Modern UI** built with a Tailwind-inspired utility palette, a guided Sign-in → Setup → Play flow, and privacy prompts for local turn swaps.
- **Automated tests** using the built-in `node:test` runner for scoring, AI decision making, and integration flows.

## Getting Started

WordGrid is implemented with zero third-party runtime dependencies, making it easy to run in restricted environments.

```bash
# Start the development server
npm start
```

The server hosts both the API and the client interface:

- Game UI: `http://localhost:3000`
- REST endpoints: `http://localhost:3000/api/...`
- WebSocket endpoint: `ws://localhost:3000`

All persistent data is stored in `src/data/store.json`. You can delete this file to reset users, games, and leaderboard statistics.

### Environment Variables

- `PORT`: Override the default port (`3000`).
- `WORDGRID_SECRET`: Customize the HMAC secret used for JWT authentication.

## Testing

The project uses `node:test` and requires Node.js ≥ 18.

```bash
npm test
```

## Project Structure

```
public/            # Front-end assets (HTML, CSS, vanilla JS)
src/core/          # Game rules, AI heuristics, data store helpers
src/api/           # (reserved for future route modules)
src/server.js      # Unified HTTP + WebSocket server
src/data/          # Persistent JSON store and dictionary seed
tests/             # node:test specifications
```

## Gameplay Overview

1. Each challenger has a personal 4×4 grid. On their turn they pick a letter (A–Z) and drop it into any empty square on their own board.
2. When every board is completely filled, the match ends and scoring begins.
3. For every row and column, the longest contiguous dictionary word earns points equal to its length (2–4).
4. Scores are tracked per board, so your private placements alone determine your total.
5. Leaderboard standings are ranked by average score across completed games.

Enjoy plotting out the strongest words, blocking your rivals, and climbing the global board!
