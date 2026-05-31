import { Router } from 'express';
import fs from 'node:fs/promises';
import {
  createGame,
  deleteGame,
  deleteMobyGamesLink,
  duplicateGame,
  getGame,
  imagesDir,
  readCompletionTags,
  readContent,
  readGameIndex,
  readMobyGamesInfo,
  readMobyGamesLink,
  writeCompletionTags,
  writeContent,
  writeMobyGamesLink,
} from '../storage/games.js';
import { filterImageFilenames } from '../storage/imageFiles.js';
import { createUploadMiddleware, imagePublicPath } from '../middleware/upload.js';
import { isMobyGamesConfigured, fetchMobyGameInfo } from '../services/mobygames.js';
import type { CompletionTagsData, CreateGameBody, DuplicateGameBody, MobyGamesLinkBody } from '../types.js';

const router = Router();
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

router.get('/', async (_req, res) => {
  const games = await readGameIndex();
  res.json(games);
});

router.get('/:slug', async (req, res) => {
  const game = await getGame(req.params.slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }
  res.json(game);
});

router.get('/:slug/content', async (req, res) => {
  const game = await getGame(req.params.slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  try {
    const content = await readContent(req.params.slug);
    res.type('text/plain').send(content);
  } catch {
    res.status(404).json({ error: 'Content not found' });
  }
});

router.post('/', async (req, res) => {
  const body = req.body as CreateGameBody;
  if (!body.slug || !body.name) {
    res.status(400).json({ error: 'slug and name are required' });
    return;
  }
  if (!SLUG_PATTERN.test(body.slug)) {
    res.status(400).json({ error: 'Invalid slug format' });
    return;
  }

  try {
    const game = await createGame(body.slug, body.name, body.content);
    res.status(201).json(game);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create game';
    res.status(400).json({ error: message });
  }
});

router.put('/:slug/content', async (req, res) => {
  const game = await getGame(req.params.slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const content = typeof req.body?.content === 'string' ? req.body.content : null;
  if (content === null) {
    res.status(400).json({ error: 'content string is required' });
    return;
  }

  const updated = await writeContent(req.params.slug, content);
  res.json(updated);
});

router.get('/:slug/completion-tags', async (req, res) => {
  const game = await getGame(req.params.slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const tags = await readCompletionTags(req.params.slug);
  res.json(tags);
});

router.put('/:slug/completion-tags', async (req, res) => {
  const game = await getGame(req.params.slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const body = req.body as CompletionTagsData;
  if (!body || !Array.isArray(body.tags)) {
    res.status(400).json({ error: 'tags array is required' });
    return;
  }

  const updated = await writeCompletionTags(req.params.slug, body);
  res.json(updated);
});

router.get('/:slug/mobygames', async (req, res) => {
  const game = await getGame(req.params.slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const link = await readMobyGamesLink(req.params.slug);
  if (!link) {
    res.json({ configured: isMobyGamesConfigured(), link: null, info: null });
    return;
  }

  if (!isMobyGamesConfigured()) {
    res.status(503).json({
      error: 'MobyGames API key is not configured. Set MOBYGAMES_API_KEY.',
      link,
      info: null,
    });
    return;
  }

  try {
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const info = await readMobyGamesInfo(req.params.slug, { refresh });
    res.json({ configured: true, link, info });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load MobyGames info';
    res.status(502).json({ error: message, link, info: null });
  }
});

router.put('/:slug/mobygames', async (req, res) => {
  const game = await getGame(req.params.slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  if (!isMobyGamesConfigured()) {
    res.status(503).json({ error: 'MobyGames API key is not configured. Set MOBYGAMES_API_KEY.' });
    return;
  }

  const body = req.body as MobyGamesLinkBody;
  if (!body || !Number.isInteger(body.gameId) || body.gameId <= 0) {
    res.status(400).json({ error: 'gameId must be a positive integer' });
    return;
  }

  try {
    const info = await fetchMobyGameInfo(body.gameId);
    const link = await writeMobyGamesLink(req.params.slug, body.gameId, info);
    res.json({ link, info });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to link MobyGames entry';
    res.status(502).json({ error: message });
  }
});

router.delete('/:slug/mobygames', async (req, res) => {
  const game = await getGame(req.params.slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  await deleteMobyGamesLink(req.params.slug);
  res.status(204).send();
});

router.post('/:slug/duplicate', async (req, res) => {
  const game = await getGame(req.params.slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const body = req.body as DuplicateGameBody;
  if (!body.slug || !body.name) {
    res.status(400).json({ error: 'slug and name are required' });
    return;
  }
  if (!SLUG_PATTERN.test(body.slug)) {
    res.status(400).json({ error: 'Invalid slug format' });
    return;
  }

  try {
    const duplicated = await duplicateGame(req.params.slug, body.slug, body.name);
    res.status(201).json(duplicated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to duplicate game';
    res.status(400).json({ error: message });
  }
});

router.delete('/:slug', async (req, res) => {
  const game = await getGame(req.params.slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  await deleteGame(req.params.slug);
  res.status(204).send();
});

router.post('/:slug/images', async (req, res, next) => {
  const game = await getGame(req.params.slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const upload = createUploadMiddleware(req.params.slug).single('image');
  upload(req, res, (err) => {
    if (err) {
      next(err);
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No image uploaded' });
      return;
    }

    res.status(201).json({
      url: imagePublicPath(req.params.slug, req.file.filename),
      filename: req.file.filename,
    });
  });
});

router.get('/:slug/images', async (req, res) => {
  const game = await getGame(req.params.slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  try {
    const files = filterImageFilenames(await fs.readdir(imagesDir(req.params.slug)));
    const images = files.map((filename) => ({
      filename,
      url: imagePublicPath(req.params.slug, filename),
    }));
    res.json(images);
  } catch {
    res.json([]);
  }
});

export default router;
