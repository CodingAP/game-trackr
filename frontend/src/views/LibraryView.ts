import {
  deleteGame,
  fetchCheckboxConnections,
  fetchGames,
  fetchMobyGamesForGame,
} from '../api/client.js';
import { renderImportGameControls, wireImportGameButton } from '../components/ImportGameButton.js';
import { renderCollapsiblePanel, wireCollapsiblePanels } from '../components/CollapsiblePanel.js';
import { openFolderDeleteDialog } from '../components/FolderDeleteDialog.js';
import { renderLibraryMobyHtml } from '../components/GameInfoPanel.js';
import { getProgressCheckboxes, isCheckboxComplete, buildCheckboxIndex } from '../markdown/checkboxes.js';
import { managedToCheckboxItems } from '../markdown/managedCheckboxes.js';
import { isLocallyAuthenticated } from '../storage/auth.js';
import {
  addLibraryFolder,
  assignGameToFolder,
  getFolderForGame,
  getLibraryFolders,
  getUncategorizedSlugs,
  isFolderCollapsed,
  pruneLibraryFolders,
  removeLibraryFolder,
  renameLibraryFolder,
  saveLibraryFolders,
  setFolderCollapsed,
  type LibraryFolder,
  type LibraryFoldersState,
} from '../storage/libraryFolders.js';
import {
  getSectionSortMode,
  setSectionSortMode,
  sortGameSlugs,
  type GameSortMeta,
  type LibrarySortMode,
} from '../storage/librarySort.js';
import { getProgress } from '../storage/progress.js';
import { navigate } from '../router.js';
import { icon, iconLabel } from '../components/icons.js';
import type { GameMeta } from '../types/index.js';
import { getEarliestReleaseSortKey } from '../utils/mobyReleaseDate.js';

interface GameCardData {
  slug: string;
  name: string;
  progressLabel: string;
  mobyHtml: string;
  releaseDateSortKey: number;
}

const LIBRARY_SORT_SECTION = 'library';

function renderLibrarySortSelect(sectionId: string, currentMode: LibrarySortMode): string {
  const options: { value: LibrarySortMode; label: string }[] = [
    { value: 'name', label: 'Name' },
    { value: 'release-date', label: 'Release date' },
    { value: 'added', label: 'Date added' },
  ];

  return `
    <label class="library-sort">
      <span class="label library-sort-label">Sort</span>
      <select class="input library-sort-select" data-library-sort="${escapeHtml(sectionId)}" aria-label="Sort games">
        ${options
          .map(
            (option) =>
              `<option value="${option.value}" ${option.value === currentMode ? 'selected' : ''}>${option.label}</option>`,
          )
          .join('')}
      </select>
    </label>
  `;
}

function buildSortMeta(games: GameMeta[], cards: Map<string, GameCardData>): Map<string, GameSortMeta> {
  const meta = new Map<string, GameSortMeta>();

  for (const game of games) {
    const card = cards.get(game.slug);
    meta.set(game.slug, {
      slug: game.slug,
      name: card?.name ?? game.name,
      createdAt: game.createdAt,
      releaseDateSortKey: card?.releaseDateSortKey ?? Number.MAX_SAFE_INTEGER,
    });
  }

  return meta;
}

function sortSlugsForSection(
  slugs: string[],
  sectionId: string,
  sortMeta: Map<string, GameSortMeta>,
): string[] {
  return sortGameSlugs(slugs, sortMeta, getSectionSortMode(sectionId));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderLibraryHeaderActions(signedIn: boolean, showFolderControls: boolean): string {
  const folderControls = signedIn && showFolderControls
    ? `
      <div class="library-add-folder">
        <input type="text" id="library-folder-name" class="input" placeholder="New folder name" aria-label="New folder name" />
        <button type="button" id="library-add-folder" class="btn-secondary">${iconLabel('plus', 'Add folder')}</button>
      </div>
    `
    : '';

  if (!signedIn) return folderControls;

  return `
    <div class="library-header-actions">
      ${folderControls}
      ${renderImportGameControls()}
      <button type="button" id="create-game" class="btn-primary">${iconLabel('plus', 'Create Game')}</button>
    </div>
  `;
}

function renderEmptyLibrary(signedIn: boolean): string {
  if (!signedIn) {
    return `
      <div class="app-shell">
        <div class="panel">
          <h2 class="text-xl font-semibold mb-2">No games yet</h2>
          <p class="text-muted">Sign in from the menu to create or import game journals.</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="app-shell">
      <div class="panel">
        <h2 class="text-xl font-semibold mb-2">No games yet</h2>
        <p class="text-muted mb-4">Create your first game journal to get started.</p>
        <div class="library-header-actions">
          ${renderImportGameControls()}
          <button type="button" id="create-first" class="btn-primary">${iconLabel('plus', 'Create Game')}</button>
        </div>
      </div>
    </div>
  `;
}

async function buildGameCards(games: GameMeta[]): Promise<Map<string, GameCardData>> {
  const cards = await Promise.all(
    games.map(async (game) => {
      let progressLabel = 'No progress yet';
      let mobyHtml = '';
      let releaseDateSortKey = Number.MAX_SAFE_INTEGER;

      const [checkboxesResult, mobyResult] = await Promise.allSettled([
        fetchCheckboxConnections(game.slug),
        fetchMobyGamesForGame(game.slug),
      ]);

      if (mobyResult.status === 'fulfilled' && mobyResult.value.info) {
        mobyHtml = renderLibraryMobyHtml(mobyResult.value.info);
        releaseDateSortKey = getEarliestReleaseSortKey(mobyResult.value.info);
      }

      if (checkboxesResult.status === 'fulfilled') {
        try {
          const checkboxes = managedToCheckboxItems(checkboxesResult.value.checkboxes);
          const progressCheckboxes = getProgressCheckboxes(checkboxes);
          const progress = getProgress(game.slug);
          const index = buildCheckboxIndex(checkboxes);
          const completed = progressCheckboxes.filter((item) =>
            isCheckboxComplete(item.id, index, progress.checkedItems),
          ).length;
          progressLabel =
            progressCheckboxes.length === 0
              ? 'No checkboxes'
              : `${completed} / ${progressCheckboxes.length} complete`;
        } catch {
          progressLabel = 'Content unavailable';
        }
      } else {
        progressLabel = 'Content unavailable';
      }

      return {
        slug: game.slug,
        name: game.name,
        progressLabel,
        mobyHtml,
        releaseDateSortKey,
      } satisfies GameCardData;
    }),
  );

  return new Map(cards.map((card) => [card.slug, card]));
}

function renderFolderMoveSelect(
  slug: string,
  folders: LibraryFolder[],
  currentFolderId: string | null,
): string {
  const options = [
    `<option value="" ${currentFolderId ? '' : 'selected'}>Uncategorized</option>`,
    ...folders.map(
      (folder) =>
        `<option value="${escapeHtml(folder.id)}" ${folder.id === currentFolderId ? 'selected' : ''}>${escapeHtml(folder.name)}</option>`,
    ),
  ];

  return `
    <label class="block">
      <span class="label">Folder</span>
      <select class="input" data-move-game="${escapeHtml(slug)}">
        ${options.join('')}
      </select>
    </label>
  `;
}

function renderGameCard(
  card: GameCardData,
  signedIn: boolean,
  folders: LibraryFolder[],
  folderState: LibraryFoldersState,
): string {
  const editButton = signedIn
    ? `<button type="button" class="btn-secondary" data-edit="${escapeHtml(card.slug)}">${iconLabel('edit', 'Edit')}</button>`
    : '';

  const folderSelect = signedIn && folders.length > 0
    ? renderFolderMoveSelect(card.slug, folders, getFolderForGame(folderState, card.slug)?.id ?? null)
    : '';

  return renderCollapsiblePanel({
    title: card.name,
    className: 'library-game-card',
    content: `
      <div class="flex flex-col gap-3">
        ${card.mobyHtml}
        <p class="text-sm text-status">${escapeHtml(card.progressLabel)}</p>
        ${folderSelect}
        <div class="library-game-actions mt-auto">
          <button type="button" class="btn-primary" data-view="${escapeHtml(card.slug)}">${iconLabel('eye', 'View')}</button>
          ${editButton}
        </div>
      </div>
    `,
  });
}

function renderGameGrid(
  slugs: string[],
  cards: Map<string, GameCardData>,
  signedIn: boolean,
  folders: LibraryFolder[],
  folderState: LibraryFoldersState,
): string {
  const rendered = slugs
    .map((slug) => cards.get(slug))
    .filter((card): card is GameCardData => Boolean(card))
    .map((card) => renderGameCard(card, signedIn, folders, folderState));

  if (rendered.length === 0) {
    return '<p class="text-faint text-sm">No games in this folder.</p>';
  }

  return `<div class="library-game-grid">${rendered.join('')}</div>`;
}

function renderFolderSection(
  folder: LibraryFolder,
  cards: Map<string, GameCardData>,
  signedIn: boolean,
  folders: LibraryFolder[],
  folderState: LibraryFoldersState,
  sortMeta: Map<string, GameSortMeta>,
): string {
  const sortedSlugs = sortSlugsForSection(folder.gameSlugs, folder.id, sortMeta);
  const count = sortedSlugs.length;
  const collapsed = isFolderCollapsed(folderState, folder.id);
  const sortMode = getSectionSortMode(folder.id);
  const folderActions = signedIn
    ? `
      <button type="button" class="btn-secondary" data-rename-folder="${escapeHtml(folder.id)}" aria-label="Rename folder">${icon('edit', 'ui-icon ui-icon-sm')}</button>
      <button type="button" class="btn-secondary" data-delete-folder="${escapeHtml(folder.id)}" aria-label="Delete folder">${icon('trash', 'ui-icon ui-icon-sm')}</button>
    `
    : '';
  const titleActions = `
    ${renderLibrarySortSelect(folder.id, sortMode)}
    ${folderActions}
  `;

  return renderCollapsiblePanel({
    title: folder.name,
    className: 'library-folder-panel',
    defaultOpen: !collapsed,
    attributes: {
      'library-folder-id': folder.id,
    },
    titleHtml: `
      <span class="library-folder-title">${icon('library', 'ui-icon ui-icon-sm library-folder-icon')}${escapeHtml(folder.name)}</span>
      <span class="library-folder-count">${count}</span>
    `,
    titleActions,
    content: renderGameGrid(sortedSlugs, cards, signedIn, folders, folderState),
  });
}

function renderUncategorizedSection(
  slugs: string[],
  cards: Map<string, GameCardData>,
  signedIn: boolean,
  folders: LibraryFolder[],
  folderState: LibraryFoldersState,
  hasFolders: boolean,
  sortMeta: Map<string, GameSortMeta>,
): string {
  if (slugs.length === 0) return '';

  const sectionId = hasFolders ? 'uncategorized' : LIBRARY_SORT_SECTION;
  const sortedSlugs = sortSlugsForSection(slugs, sectionId, sortMeta);
  const content = renderGameGrid(sortedSlugs, cards, signedIn, folders, folderState);
  if (!hasFolders) return content;

  const collapsed = isFolderCollapsed(folderState, sectionId);
  const sortMode = getSectionSortMode(sectionId);

  return renderCollapsiblePanel({
    title: 'Uncategorized',
    className: 'library-folder-panel library-folder-panel-uncategorized',
    defaultOpen: !collapsed,
    attributes: {
      'library-folder-id': sectionId,
    },
    titleHtml: `
      <span class="library-folder-title">${escapeHtml('Uncategorized')}</span>
      <span class="library-folder-count">${sortedSlugs.length}</span>
    `,
    titleActions: renderLibrarySortSelect(sectionId, sortMode),
    content,
  });
}

function renderLibraryBody(options: {
  games: GameMeta[];
  cards: Map<string, GameCardData>;
  signedIn: boolean;
  folderState: LibraryFoldersState;
}): string {
  const { games, cards, signedIn, folderState } = options;
  const folders = folderState.folders;
  const hasFolders = folders.length > 0;
  const sortMeta = buildSortMeta(games, cards);
  const uncategorizedSlugs = getUncategorizedSlugs(folderState, games);

  const folderSections = folders
    .map((folder) => renderFolderSection(folder, cards, signedIn, folders, folderState, sortMeta))
    .join('');

  const uncategorizedSection = renderUncategorizedSection(
    uncategorizedSlugs,
    cards,
    signedIn,
    folders,
    folderState,
    hasFolders,
    sortMeta,
  );

  if (!hasFolders) {
    return uncategorizedSection;
  }

  return `
    <div class="library-folder-list space-y-4">
      ${folderSections}
      ${uncategorizedSection}
    </div>
  `;
}

export async function renderLibrary(container: HTMLElement): Promise<() => void> {
  container.innerHTML = '<div class="app-shell"><p class="text-muted">Loading games...</p></div>';
  const signedIn = isLocallyAuthenticated();

  try {
    let games = await fetchGames();

    if (games.length === 0) {
      container.innerHTML = renderEmptyLibrary(signedIn);

      if (signedIn) {
        const onCreateFirst = () => navigate('/editor');
        container.querySelector('#create-first')?.addEventListener('click', onCreateFirst);
        const cleanupImport = wireImportGameButton(container);
        return () => {
          cleanupImport();
          container.querySelector('#create-first')?.removeEventListener('click', onCreateFirst);
        };
      }

      return () => {};
    }

    const validSlugs = new Set(games.map((game) => game.slug));
    let folderState = pruneLibraryFolders(getLibraryFolders(), validSlugs);
    if (JSON.stringify(folderState) !== JSON.stringify(getLibraryFolders())) {
      saveLibraryFolders(folderState);
    }

    const cards = await buildGameCards(games);
    let cleanupCollapsible = () => {};
    let cleanupImport = () => {};

    const onAddFolderKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        container.querySelector('#library-add-folder')?.dispatchEvent(new Event('click'));
      }
    };

    const deleteFolder = async (folderId: string) => {
      const folder = folderState.folders.find((entry) => entry.id === folderId);
      if (!folder) return;

      const choice = await openFolderDeleteDialog(folder.name, folder.gameSlugs.length);
      if (choice === 'cancel') return;

      if (choice === 'folder-and-games') {
        try {
          for (const slug of folder.gameSlugs) {
            await deleteGame(slug);
          }
          removeLibraryFolder(folderId);
          games = await fetchGames();
          const nextValidSlugs = new Set(games.map((game) => game.slug));
          folderState = pruneLibraryFolders(getLibraryFolders(), nextValidSlugs);
          saveLibraryFolders(folderState);
          if (games.length === 0) {
            container.innerHTML = renderEmptyLibrary(signedIn);
            if (signedIn) {
              container.querySelector('#create-first')?.addEventListener('click', () => navigate('/editor'));
              cleanupImport = wireImportGameButton(container);
            }
            return;
          }
          const nextCards = await buildGameCards(games);
          cards.clear();
          for (const [slug, card] of nextCards) {
            cards.set(slug, card);
          }
          paint();
        } catch (error) {
          window.alert(error instanceof Error ? error.message : 'Failed to delete folder');
        }
        return;
      }

      removeLibraryFolder(folderId);
      folderState = getLibraryFolders();
      paint();
    };

    const wireInteractions = () => {
      cleanupCollapsible();
      cleanupCollapsible = wireCollapsiblePanels(container, {
        onToggle: (panel, expanded) => {
          const folderId = panel.dataset.libraryFolderId;
          if (!folderId) return;
          setFolderCollapsed(folderId, !expanded);
        },
      });

      const onCreate = () => navigate('/editor');
      container.querySelector('#create-game')?.removeEventListener('click', onCreate);
      container.querySelector('#create-game')?.addEventListener('click', onCreate);

      const onView = (event: Event) => {
        const slug = (event.currentTarget as HTMLElement).dataset.view;
        if (slug) navigate(`/viewer/${slug}`);
      };

      const onEdit = (event: Event) => {
        const slug = (event.currentTarget as HTMLElement).dataset.edit;
        if (slug) navigate(`/editor/${slug}`);
      };

      container.querySelectorAll('[data-view]').forEach((button) => {
        button.removeEventListener('click', onView);
        button.addEventListener('click', onView);
      });
      container.querySelectorAll('[data-edit]').forEach((button) => {
        button.removeEventListener('click', onEdit);
        button.addEventListener('click', onEdit);
      });

      const onAddFolder = () => {
        const addFolderInput = container.querySelector('#library-folder-name') as HTMLInputElement | null;
        const name = addFolderInput?.value.trim();
        if (!name) {
          addFolderInput?.focus();
          return;
        }
        addLibraryFolder(name);
        if (addFolderInput) addFolderInput.value = '';
        folderState = getLibraryFolders();
        paint();
      };

      const addFolderButton = container.querySelector('#library-add-folder');
      addFolderButton?.removeEventListener('click', onAddFolder);
      addFolderButton?.addEventListener('click', onAddFolder);

      const addFolderInput = container.querySelector('#library-folder-name');
      addFolderInput?.removeEventListener('keydown', onAddFolderKeyDown);
      addFolderInput?.addEventListener('keydown', onAddFolderKeyDown);

      container.querySelectorAll('[data-move-game]').forEach((select) => {
        const element = select as HTMLSelectElement;
        const handler = () => {
          const slug = element.dataset.moveGame;
          if (!slug) return;
          assignGameToFolder(slug, element.value || null);
          folderState = getLibraryFolders();
          paint();
        };
        element.removeEventListener('change', handler);
        element.addEventListener('change', handler);
      });

      container.querySelectorAll('[data-rename-folder]').forEach((button) => {
        const handler = () => {
          const folderId = (button as HTMLElement).dataset.renameFolder ?? '';
          const folder = folderState.folders.find((entry) => entry.id === folderId);
          if (!folder) return;

          const nextName = window.prompt('Folder name:', folder.name);
          if (nextName === null) return;

          const trimmed = nextName.trim();
          if (!trimmed || trimmed === folder.name) return;

          renameLibraryFolder(folderId, trimmed);
          folderState = getLibraryFolders();
          paint();
        };
        button.removeEventListener('click', handler);
        button.addEventListener('click', handler);
      });

      container.querySelectorAll('[data-delete-folder]').forEach((button) => {
        const handler = () => {
          void deleteFolder((button as HTMLElement).dataset.deleteFolder ?? '');
        };
        button.removeEventListener('click', handler);
        button.addEventListener('click', handler);
      });

      container.querySelectorAll('[data-library-sort]').forEach((select) => {
        const element = select as HTMLSelectElement;
        const handler = () => {
          const sectionId = element.dataset.librarySort;
          if (!sectionId) return;
          setSectionSortMode(sectionId, element.value as LibrarySortMode);
          paint();
        };
        element.removeEventListener('change', handler);
        element.addEventListener('change', handler);
      });
    };

    const paint = () => {
      const body = renderLibraryBody({ games, cards, signedIn, folderState });
      const hasFolders = folderState.folders.length > 0;
      const librarySortHtml = hasFolders
        ? ''
        : renderLibrarySortSelect(LIBRARY_SORT_SECTION, getSectionSortMode(LIBRARY_SORT_SECTION));
      const libraryBody = container.querySelector('#library-body');
      if (libraryBody) {
        libraryBody.innerHTML = body;
        const sortHost = container.querySelector('#library-sort-host');
        if (sortHost) {
          sortHost.innerHTML = librarySortHtml;
        }
        wireInteractions();
        return;
      }

      container.innerHTML = `
        <div class="app-shell">
          <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 class="page-heading mb-1">Game Library</h1>
              <p class="text-muted">Pick a journal to track your completion progress.</p>
              <div id="library-sort-host" class="library-sort-host">${librarySortHtml}</div>
            </div>
            ${renderLibraryHeaderActions(signedIn, true)}
          </div>
          <div id="library-body">${body}</div>
        </div>
      `;

      wireInteractions();
      if (signedIn) {
        cleanupImport = wireImportGameButton(container);
      }
    };

    paint();

    return () => {
      cleanupCollapsible();
      cleanupImport();
    };
  } catch (error) {
    container.innerHTML = `
      <div class="app-shell">
        <div class="panel border-red-500/40">
          <h2 class="text-xl font-semibold mb-2">Failed to load games</h2>
          <p class="text-muted">${escapeHtml(error instanceof Error ? error.message : 'Unknown error')}</p>
        </div>
      </div>
    `;
    return () => {};
  }
}
