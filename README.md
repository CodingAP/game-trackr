# GameTrackr

A web-based game completion tracker. Each game is a journal — markdown files and images are stored on the server; user completion progress and stats stay in the browser via `localStorage`.

Built with [Cursor](https://cursor.com) AI.

## Stack

- **Server:** Express + TypeScript — serves the API, static frontend, and uploaded images
- **Client:** vanilla TypeScript, Tailwind CSS, `marked` (bundled with esbuild)
- **Build:** esbuild (JS) + Tailwind CLI (CSS) + tsc (server)

## Setup

```bash
npm install
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
