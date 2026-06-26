import {
  fetchCheckboxConnections,
  fetchGames,
  fetchMobyGamesForGame,
} from '../api/client.js';
import { renderImportGameControls, wireImportGameButton } from '../components/ImportGameButton.js';
import { renderCollapsiblePanel, wireCollapsiblePanels } from '../components/CollapsiblePanel.js';
import { openCollectionEditDialog } from '../components/CollectionEditDialog.js';
import { openCollectionMembershipDialog } from '../components/CollectionMembershipDialog.js';
import { renderLibraryMobyHtml } from '../components/GameInfoPanel.js';
import { getProgressCheckboxes, isCheckboxComplete, buildCheckboxIndex } from '../markdown/checkboxes.js';
import { managedToCheckboxItems } from '../markdown/managedCheckboxes.js';
import { isLocallyAuthenticated } from '../storage/auth.js';
import {
  createCollection,
  deleteCollection,
  getCollections,
  getUncategorizedSlugs,
  isCollectionCollapsed,
  pruneCollections,
  saveCollections,
  setCollapsed,
  setCollectionSort,
  setViewMode,
  sortCollections,
  updateCollection,
  type Collection,
  type CollectionSortMode,
  type CollectionsState,
  type LibraryViewMode,
} from '../storage/collections.js';
import {
  getSectionSortMode,
  setSectionSortMode,
  sortGameSlugs,
  type GameSortMeta,
  type LibrarySortMode,
} from '../storage/librarySort.js';
import { getProgress } from '../storage/progress.js';
import { getPlaytime, getTotalPlaytimeMinutes } from '../storage/playtime.js';
import { navigate } from '../router.js';
import { icon, iconLabel } from '../components/icons.js';
import type { GameMeta } from '../types/index.js';
import { getEarliestReleaseSortKey } from '../utils/mobyReleaseDate.js';
import { formatPlaytimeDuration } from '../utils/playtimeFormat.js';

interface GameCardData {
  slug: string;
  name: string;
  mobyHtml: string;
  releaseDateSortKey: number;
  completedCount: number;
  totalCount: number;
  contentAvailable: boolean;
  playtimeMinutes: number;
}

const LIST_SORT_SECTION = 'list';
const UNCATEGORIZED_SECTION = 'uncategorized';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

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

function renderCollectionSortSelect(currentMode: CollectionSortMode): string {
  const options: { value: CollectionSortMode; label: string }[] = [
    { value: 'name', label: 'Name' },
    { value: 'created', label: 'Date created' },
    { value: 'size', label: 'Size' },
  ];

  return `
    <label class="library-sort">
      <span class="label library-sort-label">Collections</span>
      <select class="input library-sort-select" data-collection-sort aria-label="Sort collections">
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

function renderViewToggle(viewMode: LibraryViewMode): string {
  const button = (mode: LibraryViewMode, iconName: 'collection' | 'list', label: string) => `
    <button
      type="button"
      class="library-view-toggle-btn ${viewMode === mode ? 'is-active' : ''}"
      data-view-mode="${mode}"
      aria-pressed="${viewMode === mode}"
    >${iconLabel(iconName, label)}</button>
  `;

  return `
    <div class="library-view-toggle" role="group" aria-label="Library view">
      ${button('collections', 'collection', 'Collections')}
      ${button('list', 'list', 'All games')}
    </div>
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

function renderLibraryHeaderActions(signedIn: boolean): string {
  if (!signedIn) return '';

  return `
    <div class="library-header-actions">
      <button type="button" id="library-add-collection" class="btn-secondary">${iconLabel('plus', 'New collection')}</button>
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
      let mobyHtml = '';
      let releaseDateSortKey = Number.MAX_SAFE_INTEGER;
      let completedCount = 0;
      let totalCount = 0;
      let contentAvailable = false;

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
          completedCount = progressCheckboxes.filter((item) =>
            isCheckboxComplete(item.id, index, progress.checkedItems),
          ).length;
          totalCount = progressCheckboxes.length;
          contentAvailable = true;
        } catch {
          contentAvailable = false;
        }
      }

      const playtimeMinutes = getTotalPlaytimeMinutes(getPlaytime(game.slug).entries);

      return {
        slug: game.slug,
        name: game.name,
        mobyHtml,
        releaseDateSortKey,
        completedCount,
        totalCount,
        contentAvailable,
        playtimeMinutes,
      } satisfies GameCardData;
    }),
  );

  return new Map(cards.map((card) => [card.slug, card]));
}

function renderProgressCircle(percent: number): string {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference * (1 - clamped / 100);

  return `
    <svg class="progress-ring" viewBox="0 0 44 44" role="img" aria-label="${clamped}% complete">
      <circle class="progress-ring-track" cx="22" cy="22" r="${radius}" fill="none" stroke-width="4" />
      <circle
        class="progress-ring-fill"
        cx="22"
        cy="22"
        r="${radius}"
        fill="none"
        stroke-width="4"
        stroke-linecap="round"
        stroke-dasharray="${circumference.toFixed(2)}"
        stroke-dashoffset="${offset.toFixed(2)}"
        transform="rotate(-90 22 22)"
      />
      <text class="progress-ring-text" x="22" y="22" text-anchor="middle" dominant-baseline="central">${clamped}%</text>
    </svg>
  `;
}

function renderCardStats(card: GameCardData): string {
  const playtimeLabel =
    card.playtimeMinutes > 0
      ? formatPlaytimeDuration(card.playtimeMinutes)
      : 'No playtime logged';
  const playtimeRow = `
    <p class="library-card-playtime">${icon('clock', 'ui-icon ui-icon-sm')}<span>${escapeHtml(playtimeLabel)}</span></p>
  `;

  if (!card.contentAvailable) {
    return `
      <div class="library-card-stats">
        <div class="library-card-stat-text">
          <p class="text-sm text-faint">Content unavailable</p>
          ${playtimeRow}
        </div>
      </div>
    `;
  }

  if (card.totalCount === 0) {
    return `
      <div class="library-card-stats">
        <div class="library-card-stat-text">
          <p class="text-sm text-faint">No checkboxes</p>
          ${playtimeRow}
        </div>
      </div>
    `;
  }

  const percent = Math.round((card.completedCount / card.totalCount) * 100);
  return `
    <div class="library-card-stats">
      ${renderProgressCircle(percent)}
      <div class="library-card-stat-text">
        <p class="text-sm text-status">${card.completedCount} / ${card.totalCount} complete</p>
        ${playtimeRow}
      </div>
    </div>
  `;
}

function renderGameCard(card: GameCardData, signedIn: boolean): string {
  const editButton = signedIn
    ? `<button type="button" class="btn-secondary" data-edit="${escapeHtml(card.slug)}">${iconLabel('edit', 'Edit')}</button>`
    : '';

  const collectionsButton = signedIn
    ? `<button type="button" class="btn-secondary" data-collections="${escapeHtml(card.slug)}">${iconLabel('collection', 'Collections')}</button>`
    : '';

  return renderCollapsiblePanel({
    title: card.name,
    className: 'library-game-card',
    content: `
      <div class="flex flex-col gap-3">
        ${card.mobyHtml}
        ${renderCardStats(card)}
        <div class="library-game-actions mt-auto">
          <button type="button" class="btn-primary" data-view="${escapeHtml(card.slug)}">${iconLabel('eye', 'View')}</button>
          ${editButton}
          ${collectionsButton}
        </div>
      </div>
    `,
  });
}

function renderGameGrid(
  slugs: string[],
  cards: Map<string, GameCardData>,
  signedIn: boolean,
  emptyMessage: string,
): string {
  const rendered = slugs
    .map((slug) => cards.get(slug))
    .filter((card): card is GameCardData => Boolean(card))
    .map((card) => renderGameCard(card, signedIn));

  if (rendered.length === 0) {
    return `<p class="text-faint text-sm">${escapeHtml(emptyMessage)}</p>`;
  }

  return `<div class="library-game-grid">${rendered.join('')}</div>`;
}

function renderCollectionThumb(collection: Collection): string {
  if (collection.thumbnailUrl) {
    return `<img class="library-collection-thumb" src="${escapeHtml(collection.thumbnailUrl)}" alt="" loading="lazy" onerror="this.style.display='none'" />`;
  }
  return `<span class="library-collection-thumb library-collection-thumb-placeholder">${icon('collection', 'ui-icon ui-icon-sm')}</span>`;
}

function renderCollectionSection(
  collection: Collection,
  cards: Map<string, GameCardData>,
  signedIn: boolean,
  state: CollectionsState,
  sortMeta: Map<string, GameSortMeta>,
): string {
  const sortedSlugs = sortSlugsForSection(collection.gameSlugs, collection.id, sortMeta);
  const count = sortedSlugs.length;
  const collapsed = isCollectionCollapsed(state, collection.id);
  const sortMode = getSectionSortMode(collection.id);
  const actions = signedIn
    ? `
      <button type="button" class="btn-secondary" data-edit-collection="${escapeHtml(collection.id)}" aria-label="Edit collection">${icon('edit', 'ui-icon ui-icon-sm')}</button>
      <button type="button" class="btn-secondary" data-delete-collection="${escapeHtml(collection.id)}" aria-label="Delete collection">${icon('trash', 'ui-icon ui-icon-sm')}</button>
    `
    : '';

  const description = collection.description
    ? `<p class="library-collection-desc text-faint text-sm">${escapeHtml(collection.description)}</p>`
    : '';

  return renderCollapsiblePanel({
    title: collection.name,
    className: 'library-collection-panel',
    defaultOpen: !collapsed,
    attributes: {
      'library-collection-id': collection.id,
    },
    titleHtml: `
      ${renderCollectionThumb(collection)}
      <span class="library-collection-title">${escapeHtml(collection.name)}</span>
      <span class="library-collection-count">${count}</span>
    `,
    titleActions: `
      ${renderLibrarySortSelect(collection.id, sortMode)}
      ${actions}
    `,
    content: `${description}${renderGameGrid(sortedSlugs, cards, signedIn, 'No games in this collection.')}`,
  });
}

function renderUncategorizedSection(
  slugs: string[],
  cards: Map<string, GameCardData>,
  signedIn: boolean,
  state: CollectionsState,
  sortMeta: Map<string, GameSortMeta>,
): string {
  if (slugs.length === 0) return '';

  const sortedSlugs = sortSlugsForSection(slugs, UNCATEGORIZED_SECTION, sortMeta);
  const collapsed = isCollectionCollapsed(state, UNCATEGORIZED_SECTION);
  const sortMode = getSectionSortMode(UNCATEGORIZED_SECTION);

  return renderCollapsiblePanel({
    title: 'Uncategorized',
    className: 'library-collection-panel library-collection-panel-uncategorized',
    defaultOpen: !collapsed,
    attributes: {
      'library-collection-id': UNCATEGORIZED_SECTION,
    },
    titleHtml: `
      <span class="library-collection-title">Uncategorized</span>
      <span class="library-collection-count">${sortedSlugs.length}</span>
    `,
    titleActions: renderLibrarySortSelect(UNCATEGORIZED_SECTION, sortMode),
    content: renderGameGrid(sortedSlugs, cards, signedIn, 'No uncategorized games.'),
  });
}

function renderCollectionsView(options: {
  games: GameMeta[];
  cards: Map<string, GameCardData>;
  signedIn: boolean;
  state: CollectionsState;
}): string {
  const { games, cards, signedIn, state } = options;
  const sortMeta = buildSortMeta(games, cards);
  const sortedCollections = sortCollections(state.collections, state.collectionSort);
  const uncategorizedSlugs = getUncategorizedSlugs(state, games);

  const controls =
    state.collections.length > 0
      ? `<div class="library-controls">${renderCollectionSortSelect(state.collectionSort)}</div>`
      : '';

  const sections = sortedCollections
    .map((collection) => renderCollectionSection(collection, cards, signedIn, state, sortMeta))
    .join('');

  const uncategorized = renderUncategorizedSection(
    uncategorizedSlugs,
    cards,
    signedIn,
    state,
    sortMeta,
  );

  if (state.collections.length === 0) {
    return `
      ${
        signedIn
          ? '<p class="text-muted mb-4">No collections yet. Create one to group your games.</p>'
          : ''
      }
      ${uncategorized || renderGameGrid(sortSlugsForSection(games.map((g) => g.slug), LIST_SORT_SECTION, sortMeta), cards, signedIn, 'No games yet.')}
    `;
  }

  return `
    ${controls}
    <div class="library-collection-list space-y-4">
      ${sections}
      ${uncategorized}
    </div>
  `;
}

function renderListView(options: {
  games: GameMeta[];
  cards: Map<string, GameCardData>;
  signedIn: boolean;
}): string {
  const { games, cards, signedIn } = options;
  const sortMeta = buildSortMeta(games, cards);
  const sortedSlugs = sortSlugsForSection(
    games.map((game) => game.slug),
    LIST_SORT_SECTION,
    sortMeta,
  );

  return `
    <div class="library-controls">
      ${renderLibrarySortSelect(LIST_SORT_SECTION, getSectionSortMode(LIST_SORT_SECTION))}
    </div>
    ${renderGameGrid(sortedSlugs, cards, signedIn, 'No games yet.')}
  `;
}

function renderLibraryBody(options: {
  games: GameMeta[];
  cards: Map<string, GameCardData>;
  signedIn: boolean;
  state: CollectionsState;
}): string {
  if (options.state.viewMode === 'list') {
    return renderListView(options);
  }
  return renderCollectionsView(options);
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
    let state = pruneCollections(getCollections(), validSlugs);
    if (JSON.stringify(state) !== JSON.stringify(getCollections())) {
      state = saveCollections(state);
    }

    const cards = await buildGameCards(games);
    let cleanupCollapsible = () => {};
    let cleanupImport = () => {};

    const collectionEditGames = () =>
      games.map((game) => ({ slug: game.slug, name: cards.get(game.slug)?.name ?? game.name }));

    const addCollection = async () => {
      const result = await openCollectionEditDialog({ games: collectionEditGames() });
      if (!result) return;
      createCollection({
        name: result.name,
        description: result.description,
        thumbnailUrl: result.thumbnailUrl,
        gameSlugs: result.gameSlugs,
      });
      state = getCollections();
      paint();
    };

    const editCollection = async (collectionId: string) => {
      const collection = state.collections.find((entry) => entry.id === collectionId);
      if (!collection) return;

      const result = await openCollectionEditDialog({
        collection,
        games: collectionEditGames(),
      });
      if (!result) return;

      updateCollection(collectionId, {
        name: result.name,
        description: result.description,
        thumbnailUrl: result.thumbnailUrl,
        gameSlugs: result.gameSlugs,
      });
      state = getCollections();
      paint();
    };

    const removeCollection = (collectionId: string) => {
      const collection = state.collections.find((entry) => entry.id === collectionId);
      if (!collection) return;
      if (!window.confirm(`Delete collection "${collection.name}"? Games stay in your library.`)) {
        return;
      }
      deleteCollection(collectionId);
      state = getCollections();
      paint();
    };

    const editMembership = async (slug: string) => {
      const card = cards.get(slug);
      const changed = await openCollectionMembershipDialog({
        slug,
        gameName: card?.name ?? slug,
      });
      if (!changed) return;
      state = getCollections();
      paint();
    };

    const wireInteractions = () => {
      cleanupCollapsible();
      cleanupCollapsible = wireCollapsiblePanels(container, {
        onToggle: (panel, expanded) => {
          const collectionId = panel.dataset.libraryCollectionId;
          if (!collectionId) return;
          setCollapsed(collectionId, !expanded);
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

      container.querySelectorAll('[data-collections]').forEach((button) => {
        const handler = () => {
          void editMembership((button as HTMLElement).dataset.collections ?? '');
        };
        button.removeEventListener('click', handler);
        button.addEventListener('click', handler);
      });

      container.querySelector('#library-add-collection')?.addEventListener('click', () => {
        void addCollection();
      });

      container.querySelectorAll('[data-edit-collection]').forEach((button) => {
        button.addEventListener('click', () => {
          void editCollection((button as HTMLElement).dataset.editCollection ?? '');
        });
      });

      container.querySelectorAll('[data-delete-collection]').forEach((button) => {
        button.addEventListener('click', () => {
          removeCollection((button as HTMLElement).dataset.deleteCollection ?? '');
        });
      });

      container.querySelectorAll('[data-view-mode]').forEach((button) => {
        button.addEventListener('click', () => {
          const mode = (button as HTMLElement).dataset.viewMode as LibraryViewMode | undefined;
          if (!mode || mode === state.viewMode) return;
          state = setViewMode(mode);
          paint();
        });
      });

      const collectionSortSelect = container.querySelector(
        '[data-collection-sort]',
      ) as HTMLSelectElement | null;
      collectionSortSelect?.addEventListener('change', () => {
        state = setCollectionSort(collectionSortSelect.value as CollectionSortMode);
        paint();
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
      const body = renderLibraryBody({ games, cards, signedIn, state });
      const libraryBody = container.querySelector('#library-body');
      const viewToggleHost = container.querySelector('#library-view-toggle-host');

      if (libraryBody && viewToggleHost) {
        viewToggleHost.innerHTML = renderViewToggle(state.viewMode);
        libraryBody.innerHTML = body;
        wireInteractions();
        return;
      }

      container.innerHTML = `
        <div class="app-shell">
          <header class="library-page-header">
            <div class="library-page-header-intro">
              <h1 class="page-heading mb-1">Game Library</h1>
              <p class="text-muted">Pick a journal to track your completion progress.</p>
              <div id="library-view-toggle-host" class="library-view-toggle-host">${renderViewToggle(state.viewMode)}</div>
            </div>
            ${renderLibraryHeaderActions(signedIn)}
          </header>
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
