import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createGame,
  deleteGame,
  deleteMobyGamesLink,
  duplicateGame,
  exportGameJournal,
  getGame,
  imagesDir,
  importGameJournal,
  readCheckboxes,
  readCompletionTags,
  readContent,
  readGameIndex,
  readImageLibrary,
  readJournal,
  readMaps,
  readMobyGamesInfo,
  readMobyGamesLink,
  readMobyGamesStore,
  readRetroAchievementsInfo,
  readRetroAchievementsLink,
  writeRetroAchievementsLink,
  deleteRetroAchievementsLink,
  updateMobyGamesCachedInfo,
  writeCheckboxes,
  writeCompletionTags,
  writeContent,
  writeEditorState,
  writeImageLibrary,
  writeJournal,
  writeMaps,
  writeMobyGamesLink,
} from '../storage/games.js';
import { filterImageFilenames, sanitizeImportFilename } from '../storage/imageFiles.js';
import { requireAuth } from '../middleware/auth.js';
import { createUploadMiddleware, imagePublicPath } from '../middleware/upload.js';
import { downloadRemoteImage } from '../services/fetchRemoteImage.js';
import { isMobyGamesConfigured, fetchMobyGameInfo } from '../services/mobygames.js';
import {
  isRetroAchievementsConfigured,
  parseRetroAchievementsGameId,
} from '../services/retroachievements.js';
import type {
  CheckboxConnectionsData,
  CompletionTagsData,
  CreateGameBody,
  DuplicateGameBody,
  EditorStateBody,
  FullJournalData,
  GameMapsData,
  ImageLibraryData,
  ImportGameBody,
  MobyGamesLinkBody,
} from '../types.js';

const router = Router();
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function readRouteParam(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] ?? '';
  return '';
}

function readSlug(req: { params: { slug?: string | string[] } }): string {
  return readRouteParam(req.params.slug);
}

router.get('/', async (_req, res) => {
  const games = await readGameIndex();
  res.json(games);
});

router.post('/', requireAuth, async (req, res) => {
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

router.post('/import', requireAuth, async (req, res) => {
  const body = req.body as ImportGameBody;
  if (!body.slug || !body.name) {
    res.status(400).json({ error: 'slug and name are required' });
    return;
  }
  if (!SLUG_PATTERN.test(body.slug)) {
    res.status(400).json({ error: 'Invalid slug format' });
    return;
  }
  if (!body.journal?.pages || !Array.isArray(body.journal.pages) || !body.journal.contents) {
    res.status(400).json({ error: 'journal.pages and journal.contents are required' });
    return;
  }
  if (!body.checkboxes || !Array.isArray(body.checkboxes.checkboxes)) {
    res.status(400).json({ error: 'checkboxes.checkboxes array is required' });
    return;
  }
  if (!body.completionTags || !Array.isArray(body.completionTags.tags)) {
    res.status(400).json({ error: 'completionTags.tags array is required' });
    return;
  }
  if (!Array.isArray(body.images)) {
    res.status(400).json({ error: 'images array is required' });
    return;
  }

  try {
    const game = await importGameJournal(body.slug, body.name.trim(), {
      sourceSlug: body.sourceSlug,
      journal: body.journal,
      checkboxes: body.checkboxes,
      completionTags: body.completionTags,
      maps: body.maps,
      imageLibrary: body.imageLibrary,
      images: body.images,
    });
    res.status(201).json(game);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import game';
    res.status(400).json({ error: message });
  }
});

router.get('/:slug/journal', async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  try {
    const journal = await readJournal(slug);
    res.json(journal);
  } catch {
    res.status(404).json({ error: 'Journal not found' });
  }
});

router.get('/:slug/maps', async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const maps = await readMaps(slug);
  res.json(maps);
});

router.put('/:slug/maps', requireAuth, async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const body = req.body as GameMapsData;
  if (!body || !Array.isArray(body.maps)) {
    res.status(400).json({ error: 'maps array is required' });
    return;
  }

  await writeMaps(slug, body);
  res.json(body);
});

router.get('/:slug/image-library', async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const library = await readImageLibrary(slug);
  res.json(library);
});

router.put('/:slug/image-library', requireAuth, async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const body = req.body as ImageLibraryData;
  if (!body || !Array.isArray(body.images)) {
    res.status(400).json({ error: 'images array is required' });
    return;
  }

  await writeImageLibrary(slug, body);
  res.json(body);
});

router.get('/:slug/checkboxes', async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const checkboxes = await readCheckboxes(slug);
  res.json(checkboxes);
});

router.get('/:slug/content', async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  try {
    const content = await readContent(slug);
    res.type('text/plain').send(content);
  } catch {
    res.status(404).json({ error: 'Content not found' });
  }
});

router.get('/:slug/export', requireAuth, async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  try {
    const bundle = await exportGameJournal(slug);
    res.json(bundle);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export game';
    res.status(500).json({ error: message });
  }
});

router.get('/:slug/completion-tags', async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const tags = await readCompletionTags(slug);
  res.json(tags);
});

router.get('/:slug/mobygames', async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const link = await readMobyGamesLink(slug);
  const store = await readMobyGamesStore(slug);

  if (!link && !store?.cachedInfo) {
    res.json({ configured: isMobyGamesConfigured(), link: null, info: null });
    return;
  }

  if (!link) {
    res.json({ configured: isMobyGamesConfigured(), link: null, info: store?.cachedInfo ?? null });
    return;
  }

  if (!isMobyGamesConfigured()) {
    res.json({ configured: false, link, info: store?.cachedInfo ?? null });
    return;
  }

  try {
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const info = await readMobyGamesInfo(slug, { refresh });
    res.json({ configured: true, link, info });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load MobyGames info';
    res.status(502).json({ error: message, link, info: store?.cachedInfo ?? null });
  }
});

router.get('/:slug/images', async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  try {
    const files = filterImageFilenames(await fs.readdir(imagesDir(slug)));
    const images = files.map((filename) => ({
      filename,
      url: imagePublicPath(slug, filename),
    }));
    res.json(images);
  } catch {
    res.json([]);
  }
});

router.get('/:slug', async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }
  res.json(game);
});

router.put('/:slug/editor-state', requireAuth, async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const body = req.body as EditorStateBody;
  if (!body?.journal || !Array.isArray(body.journal.pages) || !body.journal.contents) {
    res.status(400).json({ error: 'journal.pages and journal.contents are required' });
    return;
  }
  if (!body.checkboxes || !Array.isArray(body.checkboxes.checkboxes)) {
    res.status(400).json({ error: 'checkboxes.checkboxes array is required' });
    return;
  }
  if (!body.completionTags || !Array.isArray(body.completionTags.tags)) {
    res.status(400).json({ error: 'completionTags.tags array is required' });
    return;
  }
  if (!body.maps || !Array.isArray(body.maps.maps)) {
    res.status(400).json({ error: 'maps.maps array is required' });
    return;
  }
  if (!body.imageLibrary || !Array.isArray(body.imageLibrary.images)) {
    res.status(400).json({ error: 'imageLibrary.images array is required' });
    return;
  }

  try {
    const updated = await writeEditorState(slug, {
      journal: {
        version: body.journal.version ?? 2,
        pages: body.journal.pages,
        contents: body.journal.contents,
      },
      checkboxes: body.checkboxes,
      completionTags: body.completionTags,
      maps: body.maps,
      imageLibrary: body.imageLibrary,
    });
    res.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save editor state';
    res.status(400).json({ error: message });
  }
});

router.put('/:slug/journal', requireAuth, async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const body = req.body as FullJournalData;
  if (!body || !Array.isArray(body.pages) || !body.contents || typeof body.contents !== 'object') {
    res.status(400).json({ error: 'pages array and contents object are required' });
    return;
  }

  const updated = await writeJournal(slug, {
    version: body.version ?? 2,
    pages: body.pages,
    contents: body.contents,
  });
  res.json(updated);
});

router.put('/:slug/checkboxes', requireAuth, async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const body = req.body as CheckboxConnectionsData;
  if (!body || !Array.isArray(body.checkboxes)) {
    res.status(400).json({ error: 'checkboxes array is required' });
    return;
  }

  const updated = await writeCheckboxes(slug, body);
  res.json(updated);
});

router.put('/:slug/content', requireAuth, async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const content = typeof req.body?.content === 'string' ? req.body.content : null;
  if (content === null) {
    res.status(400).json({ error: 'content string is required' });
    return;
  }

  const updated = await writeContent(slug, content);
  res.json(updated);
});

router.put('/:slug/completion-tags', requireAuth, async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const body = req.body as CompletionTagsData;
  if (!body || !Array.isArray(body.tags)) {
    res.status(400).json({ error: 'tags array is required' });
    return;
  }

  const updated = await writeCompletionTags(slug, body);
  res.json(updated);
});

router.patch('/:slug/mobygames/cache', requireAuth, async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  try {
    const info = await updateMobyGamesCachedInfo(slug, req.body ?? {}, { defaultTitle: game.name });
    res.json({ info });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update game info cache';
    res.status(400).json({ error: message });
  }
});

router.put('/:slug/mobygames', requireAuth, async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
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
    const link = await writeMobyGamesLink(slug, body.gameId, info);
    res.json({ link, info });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to link MobyGames entry';
    res.status(502).json({ error: message });
  }
});

router.delete('/:slug/mobygames', requireAuth, async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  await deleteMobyGamesLink(slug);
  res.status(204).send();
});

router.get('/:slug/retroachievements', async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const configured = isRetroAchievementsConfigured();
  const link = await readRetroAchievementsLink(slug);

  if (!link) {
    res.json({ configured, link: null, info: null });
    return;
  }

  try {
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const info = await readRetroAchievementsInfo(slug, { refresh });
    res.json({ configured, link, info });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load RetroAchievements info';
    res.status(502).json({ error: message, link, info: null });
  }
});

router.put('/:slug/retroachievements', requireAuth, async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  if (!isRetroAchievementsConfigured()) {
    res.status(503).json({
      error: 'RetroAchievements API key is not configured. Set RETROACHIEVEMENTS_API_KEY.',
    });
    return;
  }

  const reference = (req.body as { gameId?: number | string })?.gameId;
  const gameId =
    reference === undefined ? null : parseRetroAchievementsGameId(reference);
  if (!gameId) {
    res.status(400).json({ error: 'A valid RetroAchievements game id or URL is required' });
    return;
  }

  try {
    const info = await writeRetroAchievementsLink(slug, gameId);
    res.json({ link: { gameId, linkedAt: new Date().toISOString() }, info });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to link RetroAchievements game';
    res.status(502).json({ error: message });
  }
});

router.delete('/:slug/retroachievements', requireAuth, async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  await deleteRetroAchievementsLink(slug);
  res.status(204).send();
});

router.post('/:slug/duplicate', requireAuth, async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
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
    const duplicated = await duplicateGame(slug, body.slug, body.name);
    res.status(201).json(duplicated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to duplicate game';
    res.status(400).json({ error: message });
  }
});

router.delete('/:slug', requireAuth, async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  await deleteGame(slug);
  res.status(204).send();
});

router.post('/:slug/images/from-url', requireAuth, async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  if (!url) {
    res.status(400).json({ error: 'URL is required' });
    return;
  }

  try {
    await fs.mkdir(imagesDir(slug), { recursive: true });
    const { buffer, ext } = await downloadRemoteImage(url);
    const filename = `${Date.now()}-import${ext}`;
    await fs.writeFile(path.join(imagesDir(slug), filename), buffer);
    res.status(201).json({
      url: imagePublicPath(slug, filename),
      filename,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed';
    res.status(400).json({ error: message });
  }
});

router.delete('/:slug/images/:filename', requireAuth, async (req, res) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const filename = sanitizeImportFilename(readRouteParam(req.params.filename));
  if (!filename) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }

  try {
    await fs.unlink(path.join(imagesDir(slug), filename));
    res.status(204).send();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      res.status(404).json({ error: 'Media file not found' });
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to delete media';
    res.status(500).json({ error: message });
  }
});

router.post('/:slug/images', requireAuth, async (req, res, next) => {
  const slug = readSlug(req);
  const game = await getGame(slug);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const upload = createUploadMiddleware(slug).single('image');
  upload(req, res, (err) => {
    if (err) {
      next(err);
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No media uploaded' });
      return;
    }

    res.status(201).json({
      url: imagePublicPath(slug, req.file.filename),
      filename: req.file.filename,
    });
  });
});

export default router;
