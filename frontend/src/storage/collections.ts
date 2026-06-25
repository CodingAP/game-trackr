import { notifyLocalDataChanged } from './localDataEvents.js';

export interface Collection {
  id: string;
  name: string;
  description?: string;
  thumbnailUrl?: string;
  gameSlugs: string[];
  createdAt: string;
}

export type CollectionSortMode = 'name' | 'created' | 'size';
export type LibraryViewMode = 'collections' | 'list';

export interface CollectionsState {
  version: 1;
  collections: Collection[];
  collapsedCollectionIds: string[];
  collectionSort: CollectionSortMode;
  viewMode: LibraryViewMode;
}

export interface CollectionsExport {
  type: 'gametrackr-collections';
  version: 1;
  exportedAt: string;
  collections: Collection[];
}

const STORAGE_KEY = 'game-tracking:collections';
const VALID_SORT_MODES = new Set<CollectionSortMode>(['name', 'created', 'size']);
const VALID_VIEW_MODES = new Set<LibraryViewMode>(['collections', 'list']);

const EMPTY_STATE: CollectionsState = {
  version: 1,
  collections: [],
  collapsedCollectionIds: [],
  collectionSort: 'name',
  viewMode: 'collections',
};

function normalizeCollection(value: unknown): Collection | null {
  if (!value || typeof value !== 'object') return null;

  const parsed = value as Partial<Collection>;
  if (typeof parsed.id !== 'string' || typeof parsed.name !== 'string') return null;

  return {
    id: parsed.id,
    name: parsed.name.trim() || 'Untitled collection',
    description:
      typeof parsed.description === 'string' && parsed.description.trim()
        ? parsed.description.trim()
        : undefined,
    thumbnailUrl:
      typeof parsed.thumbnailUrl === 'string' && parsed.thumbnailUrl.trim()
        ? parsed.thumbnailUrl.trim()
        : undefined,
    gameSlugs: Array.isArray(parsed.gameSlugs)
      ? [...new Set(parsed.gameSlugs.filter((slug): slug is string => typeof slug === 'string'))]
      : [],
    createdAt:
      typeof parsed.createdAt === 'string' && parsed.createdAt
        ? parsed.createdAt
        : new Date().toISOString(),
  };
}

function normalizeCollections(value: unknown): Collection[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeCollection(entry))
    .filter((entry): entry is Collection => entry !== null);
}

function normalizeState(value: unknown): CollectionsState {
  if (!value || typeof value !== 'object') return structuredClone(EMPTY_STATE);

  const parsed = value as Partial<CollectionsState>;
  const collections = normalizeCollections(parsed.collections);
  const collectionIds = new Set(collections.map((collection) => collection.id));

  const collapsedCollectionIds = Array.isArray(parsed.collapsedCollectionIds)
    ? parsed.collapsedCollectionIds.filter(
        (id): id is string => typeof id === 'string' && collectionIds.has(id),
      )
    : [];

  const collectionSort =
    typeof parsed.collectionSort === 'string' && VALID_SORT_MODES.has(parsed.collectionSort)
      ? parsed.collectionSort
      : EMPTY_STATE.collectionSort;

  const viewMode =
    typeof parsed.viewMode === 'string' && VALID_VIEW_MODES.has(parsed.viewMode)
      ? parsed.viewMode
      : EMPTY_STATE.viewMode;

  return {
    version: 1,
    collections,
    collapsedCollectionIds,
    collectionSort,
    viewMode,
  };
}

export function getCollections(): CollectionsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(EMPTY_STATE);
    return normalizeState(JSON.parse(raw));
  } catch {
    return structuredClone(EMPTY_STATE);
  }
}

export function saveCollections(state: CollectionsState): CollectionsState {
  const normalized = normalizeState(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  notifyLocalDataChanged();
  return normalized;
}

export function createCollectionId(): string {
  return `collection-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface CollectionInput {
  name: string;
  description?: string;
  thumbnailUrl?: string;
  gameSlugs?: string[];
}

export function createCollection(input: CollectionInput): Collection {
  const state = getCollections();
  const collection: Collection = {
    id: createCollectionId(),
    name: input.name.trim() || 'New collection',
    description: input.description?.trim() || undefined,
    thumbnailUrl: input.thumbnailUrl?.trim() || undefined,
    gameSlugs: input.gameSlugs ? [...new Set(input.gameSlugs)] : [],
    createdAt: new Date().toISOString(),
  };
  state.collections.push(collection);
  saveCollections(state);
  return collection;
}

export function updateCollection(
  collectionId: string,
  updates: Partial<CollectionInput>,
): Collection | null {
  const state = getCollections();
  const collection = state.collections.find((entry) => entry.id === collectionId);
  if (!collection) return null;

  if (updates.name !== undefined) {
    collection.name = updates.name.trim() || 'Untitled collection';
  }
  if (updates.description !== undefined) {
    collection.description = updates.description.trim() || undefined;
  }
  if (updates.thumbnailUrl !== undefined) {
    collection.thumbnailUrl = updates.thumbnailUrl.trim() || undefined;
  }
  if (updates.gameSlugs !== undefined) {
    collection.gameSlugs = [...new Set(updates.gameSlugs)];
  }

  saveCollections(state);
  return collection;
}

export function deleteCollection(collectionId: string): CollectionsState {
  const state = getCollections();
  state.collections = state.collections.filter((entry) => entry.id !== collectionId);
  state.collapsedCollectionIds = state.collapsedCollectionIds.filter((id) => id !== collectionId);
  return saveCollections(state);
}

export function setGameCollections(slug: string, collectionIds: string[]): CollectionsState {
  const state = getCollections();
  const targetIds = new Set(collectionIds);

  for (const collection of state.collections) {
    const isMember = collection.gameSlugs.includes(slug);
    const shouldBeMember = targetIds.has(collection.id);

    if (shouldBeMember && !isMember) {
      collection.gameSlugs.push(slug);
    } else if (!shouldBeMember && isMember) {
      collection.gameSlugs = collection.gameSlugs.filter((entry) => entry !== slug);
    }
  }

  return saveCollections(state);
}

export function addGameToCollection(slug: string, collectionId: string): CollectionsState {
  const state = getCollections();
  const collection = state.collections.find((entry) => entry.id === collectionId);
  if (collection && !collection.gameSlugs.includes(slug)) {
    collection.gameSlugs.push(slug);
  }
  return saveCollections(state);
}

export function removeGameFromCollection(slug: string, collectionId: string): CollectionsState {
  const state = getCollections();
  const collection = state.collections.find((entry) => entry.id === collectionId);
  if (collection) {
    collection.gameSlugs = collection.gameSlugs.filter((entry) => entry !== slug);
  }
  return saveCollections(state);
}

export function setCollapsed(collectionId: string, collapsed: boolean): CollectionsState {
  const state = getCollections();
  const next = new Set(state.collapsedCollectionIds);

  if (collapsed) {
    next.add(collectionId);
  } else {
    next.delete(collectionId);
  }

  state.collapsedCollectionIds = [...next];
  return saveCollections(state);
}

export function isCollectionCollapsed(state: CollectionsState, collectionId: string): boolean {
  return state.collapsedCollectionIds.includes(collectionId);
}

export function setCollectionSort(mode: CollectionSortMode): CollectionsState {
  const state = getCollections();
  state.collectionSort = VALID_SORT_MODES.has(mode) ? mode : state.collectionSort;
  return saveCollections(state);
}

export function setViewMode(mode: LibraryViewMode): CollectionsState {
  const state = getCollections();
  state.viewMode = VALID_VIEW_MODES.has(mode) ? mode : state.viewMode;
  return saveCollections(state);
}

export function pruneCollections(
  state: CollectionsState,
  validSlugs: Set<string>,
): CollectionsState {
  return {
    ...state,
    collections: state.collections.map((collection) => ({
      ...collection,
      gameSlugs: collection.gameSlugs.filter((slug) => validSlugs.has(slug)),
    })),
  };
}

export function getCollectionsForGame(state: CollectionsState, slug: string): Collection[] {
  return state.collections.filter((collection) => collection.gameSlugs.includes(slug));
}

export function getUncategorizedSlugs(
  state: CollectionsState,
  games: { slug: string }[],
): string[] {
  const assigned = new Set(state.collections.flatMap((collection) => collection.gameSlugs));
  return games.filter((game) => !assigned.has(game.slug)).map((game) => game.slug);
}

export function sortCollections(
  collections: Collection[],
  mode: CollectionSortMode,
): Collection[] {
  const compareName = (left: Collection, right: Collection): number =>
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });

  return [...collections].sort((left, right) => {
    let compare = 0;
    switch (mode) {
      case 'name':
        compare = compareName(left, right);
        break;
      case 'created':
        compare = right.createdAt.localeCompare(left.createdAt);
        break;
      case 'size':
        compare = right.gameSlugs.length - left.gameSlugs.length;
        break;
    }

    if (compare === 0) {
      compare = compareName(left, right);
    }

    return compare;
  });
}

export function buildCollectionsExport(): CollectionsExport {
  const state = getCollections();
  return {
    type: 'gametrackr-collections',
    version: 1,
    exportedAt: new Date().toISOString(),
    collections: state.collections,
  };
}

export function exportCollectionsFile(): void {
  const payload = buildCollectionsExport();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `gametrackr-collections-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function parseCollectionsImport(json: string): Collection[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid collections file format.');
  }

  const record = parsed as Record<string, unknown>;
  const rawCollections = Array.isArray(record.collections)
    ? record.collections
    : Array.isArray(parsed)
      ? (parsed as unknown[])
      : null;

  if (!rawCollections) {
    throw new Error('No collections found in file.');
  }

  const collections = normalizeCollections(rawCollections);
  if (collections.length === 0) {
    throw new Error('No collections found in file.');
  }

  return collections;
}

export function importCollectionsFile(
  json: string,
  options: { merge?: boolean } = {},
): CollectionsState {
  const incoming = parseCollectionsImport(json);
  const merge = options.merge ?? true;
  const state = getCollections();

  if (!merge) {
    state.collections = incoming;
    state.collapsedCollectionIds = [];
    return saveCollections(state);
  }

  const byId = new Map(state.collections.map((collection) => [collection.id, collection]));

  for (const incomingCollection of incoming) {
    const existing = byId.get(incomingCollection.id);
    if (existing) {
      existing.name = incomingCollection.name;
      existing.description = incomingCollection.description;
      existing.thumbnailUrl = incomingCollection.thumbnailUrl;
      existing.gameSlugs = [
        ...new Set([...existing.gameSlugs, ...incomingCollection.gameSlugs]),
      ];
    } else {
      state.collections.push(incomingCollection);
      byId.set(incomingCollection.id, incomingCollection);
    }
  }

  return saveCollections(state);
}
