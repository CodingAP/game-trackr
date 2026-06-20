import {
  fetchMobyGamesForGame,
  fetchMobyGamesStatus,
  linkMobyGamesEntry,
  searchMobyGames,
  unlinkMobyGamesEntry,
  updateMobyGamesCache,
} from '../api/client.js';
import { renderCollapsiblePanel, wireCollapsiblePanels } from './CollapsiblePanel.js';
import { iconLabel } from './icons.js';
import type { MobyGamesGameInfo, MobyGamesPlatformInfo, MobyGamesSearchHit } from '../types/index.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderPlatformRow(platform: MobyGamesPlatformInfo): string {
  return `
    <div class="mobygames-platform-row" data-moby-platform-row>
      <label class="block min-w-0 flex-1">
        <span class="label">Platform</span>
        <input type="text" class="input" data-moby-platform-name value="${escapeHtml(platform.name)}" />
      </label>
      <label class="block min-w-0 flex-1">
        <span class="label">Release date</span>
        <input
          type="text"
          class="input"
          data-moby-platform-date
          value="${escapeHtml(platform.releaseDate ?? '')}"
          placeholder="1999 or 2015-04-02"
        />
      </label>
      <button type="button" class="btn-secondary text-xs" data-action="moby-remove-platform">${iconLabel('close', 'Remove')}</button>
    </div>
  `;
}

function createEmptyGameInfo(title: string): MobyGamesGameInfo {
  return {
    gameId: 0,
    title: title.trim() || 'Untitled',
    description: null,
    mobyUrl: '',
    mobyScore: null,
    numVotes: null,
    coverUrl: null,
    coverThumbnailUrl: null,
    genres: [],
    platforms: [],
    alternateTitles: [],
  };
}

function renderMobyGamesEditForm(info: MobyGamesGameInfo): string {
  const platformRows =
    info.platforms.length > 0
      ? info.platforms.map((platform) => renderPlatformRow(platform)).join('')
      : renderPlatformRow({ name: '', releaseDate: null });

  return `
    <form id="moby-edit-form" class="mobygames-edit-form space-y-3">
      <p class="hint">Saved on the server and shown in the viewer and library.</p>
      <label class="block">
        <span class="label">Title</span>
        <input type="text" id="moby-edit-title" class="input" value="${escapeHtml(info.title)}" required />
      </label>
      <label class="block">
        <span class="label">Description</span>
        <textarea id="moby-edit-description" class="input min-h-32 font-mono text-sm" rows="8">${escapeHtml(info.description ?? '')}</textarea>
        <span class="hint">HTML is supported in the viewer.</span>
      </label>
      <label class="block">
        <span class="label">MobyGames URL</span>
        <input type="url" id="moby-edit-moby-url" class="input" value="${escapeHtml(info.mobyUrl)}" />
      </label>
      <label class="block">
        <span class="label">Cover URL</span>
        <input type="url" id="moby-edit-cover-url" class="input" value="${escapeHtml(info.coverUrl ?? '')}" />
      </label>
      <div>
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span class="label mb-0">Platforms</span>
          <button type="button" class="btn-secondary text-xs" data-action="moby-add-platform">${iconLabel('plus', 'Add platform')}</button>
        </div>
        <div id="moby-edit-platforms" class="mobygames-platform-list space-y-2">
          ${platformRows}
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="submit" class="btn-primary">${iconLabel('save', 'Save game info')}</button>
      </div>
    </form>
  `;
}

function renderLinkedHeader(info: MobyGamesGameInfo, configured: boolean): string {
  return `
    <div class="mobygames-linked panel-muted mb-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-sm font-medium text-strong">${escapeHtml(info.title)}</p>
          <p class="text-xs text-faint mt-1">MobyGames ID: ${info.gameId}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          ${
            info.mobyUrl.trim()
              ? `<a href="${escapeHtml(info.mobyUrl)}" class="btn-secondary text-xs" target="_blank" rel="noopener noreferrer">
                  ${iconLabel('external-link', 'Open on MobyGames')}
                </a>`
              : ''
          }
          ${
            configured
              ? `<button type="button" class="btn-secondary text-xs" data-action="moby-refresh">${iconLabel('download', 'Refresh from MobyGames')}</button>`
              : ''
          }
          <button type="button" class="btn-secondary text-xs" data-action="moby-unlink">${iconLabel('close', 'Unlink')}</button>
        </div>
      </div>
    </div>
  `;
}

function renderSearchResults(results: MobyGamesSearchHit[]): string {
  if (results.length === 0) {
    return '<p class="text-muted text-sm">No MobyGames entries found.</p>';
  }

  return `
    <ul class="mobygames-results">
      ${results
        .map(
          (result) => `
            <li>
              <button
                type="button"
                class="mobygames-result"
                data-action="moby-link"
                data-game-id="${result.gameId}"
              >
                <span class="mobygames-result-title">${escapeHtml(result.title)}</span>
                <span class="mobygames-result-id">ID ${result.gameId}</span>
              </button>
            </li>
          `,
        )
        .join('')}
    </ul>
  `;
}

function readMobyGamesEditForm(host: HTMLElement): {
  title: string;
  description: string | null;
  mobyUrl: string;
  coverUrl: string | null;
  platforms: MobyGamesPlatformInfo[];
} {
  const title = (host.querySelector('#moby-edit-title') as HTMLInputElement | null)?.value.trim() ?? '';
  const descriptionRaw = (host.querySelector('#moby-edit-description') as HTMLTextAreaElement | null)?.value ?? '';
  const mobyUrl = (host.querySelector('#moby-edit-moby-url') as HTMLInputElement | null)?.value.trim() ?? '';
  const coverUrlRaw = (host.querySelector('#moby-edit-cover-url') as HTMLInputElement | null)?.value.trim() ?? '';

  const platforms = [...host.querySelectorAll('[data-moby-platform-row]')]
    .map((row) => {
      const name = (row.querySelector('[data-moby-platform-name]') as HTMLInputElement | null)?.value.trim() ?? '';
      const releaseDateRaw =
        (row.querySelector('[data-moby-platform-date]') as HTMLInputElement | null)?.value.trim() ?? '';
      return {
        name,
        releaseDate: releaseDateRaw || null,
      };
    })
    .filter((platform) => platform.name.length > 0);

  return {
    title,
    description: descriptionRaw.trim() ? descriptionRaw : null,
    mobyUrl,
    coverUrl: coverUrlRaw || null,
    platforms,
  };
}

export function mountMobyGamesAdmin(host: HTMLElement, slug: string, gameName: string): () => void {
  let configured = false;
  let linkedInfo: MobyGamesGameInfo | null = null;
  let linkedGameId: number | null = null;
  let searchTimer: number | null = null;
  let defaultGameName = gameName;

  const statusEl = () => host.querySelector('#moby-admin-status') as HTMLElement;
  const linkedEl = () => host.querySelector('#moby-admin-linked') as HTMLElement;
  const searchWrap = () => host.querySelector('#moby-admin-search-wrap') as HTMLElement;
  const resultsEl = () => host.querySelector('#moby-admin-results') as HTMLElement;

  const renderShell = () => {
    host.innerHTML = renderCollapsiblePanel({
      title: 'MobyGames',
      content: `
        <div id="moby-admin-status" class="text-sm text-muted"></div>
        <div id="moby-admin-linked"></div>
        <div id="moby-admin-search-wrap" class="space-y-3" hidden>
          <label class="block">
            <span class="label">Search MobyGames</span>
            <input type="search" id="moby-search" class="input" placeholder="Search by game title..." autocomplete="off" />
          </label>
          <label class="block">
            <span class="label">Or paste MobyGames URL / game ID</span>
            <div class="flex flex-wrap gap-2">
              <input type="text" id="moby-reference" class="input flex-1 min-w-[12rem]" placeholder="https://www.mobygames.com/game/... or 12345" />
              <button type="button" class="btn-secondary" data-action="moby-link-reference">${iconLabel('plus', 'Attach')}</button>
            </div>
          </label>
          <div id="moby-admin-results"></div>
        </div>
      `,
    });
  };

  const render = () => {
    const editInfo = linkedInfo ?? createEmptyGameInfo(defaultGameName);

    if (linkedGameId && linkedInfo) {
      statusEl().textContent = configured
        ? 'Linked to MobyGames. Edits below override what appears in the viewer and library.'
        : 'Linked to MobyGames. Edits below are saved on the server. Refresh requires MOBYGAMES_API_KEY.';
    } else if (linkedInfo) {
      statusEl().textContent = 'Custom game info saved. Link MobyGames below to import metadata.';
    } else if (configured) {
      statusEl().textContent = 'Add game info below or link a MobyGames entry.';
    } else {
      statusEl().textContent =
        'Add game info below. Linking MobyGames requires MOBYGAMES_API_KEY on the server.';
    }

    linkedEl().innerHTML = `
      ${linkedGameId && linkedInfo ? renderLinkedHeader(linkedInfo, configured) : ''}
      ${renderMobyGamesEditForm(editInfo)}
    `;
    searchWrap().hidden = !configured || Boolean(linkedGameId);
    if (!searchWrap().hidden) {
      resultsEl().innerHTML = '<p class="text-faint text-sm">Search for a game to attach.</p>';
    }
  };

  const load = async () => {
    try {
      const [status, mobyData] = await Promise.all([
        fetchMobyGamesStatus(),
        fetchMobyGamesForGame(slug).catch(() => ({
          configured: false,
          link: null,
          info: null,
        })),
      ]);
      configured = status.configured;
      linkedInfo = mobyData.info;
      linkedGameId = mobyData.link?.gameId ?? null;
      if (linkedInfo?.title.trim()) {
        defaultGameName = linkedInfo.title;
      }
      render();
    } catch (error) {
      statusEl().textContent =
        error instanceof Error ? error.message : 'Failed to load MobyGames settings';
    }
  };

  const setStatus = (message: string) => {
    statusEl().textContent = message;
  };

  const performSearch = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      resultsEl().innerHTML = '<p class="text-faint text-sm">Search for a game to attach.</p>';
      return;
    }

    resultsEl().innerHTML = '<p class="text-muted text-sm">Searching...</p>';
    try {
      const results = await searchMobyGames(trimmed);
      resultsEl().innerHTML = renderSearchResults(results);
    } catch (error) {
      resultsEl().innerHTML = `<p class="text-sm text-red-400">${escapeHtml(error instanceof Error ? error.message : 'Search failed')}</p>`;
    }
  };

  const attachGame = async (gameId: number) => {
    setStatus('Linking MobyGames entry...');
    try {
      const result = await linkMobyGamesEntry(slug, gameId);
      linkedInfo = result.info;
      linkedGameId = result.info.gameId;
      render();
      setStatus('MobyGames entry linked.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to link MobyGames entry');
    }
  };

  const refreshFromMobyGames = async () => {
    setStatus('Refreshing from MobyGames...');
    try {
      const mobyData = await fetchMobyGamesForGame(slug, { refresh: true });
      linkedInfo = mobyData.info;
      linkedGameId = mobyData.link?.gameId ?? linkedGameId;
      render();
      setStatus('MobyGames cache refreshed from the API.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to refresh MobyGames cache');
    }
  };

  const saveCachedInfo = async () => {
    const updates = readMobyGamesEditForm(host);
    if (!updates.title) {
      setStatus('Title is required.');
      return;
    }

    setStatus('Saving game info...');
    try {
      linkedInfo = await updateMobyGamesCache(slug, updates);
      defaultGameName = linkedInfo.title;
      render();
      setStatus('Game info saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save game info');
    }
  };

  const onHostClick = async (event: Event) => {
    const target = (event.target as Element).closest('[data-action]') as HTMLElement | null;
    if (!target) return;

    if (target.dataset.action === 'moby-link') {
      event.preventDefault();
      await attachGame(Number(target.dataset.gameId));
      return;
    }

    if (target.dataset.action === 'moby-link-reference') {
      event.preventDefault();
      const referenceInput = host.querySelector('#moby-reference') as HTMLInputElement;
      const parsed = parseMobyReference(referenceInput.value);
      if (!parsed) {
        setStatus('Enter a valid MobyGames URL or numeric game ID.');
        return;
      }
      await attachGame(parsed);
      return;
    }

    if (target.dataset.action === 'moby-refresh') {
      event.preventDefault();
      await refreshFromMobyGames();
      return;
    }

    if (target.dataset.action === 'moby-add-platform') {
      event.preventDefault();
      const platformsHost = host.querySelector('#moby-edit-platforms');
      platformsHost?.insertAdjacentHTML('beforeend', renderPlatformRow({ name: '', releaseDate: null }));
      return;
    }

    if (target.dataset.action === 'moby-remove-platform') {
      event.preventDefault();
      const row = target.closest('[data-moby-platform-row]');
      const platformsHost = host.querySelector('#moby-edit-platforms');
      if (!row || !platformsHost) return;
      if (platformsHost.querySelectorAll('[data-moby-platform-row]').length <= 1) {
        const nameInput = row.querySelector('[data-moby-platform-name]') as HTMLInputElement | null;
        const dateInput = row.querySelector('[data-moby-platform-date]') as HTMLInputElement | null;
        if (nameInput) nameInput.value = '';
        if (dateInput) dateInput.value = '';
        return;
      }
      row.remove();
      return;
    }

    if (target.dataset.action === 'moby-unlink') {
      event.preventDefault();
      setStatus('Unlinking...');
      try {
        await unlinkMobyGamesEntry(slug);
        const mobyData = await fetchMobyGamesForGame(slug);
        linkedInfo = mobyData.info;
        linkedGameId = null;
        render();
        setStatus('MobyGames link removed. Custom game info was kept.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to unlink MobyGames entry');
      }
    }
  };

  const onHostSubmit = (event: Event) => {
    const form = (event.target as Element | null)?.closest('#moby-edit-form');
    if (!form) return;
    event.preventDefault();
    void saveCachedInfo();
  };

  const onHostInput = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.id !== 'moby-search') return;

    if (searchTimer !== null) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      void performSearch(input.value);
    }, 300);
  };

  renderShell();
  host.addEventListener('click', onHostClick);
  host.addEventListener('submit', onHostSubmit);
  host.addEventListener('input', onHostInput);
  const cleanupCollapsible = wireCollapsiblePanels(host);
  void load();

  return () => {
    cleanupCollapsible();
    if (searchTimer !== null) window.clearTimeout(searchTimer);
    host.removeEventListener('click', onHostClick);
    host.removeEventListener('submit', onHostSubmit);
    host.removeEventListener('input', onHostInput);
  };
}

function parseMobyReference(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);

  const idFromQuery = trimmed.match(/[?&]id=(\d+)/i)?.[1];
  if (idFromQuery) return Number(idFromQuery);

  const idFromPath = trimmed.match(/mobygames\.com\/game(?:\/[^/?#]+)?\/(\d+)/i)?.[1];
  if (idFromPath) return Number(idFromPath);

  return null;
}
