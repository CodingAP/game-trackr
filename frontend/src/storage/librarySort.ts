import { notifyLocalDataChanged } from './localDataEvents.js';

export type LibrarySortMode = 'name' | 'release-date' | 'added';

export interface GameSortMeta {
  slug: string;
  name: string;
  createdAt: string;
  releaseDateSortKey: number;
}

export interface LibrarySortSettings {
  version: 1;
  defaultSort: LibrarySortMode;
  sectionSort: Partial<Record<string, LibrarySortMode>>;
}

const STORAGE_KEY = 'game-tracking:library-sort';

const DEFAULT_SETTINGS: LibrarySortSettings = {
  version: 1,
  defaultSort: 'name',
  sectionSort: {},
};

const VALID_MODES = new Set<LibrarySortMode>(['name', 'release-date', 'added']);

function normalizeMode(value: unknown, fallback: LibrarySortMode): LibrarySortMode {
  return typeof value === 'string' && VALID_MODES.has(value as LibrarySortMode)
    ? (value as LibrarySortMode)
    : fallback;
}

function normalizeSettings(value: unknown): LibrarySortSettings {
  if (!value || typeof value !== 'object') return structuredClone(DEFAULT_SETTINGS);

  const parsed = value as Partial<LibrarySortSettings>;
  const defaultSort = normalizeMode(parsed.defaultSort, DEFAULT_SETTINGS.defaultSort);
  const sectionSort: Partial<Record<string, LibrarySortMode>> = {};

  if (parsed.sectionSort && typeof parsed.sectionSort === 'object') {
    for (const [sectionId, mode] of Object.entries(parsed.sectionSort)) {
      if (typeof sectionId !== 'string') continue;
      sectionSort[sectionId] = normalizeMode(mode, defaultSort);
    }
  }

  return {
    version: 1,
    defaultSort,
    sectionSort,
  };
}

export function getLibrarySortSettings(): LibrarySortSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveLibrarySortSettings(settings: LibrarySortSettings): LibrarySortSettings {
  const normalized = normalizeSettings(settings);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  notifyLocalDataChanged();
  return normalized;
}

export function getSectionSortMode(sectionId: string): LibrarySortMode {
  const settings = getLibrarySortSettings();
  return settings.sectionSort[sectionId] ?? settings.defaultSort;
}

export function setSectionSortMode(sectionId: string, mode: LibrarySortMode): LibrarySortSettings {
  const settings = getLibrarySortSettings();
  settings.sectionSort[sectionId] = normalizeMode(mode, settings.defaultSort);
  return saveLibrarySortSettings(settings);
}

export function sortGameSlugs(
  slugs: string[],
  metaBySlug: Map<string, GameSortMeta>,
  mode: LibrarySortMode,
): string[] {
  const compareName = (left: GameSortMeta, right: GameSortMeta): number =>
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });

  return [...slugs].sort((leftSlug, rightSlug) => {
    const left = metaBySlug.get(leftSlug);
    const right = metaBySlug.get(rightSlug);
    if (!left || !right) return 0;

    let compare = 0;
    switch (mode) {
      case 'name':
        compare = compareName(left, right);
        break;
      case 'added':
        compare = right.createdAt.localeCompare(left.createdAt);
        break;
      case 'release-date':
        compare = left.releaseDateSortKey - right.releaseDateSortKey;
        break;
    }

    if (compare === 0) {
      compare = compareName(left, right);
    }

    return compare;
  });
}
