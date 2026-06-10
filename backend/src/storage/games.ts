import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CheckboxConnectionsData,
  CompletionTagsData,
  FullJournalData,
  GameMapsData,
  GameMeta,
  ImageLibraryData,
  JournalData,
  JournalExportBundle,
  JournalExportImage,
  MobyGamesLink,
} from '../types.js';
import {
  checkboxesPath,
  journalPath,
  migrateJournalFromV1,
  pageContentPath,
  pagesDir,
  readJournalFromDisk,
} from '../migration/journal.js';
import type { MobyGamesGameInfo } from '../services/mobygames.js';
import { fetchMobyGameInfo } from '../services/mobygames.js';
import {
  filterImageFilenames,
  MAX_MEDIA_BYTES,
  MAX_MEDIA_SIZE_LABEL,
  sanitizeImportFilename,
} from './imageFiles.js';

interface MobyGamesStore extends MobyGamesLink {
  cachedInfo?: MobyGamesGameInfo;
  cachedAt?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, '../../data/games');
const INDEX_PATH = path.join(DATA_DIR, 'index.json');
const EMPTY_TAGS: CompletionTagsData = { tags: [] };
const EMPTY_CHECKBOXES: CheckboxConnectionsData = { checkboxes: [] };
const EMPTY_IMAGE_LIBRARY: ImageLibraryData = { images: [] };
const EMPTY_MAPS: GameMapsData = { maps: [] };
const DEFAULT_MAIN_PAGE_ID = 'main';
const DEFAULT_CONTENT = '# New Game\n\n- [[cb:goal-1]] Add your first goal\n';
const DEFAULT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
};

function getCacheTtlMs(): number {
  const hours = Number(process.env.MOBYGAMES_CACHE_TTL_HOURS);
  if (Number.isFinite(hours) && hours > 0) {
    return hours * 60 * 60 * 1000;
  }
  return DEFAULT_CACHE_TTL_MS;
}

function isCacheFresh(store: MobyGamesStore): boolean {
  if (!store.cachedInfo || !store.cachedAt) return false;
  if (store.cachedInfo.gameId !== store.gameId) return false;

  const age = Date.now() - new Date(store.cachedAt).getTime();
  return age >= 0 && age < getCacheTtlMs();
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readGameIndex(): Promise<GameMeta[]> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(INDEX_PATH, 'utf-8');
    return JSON.parse(raw) as GameMeta[];
  } catch {
    return [];
  }
}

let indexMutationQueue: Promise<unknown> = Promise.resolve();

async function withIndexLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = indexMutationQueue.then(() => operation());
  indexMutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function writeGameIndex(games: GameMeta[]): Promise<void> {
  await ensureDataDir();
  const tempPath = `${INDEX_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(games, null, 2), 'utf-8');
  await fs.rename(tempPath, INDEX_PATH);
}

async function touchGameUpdatedAt(slug: string): Promise<GameMeta> {
  return withIndexLock(async () => {
    const games = await readGameIndex();
    const index = games.findIndex((game) => game.slug === slug);
    if (index === -1) {
      throw new Error('Game not found');
    }

    games[index] = { ...games[index], updatedAt: new Date().toISOString() };
    await writeGameIndex(games);
    return games[index];
  });
}

async function writeJournalFiles(slug: string, data: FullJournalData): Promise<void> {
  const dir = gameDir(slug);
  const journal: JournalData = {
    version: data.version,
    pages: data.pages,
  };

  await fs.mkdir(pagesDir(dir), { recursive: true });
  await fs.writeFile(journalPath(dir), JSON.stringify(journal, null, 2));

  const pageIds = new Set(data.pages.map((page) => page.id));
  for (const [pageId, content] of Object.entries(data.contents)) {
    if (!pageIds.has(pageId)) continue;
    await fs.writeFile(pageContentPath(dir, pageId), content);
  }

  const mainContent =
    data.contents[DEFAULT_MAIN_PAGE_ID] ?? data.contents[data.pages[0]?.id ?? ''] ?? '';
  await fs.writeFile(contentPath(slug), mainContent);
}

export interface EditorStateData {
  journal: FullJournalData;
  checkboxes: CheckboxConnectionsData;
  completionTags: CompletionTagsData;
  maps: GameMapsData;
  imageLibrary: ImageLibraryData;
}

export async function writeEditorState(slug: string, data: EditorStateData): Promise<GameMeta> {
  const game = await getGame(slug);
  if (!game) {
    throw new Error('Game not found');
  }

  const dir = gameDir(slug);
  await Promise.all([
    writeJournalFiles(slug, data.journal),
    fs.writeFile(checkboxesPath(dir), JSON.stringify(data.checkboxes, null, 2)),
    fs.writeFile(completionTagsPath(slug), JSON.stringify(data.completionTags, null, 2)),
    fs.writeFile(mapsPath(slug), JSON.stringify(data.maps, null, 2)),
    fs.writeFile(imageLibraryPath(slug), JSON.stringify(data.imageLibrary, null, 2)),
  ]);

  return touchGameUpdatedAt(slug);
}

export function gameDir(slug: string): string {
  return path.join(DATA_DIR, slug);
}

export function contentPath(slug: string): string {
  return path.join(gameDir(slug), 'content.md');
}

export function imagesDir(slug: string): string {
  return path.join(gameDir(slug), 'images');
}

export function completionTagsPath(slug: string): string {
  return path.join(gameDir(slug), 'completion-tags.json');
}

export function mapsPath(slug: string): string {
  return path.join(gameDir(slug), 'maps.json');
}

export function imageLibraryPath(slug: string): string {
  return path.join(gameDir(slug), 'image-library.json');
}

export function mobyGamesLinkPath(slug: string): string {
  return path.join(gameDir(slug), 'mobygames.json');
}

export async function getGame(slug: string): Promise<GameMeta | undefined> {
  const games = await readGameIndex();
  return games.find((game) => game.slug === slug);
}

export async function createGame(
  slug: string,
  name: string,
  content = DEFAULT_CONTENT,
): Promise<GameMeta> {
  const now = new Date().toISOString();
  const meta: GameMeta = { slug, name, createdAt: now, updatedAt: now };
  const dir = gameDir(slug);
  const journal: JournalData = {
    version: 2,
    pages: [{ id: DEFAULT_MAIN_PAGE_ID, name: 'Main', order: 0 }],
  };
  const checkboxes: CheckboxConnectionsData = {
    checkboxes: [
      {
        id: 'goal-1',
        label: 'Add your first goal',
        parentId: null,
        tagIds: [],
      },
    ],
  };

  await fs.mkdir(imagesDir(slug), { recursive: true });
  await fs.mkdir(pagesDir(dir), { recursive: true });
  await fs.writeFile(journalPath(dir), JSON.stringify(journal, null, 2));
  await fs.writeFile(pageContentPath(dir, DEFAULT_MAIN_PAGE_ID), content);
  await fs.writeFile(contentPath(slug), content);
  await fs.writeFile(checkboxesPath(dir), JSON.stringify(checkboxes, null, 2));
  await fs.writeFile(completionTagsPath(slug), JSON.stringify(EMPTY_TAGS, null, 2));
  await fs.writeFile(mapsPath(slug), JSON.stringify(EMPTY_MAPS, null, 2));

  await withIndexLock(async () => {
    const games = await readGameIndex();
    if (games.some((game) => game.slug === slug)) {
      throw new Error('Game already exists');
    }
    games.push(meta);
    await writeGameIndex(games);
  });

  return meta;
}

export async function readContent(slug: string): Promise<string> {
  const journal = await readJournal(slug);
  const mainPage = journal.pages.find((page) => page.id === DEFAULT_MAIN_PAGE_ID);
  const pageId = mainPage?.id ?? journal.pages[0]?.id;
  if (!pageId) return '';
  return journal.contents[pageId] ?? '';
}

export async function readJournal(slug: string): Promise<FullJournalData> {
  return readJournalFromDisk(gameDir(slug));
}

export async function writeJournal(slug: string, data: FullJournalData): Promise<GameMeta> {
  const game = await getGame(slug);
  if (!game) {
    throw new Error('Game not found');
  }

  await writeJournalFiles(slug, data);
  return touchGameUpdatedAt(slug);
}

export async function readCheckboxes(slug: string): Promise<CheckboxConnectionsData> {
  try {
    const raw = await fs.readFile(checkboxesPath(gameDir(slug)), 'utf-8');
    return JSON.parse(raw) as CheckboxConnectionsData;
  } catch {
    await readJournal(slug);
    try {
      const raw = await fs.readFile(checkboxesPath(gameDir(slug)), 'utf-8');
      return JSON.parse(raw) as CheckboxConnectionsData;
    } catch {
      return EMPTY_CHECKBOXES;
    }
  }
}

export async function writeCheckboxes(
  slug: string,
  data: CheckboxConnectionsData,
): Promise<GameMeta> {
  const game = await getGame(slug);
  if (!game) {
    throw new Error('Game not found');
  }

  await fs.writeFile(checkboxesPath(gameDir(slug)), JSON.stringify(data, null, 2));
  return touchGameUpdatedAt(slug);
}

export async function writeContent(slug: string, content: string): Promise<GameMeta> {
  const game = await getGame(slug);
  if (!game) {
    throw new Error('Game not found');
  }

  await fs.writeFile(contentPath(slug), content);
  return touchGameUpdatedAt(slug);
}

export async function readCompletionTags(slug: string): Promise<CompletionTagsData> {
  try {
    const raw = await fs.readFile(completionTagsPath(slug), 'utf-8');
    return JSON.parse(raw) as CompletionTagsData;
  } catch {
    return { tags: [] };
  }
}

export async function writeCompletionTags(slug: string, data: CompletionTagsData): Promise<GameMeta> {
  const game = await getGame(slug);
  if (!game) {
    throw new Error('Game not found');
  }

  await fs.writeFile(completionTagsPath(slug), JSON.stringify(data, null, 2));
  return touchGameUpdatedAt(slug);
}

export async function readImageLibrary(slug: string): Promise<ImageLibraryData> {
  try {
    const raw = await fs.readFile(imageLibraryPath(slug), 'utf-8');
    const parsed = JSON.parse(raw) as ImageLibraryData;
    if (!Array.isArray(parsed.images)) return EMPTY_IMAGE_LIBRARY;
    return parsed;
  } catch {
    return EMPTY_IMAGE_LIBRARY;
  }
}

export async function writeImageLibrary(
  slug: string,
  data: ImageLibraryData,
): Promise<GameMeta> {
  const game = await getGame(slug);
  if (!game) {
    throw new Error('Game not found');
  }

  await fs.writeFile(imageLibraryPath(slug), JSON.stringify(data, null, 2));
  return touchGameUpdatedAt(slug);
}

export async function readMaps(slug: string): Promise<GameMapsData> {
  try {
    const raw = await fs.readFile(mapsPath(slug), 'utf-8');
    const parsed = JSON.parse(raw) as GameMapsData;
    if (!Array.isArray(parsed.maps)) return EMPTY_MAPS;
    return parsed;
  } catch {
    return EMPTY_MAPS;
  }
}

export async function writeMaps(slug: string, data: GameMapsData): Promise<GameMeta> {
  const game = await getGame(slug);
  if (!game) {
    throw new Error('Game not found');
  }

  await fs.writeFile(mapsPath(slug), JSON.stringify(data, null, 2));
  return touchGameUpdatedAt(slug);
}

export async function readMobyGamesStore(slug: string): Promise<MobyGamesStore | null> {
  try {
    const raw = await fs.readFile(mobyGamesLinkPath(slug), 'utf-8');
    const parsed = JSON.parse(raw) as MobyGamesStore;
    if (!parsed?.gameId) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeMobyGamesStore(slug: string, store: MobyGamesStore): Promise<void> {
  await fs.writeFile(mobyGamesLinkPath(slug), JSON.stringify(store, null, 2));
}

export async function readMobyGamesLink(slug: string): Promise<MobyGamesLink | null> {
  const store = await readMobyGamesStore(slug);
  if (!store) return null;
  return { gameId: store.gameId, linkedAt: store.linkedAt };
}

export async function writeMobyGamesLink(
  slug: string,
  gameId: number,
  info?: MobyGamesGameInfo,
): Promise<MobyGamesLink> {
  const game = await getGame(slug);
  if (!game) {
    throw new Error('Game not found');
  }

  const now = new Date().toISOString();
  const store: MobyGamesStore = {
    gameId,
    linkedAt: now,
    cachedInfo: info,
    cachedAt: info ? now : undefined,
  };

  await writeMobyGamesStore(slug, store);
  await touchGameUpdatedAt(slug);

  return { gameId, linkedAt: now };
}

async function writeMobyGamesCache(slug: string, info: MobyGamesGameInfo): Promise<void> {
  const store = await readMobyGamesStore(slug);
  if (!store) return;

  await writeMobyGamesStore(slug, {
    ...store,
    cachedInfo: info,
    cachedAt: new Date().toISOString(),
  });
}

export async function deleteMobyGamesLink(slug: string): Promise<void> {
  const game = await getGame(slug);
  if (!game) {
    throw new Error('Game not found');
  }

  await fs.rm(mobyGamesLinkPath(slug), { force: true });
  await touchGameUpdatedAt(slug);
}

export async function readMobyGamesInfo(
  slug: string,
  options: { refresh?: boolean } = {},
): Promise<MobyGamesGameInfo | null> {
  const store = await readMobyGamesStore(slug);
  if (!store) return null;

  if (!options.refresh && isCacheFresh(store) && store.cachedInfo) {
    return store.cachedInfo;
  }

  try {
    const info = await fetchMobyGameInfo(store.gameId);
    await writeMobyGamesCache(slug, info);
    return info;
  } catch (error) {
    if (store.cachedInfo) {
      return store.cachedInfo;
    }
    throw error;
  }
}

export async function deleteGame(slug: string): Promise<void> {
  await withIndexLock(async () => {
    const games = await readGameIndex();
    const next = games.filter((game) => game.slug !== slug);
    if (next.length === games.length) {
      throw new Error('Game not found');
    }

    await writeGameIndex(next);
  });
  await fs.rm(gameDir(slug), { recursive: true, force: true });
}

async function copyDirectory(source: string, destination: string): Promise<void> {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(from, to);
    } else {
      await fs.copyFile(from, to);
    }
  }
}

export async function duplicateGame(
  sourceSlug: string,
  newSlug: string,
  newName: string,
): Promise<GameMeta> {
  const source = await getGame(sourceSlug);
  if (!source) {
    throw new Error('Source game not found');
  }

  await copyDirectory(gameDir(sourceSlug), gameDir(newSlug));

  const now = new Date().toISOString();
  const meta: GameMeta = { slug: newSlug, name: newName, createdAt: now, updatedAt: now };

  await withIndexLock(async () => {
    const games = await readGameIndex();
    if (games.some((game) => game.slug === newSlug)) {
      throw new Error('Game already exists');
    }
    games.push(meta);
    await writeGameIndex(games);
  });

  return meta;
}

function rewriteJournalImageUrls(content: string, sourceSlug: string, targetSlug: string): string {
  if (sourceSlug === targetSlug) return content;
  return content.replaceAll(
    `/uploads/games/${sourceSlug}/images/`,
    `/uploads/games/${targetSlug}/images/`,
  );
}

function rewriteMapsImageUrls(maps: GameMapsData, sourceSlug: string, targetSlug: string): GameMapsData {
  if (sourceSlug === targetSlug) return maps;
  return {
    maps: maps.maps.map((map) => ({
      ...map,
      imageUrl: map.imageUrl.replaceAll(
        `/uploads/games/${sourceSlug}/images/`,
        `/uploads/games/${targetSlug}/images/`,
      ),
    })),
  };
}

function rewriteImageLibraryUrls(
  library: ImageLibraryData,
  sourceSlug: string,
  targetSlug: string,
): ImageLibraryData {
  if (sourceSlug === targetSlug) return library;
  return {
    images: library.images.map((entry) => ({
      ...entry,
      url: entry.url.replaceAll(
        `/uploads/games/${sourceSlug}/images/`,
        `/uploads/games/${targetSlug}/images/`,
      ),
    })),
  };
}

function mimeTypeForFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return IMAGE_MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

export async function exportGameJournal(slug: string): Promise<JournalExportBundle> {
  const game = await getGame(slug);
  if (!game) {
    throw new Error('Game not found');
  }

  const [journal, checkboxes, completionTags, maps, imageLibrary] = await Promise.all([
    readJournal(slug),
    readCheckboxes(slug),
    readCompletionTags(slug),
    readMaps(slug),
    readImageLibrary(slug),
  ]);
  let filenames: string[] = [];

  try {
    filenames = filterImageFilenames(await fs.readdir(imagesDir(slug)));
  } catch {
    filenames = [];
  }

  const images: JournalExportImage[] = await Promise.all(
    filenames.map(async (filename) => {
      const buffer = await fs.readFile(path.join(imagesDir(slug), filename));
      return {
        filename,
        mimeType: mimeTypeForFilename(filename),
        data: buffer.toString('base64'),
      };
    }),
  );

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    name: game.name,
    slug: game.slug,
    journal,
    checkboxes,
    completionTags,
    maps,
    imageLibrary,
    images,
  };
}

export async function importGameJournal(
  slug: string,
  name: string,
  bundle: {
    sourceSlug?: string;
    journal: FullJournalData;
    checkboxes: CheckboxConnectionsData;
    completionTags: CompletionTagsData;
    maps?: GameMapsData;
    imageLibrary?: ImageLibraryData;
    images: JournalExportImage[];
  },
): Promise<GameMeta> {
  const sourceSlug = bundle.sourceSlug ?? slug;
  const rewrittenContents: Record<string, string> = {};
  for (const [pageId, content] of Object.entries(bundle.journal.contents)) {
    rewrittenContents[pageId] = rewriteJournalImageUrls(content, sourceSlug, slug);
  }

  const journal: FullJournalData = {
    version: bundle.journal.version,
    pages: bundle.journal.pages,
    contents: rewrittenContents,
  };
  const checkboxes = bundle.checkboxes ?? EMPTY_CHECKBOXES;
  const completionTags = bundle.completionTags ?? EMPTY_TAGS;
  const maps = rewriteMapsImageUrls(bundle.maps ?? EMPTY_MAPS, sourceSlug, slug);
  const imageLibrary = rewriteImageLibraryUrls(bundle.imageLibrary ?? EMPTY_IMAGE_LIBRARY, sourceSlug, slug);

  const dir = gameDir(slug);
  await fs.mkdir(imagesDir(slug), { recursive: true });
  await fs.mkdir(pagesDir(dir), { recursive: true });
  await fs.writeFile(journalPath(dir), JSON.stringify({ version: journal.version, pages: journal.pages }, null, 2));

  for (const [pageId, content] of Object.entries(rewrittenContents)) {
    await fs.writeFile(pageContentPath(dir, pageId), content);
  }

  const mainContent =
    rewrittenContents[DEFAULT_MAIN_PAGE_ID] ?? rewrittenContents[journal.pages[0]?.id ?? ''] ?? '';
  await fs.writeFile(contentPath(slug), mainContent);
  await fs.writeFile(checkboxesPath(dir), JSON.stringify(checkboxes, null, 2));
  await fs.writeFile(completionTagsPath(slug), JSON.stringify(completionTags, null, 2));
  await fs.writeFile(mapsPath(slug), JSON.stringify(maps, null, 2));
  await fs.writeFile(imageLibraryPath(slug), JSON.stringify(imageLibrary, null, 2));

  for (const image of bundle.images ?? []) {
    const filename = sanitizeImportFilename(image.filename);
    if (!filename) continue;

    let buffer: Buffer;
    try {
      buffer = Buffer.from(image.data, 'base64');
    } catch {
      throw new Error(`Invalid image data for ${image.filename}`);
    }

    if (buffer.length === 0) continue;
    if (buffer.length > MAX_MEDIA_BYTES) {
      throw new Error(`Media file ${filename} exceeds the ${MAX_MEDIA_SIZE_LABEL} import limit`);
    }

    await fs.writeFile(path.join(imagesDir(slug), filename), buffer);
  }

  const now = new Date().toISOString();
  const meta: GameMeta = { slug, name, createdAt: now, updatedAt: now };

  await withIndexLock(async () => {
    const games = await readGameIndex();
    if (games.some((game) => game.slug === slug)) {
      throw new Error('Game already exists');
    }
    games.push(meta);
    await writeGameIndex(games);
  });

  return meta;
}
