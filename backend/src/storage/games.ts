import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CompletionTagsData,
  GameMeta,
  JournalExportBundle,
  JournalExportImage,
  MobyGamesLink,
} from '../types.js';
import type { MobyGamesGameInfo } from '../services/mobygames.js';
import { fetchMobyGameInfo } from '../services/mobygames.js';
import { filterImageFilenames, sanitizeImportFilename } from './imageFiles.js';

interface MobyGamesStore extends MobyGamesLink {
  cachedInfo?: MobyGamesGameInfo;
  cachedAt?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, '../../data/games');
const INDEX_PATH = path.join(DATA_DIR, 'index.json');
const EMPTY_TAGS: CompletionTagsData = { tags: [] };
const DEFAULT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_IMPORT_IMAGE_BYTES = 5 * 1024 * 1024;

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

async function writeGameIndex(games: GameMeta[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(INDEX_PATH, JSON.stringify(games, null, 2));
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
  content = '# New Game\n\n- [ ] Add your first goal\n',
): Promise<GameMeta> {
  const games = await readGameIndex();
  if (games.some((game) => game.slug === slug)) {
    throw new Error('Game already exists');
  }

  const now = new Date().toISOString();
  const meta: GameMeta = { slug, name, createdAt: now, updatedAt: now };

  await fs.mkdir(imagesDir(slug), { recursive: true });
  await fs.writeFile(contentPath(slug), content);
  await fs.writeFile(completionTagsPath(slug), JSON.stringify(EMPTY_TAGS, null, 2));
  games.push(meta);
  await writeGameIndex(games);

  return meta;
}

export async function readContent(slug: string): Promise<string> {
  return fs.readFile(contentPath(slug), 'utf-8');
}

export async function writeContent(slug: string, content: string): Promise<GameMeta> {
  const games = await readGameIndex();
  const index = games.findIndex((game) => game.slug === slug);
  if (index === -1) {
    throw new Error('Game not found');
  }

  await fs.writeFile(contentPath(slug), content);
  games[index] = { ...games[index], updatedAt: new Date().toISOString() };
  await writeGameIndex(games);

  return games[index];
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

  const games = await readGameIndex();
  const index = games.findIndex((entry) => entry.slug === slug);
  games[index] = { ...games[index], updatedAt: new Date().toISOString() };
  await writeGameIndex(games);

  return games[index];
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

  const games = await readGameIndex();
  const index = games.findIndex((entry) => entry.slug === slug);
  games[index] = { ...games[index], updatedAt: now };
  await writeGameIndex(games);

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

  const games = await readGameIndex();
  const index = games.findIndex((entry) => entry.slug === slug);
  games[index] = { ...games[index], updatedAt: new Date().toISOString() };
  await writeGameIndex(games);
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
  const games = await readGameIndex();
  const next = games.filter((game) => game.slug !== slug);
  if (next.length === games.length) {
    throw new Error('Game not found');
  }

  await writeGameIndex(next);
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

  const games = await readGameIndex();
  if (games.some((game) => game.slug === newSlug)) {
    throw new Error('Game already exists');
  }

  await copyDirectory(gameDir(sourceSlug), gameDir(newSlug));

  const now = new Date().toISOString();
  const meta: GameMeta = { slug: newSlug, name: newName, createdAt: now, updatedAt: now };
  games.push(meta);
  await writeGameIndex(games);

  return meta;
}

function rewriteJournalImageUrls(content: string, sourceSlug: string, targetSlug: string): string {
  if (sourceSlug === targetSlug) return content;
  return content.replaceAll(
    `/uploads/games/${sourceSlug}/images/`,
    `/uploads/games/${targetSlug}/images/`,
  );
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

  const content = await readContent(slug);
  const completionTags = await readCompletionTags(slug);
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
    version: 1,
    exportedAt: new Date().toISOString(),
    name: game.name,
    slug: game.slug,
    content,
    completionTags,
    images,
  };
}

export async function importGameJournal(
  slug: string,
  name: string,
  bundle: {
    sourceSlug?: string;
    content: string;
    completionTags: CompletionTagsData;
    images: JournalExportImage[];
  },
): Promise<GameMeta> {
  const games = await readGameIndex();
  if (games.some((game) => game.slug === slug)) {
    throw new Error('Game already exists');
  }

  const sourceSlug = bundle.sourceSlug ?? slug;
  const content = rewriteJournalImageUrls(bundle.content, sourceSlug, slug);
  const completionTags = bundle.completionTags ?? EMPTY_TAGS;

  await fs.mkdir(imagesDir(slug), { recursive: true });
  await fs.writeFile(contentPath(slug), content);
  await fs.writeFile(completionTagsPath(slug), JSON.stringify(completionTags, null, 2));

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
    if (buffer.length > MAX_IMPORT_IMAGE_BYTES) {
      throw new Error(`Image ${filename} exceeds the 5 MB import limit`);
    }

    await fs.writeFile(path.join(imagesDir(slug), filename), buffer);
  }

  const now = new Date().toISOString();
  const meta: GameMeta = { slug, name, createdAt: now, updatedAt: now };
  games.push(meta);
  await writeGameIndex(games);

  return meta;
}
