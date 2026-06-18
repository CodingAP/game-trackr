import { notifyLocalDataChanged } from './localDataEvents.js';

export interface LibraryFolder {
  id: string;
  name: string;
  gameSlugs: string[];
}

export interface LibraryFoldersState {
  version: 1;
  folders: LibraryFolder[];
  collapsedFolderIds: string[];
}

const STORAGE_KEY = 'game-tracking:library-folders';

const EMPTY_STATE: LibraryFoldersState = {
  version: 1,
  folders: [],
  collapsedFolderIds: [],
};

function normalizeState(value: unknown): LibraryFoldersState {
  if (!value || typeof value !== 'object') return structuredClone(EMPTY_STATE);

  const parsed = value as Partial<LibraryFoldersState>;
  const folders = Array.isArray(parsed.folders)
    ? parsed.folders
        .filter(
          (folder): folder is LibraryFolder =>
            Boolean(folder) &&
            typeof folder === 'object' &&
            typeof folder.id === 'string' &&
            typeof folder.name === 'string' &&
            Array.isArray(folder.gameSlugs),
        )
        .map((folder) => ({
          id: folder.id,
          name: folder.name.trim() || 'Untitled folder',
          gameSlugs: folder.gameSlugs.filter((slug): slug is string => typeof slug === 'string'),
        }))
    : [];

  const collapsedFolderIds = Array.isArray(parsed.collapsedFolderIds)
    ? parsed.collapsedFolderIds.filter((id): id is string => typeof id === 'string')
    : [];

  return {
    version: 1,
    folders,
    collapsedFolderIds,
  };
}

export function getLibraryFolders(): LibraryFoldersState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(EMPTY_STATE);
    return normalizeState(JSON.parse(raw));
  } catch {
    return structuredClone(EMPTY_STATE);
  }
}

export function saveLibraryFolders(state: LibraryFoldersState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
  notifyLocalDataChanged();
}

export function createFolderId(): string {
  return `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function pruneLibraryFolders(
  state: LibraryFoldersState,
  validSlugs: Set<string>,
): LibraryFoldersState {
  return {
    ...state,
    folders: state.folders.map((folder) => ({
      ...folder,
      gameSlugs: folder.gameSlugs.filter((slug) => validSlugs.has(slug)),
    })),
  };
}

export function addLibraryFolder(name: string): LibraryFolder {
  const state = getLibraryFolders();
  const folder: LibraryFolder = {
    id: createFolderId(),
    name: name.trim() || 'New folder',
    gameSlugs: [],
  };
  state.folders.push(folder);
  saveLibraryFolders(state);
  return folder;
}

export function removeLibraryFolder(folderId: string): LibraryFoldersState {
  const state = getLibraryFolders();
  state.folders = state.folders.filter((folder) => folder.id !== folderId);
  state.collapsedFolderIds = state.collapsedFolderIds.filter((id) => id !== folderId);
  saveLibraryFolders(state);
  return state;
}

export function assignGameToFolder(slug: string, folderId: string | null): LibraryFoldersState {
  const state = getLibraryFolders();

  for (const folder of state.folders) {
    folder.gameSlugs = folder.gameSlugs.filter((entry) => entry !== slug);
  }

  if (folderId) {
    const folder = state.folders.find((entry) => entry.id === folderId);
    if (folder && !folder.gameSlugs.includes(slug)) {
      folder.gameSlugs.push(slug);
    }
  }

  saveLibraryFolders(state);
  return state;
}

export function setFolderCollapsed(folderId: string, collapsed: boolean): LibraryFoldersState {
  const state = getLibraryFolders();
  const next = new Set(state.collapsedFolderIds);

  if (collapsed) {
    next.add(folderId);
  } else {
    next.delete(folderId);
  }

  state.collapsedFolderIds = [...next];
  saveLibraryFolders(state);
  return state;
}

export function isFolderCollapsed(state: LibraryFoldersState, folderId: string): boolean {
  return state.collapsedFolderIds.includes(folderId);
}

export function getFolderForGame(
  state: LibraryFoldersState,
  slug: string,
): LibraryFolder | undefined {
  return state.folders.find((folder) => folder.gameSlugs.includes(slug));
}

export function getUncategorizedSlugs(
  state: LibraryFoldersState,
  games: { slug: string }[],
): string[] {
  const assigned = new Set(state.folders.flatMap((folder) => folder.gameSlugs));
  return games.filter((game) => !assigned.has(game.slug)).map((game) => game.slug);
}
