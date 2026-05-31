import {
  fetchMobyGamesForGame,
  fetchMobyGamesStatus,
  linkMobyGamesEntry,
  searchMobyGames,
  unlinkMobyGamesEntry,
} from '../api/client.js';
import { renderCollapsiblePanel, wireCollapsiblePanels } from './CollapsiblePanel.js';
import type { MobyGamesGameInfo, MobyGamesSearchHit } from '../types/index.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderLinkedState(info: MobyGamesGameInfo): string {
  return `
    <div class="mobygames-linked panel-muted">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-sm font-medium text-strong">${escapeHtml(info.title)}</p>
          <p class="text-xs text-faint mt-1">MobyGames ID: ${info.gameId}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <a href="${escapeHtml(info.mobyUrl)}" class="btn-secondary text-xs" target="_blank" rel="noopener noreferrer">
            Open on MobyGames
          </a>
          <button type="button" class="btn-secondary text-xs" data-action="moby-unlink">Unlink</button>
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

export function mountMobyGamesAdmin(host: HTMLElement, slug: string): () => void {
  let configured = false;
  let linkedInfo: MobyGamesGameInfo | null = null;
  let linkedGameId: number | null = null;
  let searchTimer: number | null = null;

  const statusEl = () => host.querySelector('#moby-admin-status') as HTMLElement;
  const linkedEl = () => host.querySelector('#moby-admin-linked') as HTMLElement;
  const searchWrap = () => host.querySelector('#moby-admin-search-wrap') as HTMLElement;
  const resultsEl = () => host.querySelector('#moby-admin-results') as HTMLElement;

  const renderShell = () => {
    host.innerHTML = renderCollapsiblePanel({
      title: 'MobyGames',
      content: `
        <p class="text-muted text-sm">
          Link this journal to a MobyGames entry to show box art, release info, and description in the viewer.
        </p>
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
              <button type="button" class="btn-secondary" data-action="moby-link-reference">Attach</button>
            </div>
          </label>
          <div id="moby-admin-results"></div>
        </div>
      `,
    });
  };

  const render = () => {
    if (!configured) {
      statusEl().textContent =
        'MobyGames API key is not configured on the server. Set MOBYGAMES_API_KEY and restart.';
      linkedEl().innerHTML = '';
      searchWrap().hidden = true;
      return;
    }

    statusEl().textContent = linkedInfo || linkedGameId
      ? 'This journal is linked to a MobyGames entry.'
      : 'No MobyGames entry linked yet.';

    linkedEl().innerHTML = linkedInfo
      ? renderLinkedState(linkedInfo)
      : linkedGameId
        ? `
          <div class="mobygames-linked">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="text-sm text-muted">Linked to MobyGames ID ${linkedGameId}</p>
              <button type="button" class="btn-secondary text-xs" data-action="moby-unlink">Unlink</button>
            </div>
          </div>
        `
        : '';
    searchWrap().hidden = false;
    resultsEl().innerHTML = '<p class="text-faint text-sm">Search for a game to attach.</p>';
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

    if (target.dataset.action === 'moby-unlink') {
      event.preventDefault();
      setStatus('Unlinking...');
      try {
        await unlinkMobyGamesEntry(slug);
        linkedInfo = null;
        linkedGameId = null;
        render();
        setStatus('MobyGames entry unlinked.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to unlink MobyGames entry');
      }
    }
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
  host.addEventListener('input', onHostInput);
  const cleanupCollapsible = wireCollapsiblePanels(host);
  void load();

  return () => {
    cleanupCollapsible();
    if (searchTimer !== null) window.clearTimeout(searchTimer);
    host.removeEventListener('click', onHostClick);
    host.removeEventListener('input', onHostInput);
  };
}

function parseMobyReference(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);

  const idFromQuery = trimmed.match(/[?&]id=(\d+)/i)?.[1];
  if (idFromQuery) return Number(idFromQuery);

  return null;
}
