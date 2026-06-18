# GameTrackr

A web-based game completion tracker. Each game is a journal — markdown files and images are stored on the server; user completion progress and stats stay in the browser via `localStorage`.

Built with [Cursor](https://cursor.com) AI.

## Authentication

Create, edit, delete, and upload operations require signing in with an account from `backend/data/accounts.json` (not committed to git):

```bash
cp backend/data/accounts.example.json backend/data/accounts.json
# edit accounts.json with your username and password
```

Sign in from the nav menu (or when you try to create/edit a journal). Sessions last **72 hours** via a browser-stored token. Viewing journals remains public.

While signed in, your browser-stored progress and settings sync to `backend/data/users/{username}/` on the server. Cloud data takes priority over local storage when you sign in.

## Stack

- **Server:** Express + TypeScript — serves the API, static frontend, and uploaded images
- **Client:** vanilla TypeScript, Tailwind CSS, `marked` (bundled with esbuild)
- **Build:** esbuild (JS) + Tailwind CLI (CSS) + tsc (server)

## Setup

```bash
npm install
cp backend/data/accounts.example.json backend/data/accounts.json
cp .env.example .env   # optional MOBYGAMES_API_KEY
npm run build
```

## Development

Builds the client once, then starts Express plus file watchers for client JS and CSS:

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

Create a `.env` file on the server (it is not committed to git):

```bash
cp backend/data/accounts.example.json backend/data/accounts.json
cp .env.example .env   # optional MOBYGAMES_API_KEY
docker compose up -d --build
```

Compose reads `.env` from the project directory via `env_file` and injects those values into the container. You do **not** need a `.env` file inside the image.

```bash
docker compose logs -f
docker compose down
docker compose up -d --build   # after pulling updates
```

Game journals and uploads persist in the `gametrackr-data` volume.

### Verify accounts are configured

Run these from the repo root (same folder as `docker-compose.yml`):

```bash
test -f backend/data/accounts.json && echo OK || echo MISSING
docker compose run --rm gametrackr sh -c 'test -f /app/backend/data/accounts.json && echo OK || echo MISSING'
```

If the container check prints `MISSING`, create `backend/data/accounts.json` on the host and recreate the container:

```bash
docker compose down && docker compose up -d --build
```

## Project layout

```
game-tracking/
├── public/           # Built static assets (HTML, CSS, JS) — served by Express
├── frontend/src/     # Client TypeScript source
├── backend/src/      # Express API source
└── backend/data/     # Game markdown and uploaded images
```

## Architecture

| Layer | Responsibility |
|-------|----------------|
| Server | Game metadata, markdown content, image uploads, static frontend |
| Browser | Checkbox completion state, stats (`localStorage`) |

Checkbox completion is keyed by a stable hash of the checkbox label text, so progress survives edits that shift line numbers in the server markdown.

## Routes

- `#/` — Game library
- `#/editor` — Create a new game
- `#/editor/:slug` — Edit game markdown and upload images
- `#/viewer/:slug` — View rendered markdown and track completion
- `#/settings` — Global settings (theme, image viewport)
