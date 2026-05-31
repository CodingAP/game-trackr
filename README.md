# GameTrackr

A web-based game completion tracker. Each game is a journal — markdown files and images are stored on the server; user completion progress and stats stay in the browser via `localStorage`.

Built with [Cursor](https://cursor.com) AI.

## Authentication

Create, edit, delete, and upload operations require an admin password set in `.env`:

```bash
ADMIN_PASSWORD=your_password_here
```

Sign in from the nav menu (or when you try to create/edit a journal). Sessions last **72 hours** via a browser-stored token. Viewing journals remains public.

## Stack

- **Server:** Express + TypeScript — serves the API, static frontend, and uploaded images
- **Client:** vanilla TypeScript, Tailwind CSS, `marked` (bundled with esbuild)
- **Build:** esbuild (JS) + Tailwind CLI (CSS) + tsc (server)

## Setup

```bash
npm install
cp .env.example .env   # set ADMIN_PASSWORD and optional MOBYGAMES_API_KEY
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

## Seed data

A sample *Super Mario Bros.* journal is included at `backend/data/games/super-mario-bros/content.md`.
