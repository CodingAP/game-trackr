# GameTrackr

A self-hosted game completion tracker. Each game gets a markdown journal with pages, trackable checkboxes, progress bars, annotated maps, and embedded media. Journals live on the server; your personal progress lives in your browser and can optionally sync to your account.

Live instance: [gametrackr.codingap.dev](https://gametrackr.codingap.dev)

This project was built with the help of AI, specifically [Cursor](https://cursor.com).

## Features

- **Markdown journals** with multiple pages, a CodeMirror editor, autosave, find and replace, and a table of contents in the viewer.
- **Checkboxes and progress bars.** Define trackable items once, embed them anywhere with `[[cb:id]]`, and roll them up into named progress bars shown above the journal.
- **Maps.** Upload a map image, place typed points on it, link points to checkboxes, and embed it with `[[map:id]]`. Viewers can zoom and toggle point types.
- **Media library.** Upload images and video or import them from a URL, with alt text and source attribution, then embed them with per-embed sizing.
- **Library and collections.** Browse games by cover, group them into collections, sort and search, and see completion at a glance.
- **Playtime and notes** per game, stored locally.
- **Integrations.** Pull cover art, descriptions, and platform info from MobyGames, and link achievement sets from RetroAchievements. Both are optional.
- **Themes.** Several color presets plus custom colors, applied before first paint.
- **Installable PWA** with a mobile-friendly layout.
- **Backup and export.** Download a single game or every game as a `.gametrackr.json` bundle, import it elsewhere, and back up browser data to your account.

## How data is stored

| Where | What |
|-------|------|
| Server, `backend/data/games/` | Journal pages, checkbox and progress bar definitions, maps, uploaded media, cached MobyGames and RetroAchievements info |
| Server, `backend/data/users/` | Per-account backup of browser data, synced while signed in |
| Browser, `localStorage` | Checkbox completion, playtime, notes, collections, theme and display settings, sign-in token |

Checkbox completion is keyed by a stable id rather than a line number, so progress survives edits to the journal text.

## Authentication

Viewing journals is public. Creating, editing, deleting, uploading, and syncing require signing in with an account from `backend/data/accounts.json`, which is not committed to git:

```bash
cp backend/data/accounts.example.json backend/data/accounts.json
# edit accounts.json with your username and password
```

Accounts are stored as plain JSON on the server, so keep that file private and use a strong password. Sessions last 72 hours and are signed with `AUTH_TOKEN_SECRET`. If that variable is unset, a random secret is generated on each start and everyone is signed out when the server restarts.

While signed in, browser data syncs to `backend/data/users/{username}/`. Server data wins over local data when you sign in on a new device.

Any signed-in account can use **Reset everything** in Settings, which deletes every game on the server and that account's backup. This app is designed for a single owner or a small group of trusted people, not for untrusted users.

## Stack

- **Server:** Express 5 and TypeScript, serving the API, the static frontend, and uploaded media
- **Client:** vanilla TypeScript, Tailwind CSS 4, CodeMirror 6, and `marked`
- **Build:** esbuild for the client, Tailwind CLI for CSS, `tsc` for the server

## Setup

Requires Node.js 22 or newer.

```bash
npm install
cp backend/data/accounts.example.json backend/data/accounts.json
cp .env.example .env   # then edit, all settings are optional
npm run build
```

### Configuration

All settings go in `.env` (see `.env.example`):

| Variable | Purpose |
|----------|---------|
| `AUTH_TOKEN_SECRET` | Long random string used to sign sign-in tokens. Recommended in production. |
| `MOBYGAMES_API_KEY` | Enables MobyGames search and metadata import. |
| `MOBYGAMES_CACHE_TTL_HOURS` | How long to cache MobyGames info. Default 168 (7 days). |
| `RETROACHIEVEMENTS_API_KEY` | Enables linking games to RetroAchievements sets. |
| `PORT` | Port to listen on. Default 3000. |

## Development

Builds the client once, then runs Express with file watchers for the client, theme bootstrap, and CSS:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production

```bash
npm run build
npm start
```

## Docker

```bash
cp backend/data/accounts.example.json backend/data/accounts.json
cp .env.example .env   # then edit
docker compose up -d --build
```

Compose reads `.env` from the project directory and passes it into the container. The container refuses to start without `backend/data/accounts.json`. Journals and uploads persist in the `gametrackr-data` volume.

```bash
docker compose logs -f
docker compose down
docker compose up -d --build   # after pulling updates
```

## Project layout

```
game-trackr/
├── frontend/src/      # Client TypeScript source
├── frontend/public/   # Static assets copied into public/ at build time
├── backend/src/       # Express API source
├── backend/data/      # Runtime data: accounts, journals, uploads (git-ignored)
├── public/            # Built site served by Express
└── scripts/           # Icon generation
```

## Routes

- `/` — Game library
- `/editor` — Create a new game
- `/editor/:slug` — Edit a game's pages, media, maps, checkboxes, progress bars, and metadata
- `/viewer/:slug` and `/viewer/:slug/:page` — Read a journal and track completion
- `/settings` — Theme, display settings, backup, export, and reset
