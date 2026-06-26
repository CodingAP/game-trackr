import {
  fetchRetroAchievementsForGame,
  fetchRetroAchievementsStatus,
  linkRetroAchievements,
  unlinkRetroAchievements,
} from '../api/client.js';
import { renderCollapsiblePanel, wireCollapsiblePanels } from './CollapsiblePanel.js';
import { iconLabel } from './icons.js';
import {
  achievementCheckboxId,
  buildAchievementCheckboxes,
} from '../markdown/retroAchievements.js';
import type { ManagedCheckbox, RetroAchievementsGameInfo } from '../types/index.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function parseGameId(reference: string): number | null {
  const trimmed = reference.trim();
  if (/^\d+$/.test(trimmed)) {
    const value = Number(trimmed);
    return value > 0 ? value : null;
  }
  const fromUrl = trimmed.match(/retroachievements\.org\/game\/(\d+)/i)?.[1];
  if (fromUrl) {
    const value = Number(fromUrl);
    return value > 0 ? value : null;
  }
  return null;
}

export interface RetroAchievementsAdminHooks {
  /** Current managed checkboxes in the editor. */
  getCheckboxes: () => ManagedCheckbox[];
  /** Adds or updates the given managed checkboxes in the editor. */
  upsertCheckboxes: (checkboxes: ManagedCheckbox[]) => void;
  /** Removes a managed checkbox by id. */
  removeCheckbox: (id: string) => void;
  /** Ensures the shared "Achievements" progress bar exists. */
  ensureAchievementsProgressBar: () => void;
  /** Notifies the editor that checkbox/progress data changed (triggers autosave). */
  onChanged: () => void;
}

export function mountRetroAchievementsAdmin(
  host: HTMLElement,
  slug: string,
  hooks: RetroAchievementsAdminHooks,
): () => void {
  let configured = false;
  let linkedInfo: RetroAchievementsGameInfo | null = null;

  const statusEl = () => host.querySelector('#ra-admin-status') as HTMLElement;
  const bodyEl = () => host.querySelector('#ra-admin-body') as HTMLElement;

  const renderShell = () => {
    host.innerHTML = renderCollapsiblePanel({
      title: 'RetroAchievements',
      content: `
        <p id="ra-admin-status" class="text-sm text-muted"></p>
        <div id="ra-admin-body" class="mt-3 space-y-3"></div>
      `,
    });
  };

  const syncAchievementCheckboxes = (info: RetroAchievementsGameInfo) => {
    hooks.ensureAchievementsProgressBar();
    hooks.upsertCheckboxes(buildAchievementCheckboxes(info));
    hooks.onChanged();
  };

  const removeAchievementCheckboxes = (info: RetroAchievementsGameInfo | null) => {
    const ids = info
      ? info.achievements.map((achievement) => achievementCheckboxId(achievement.id))
      : hooks.getCheckboxes().map((checkbox) => checkbox.id).filter((id) => id.startsWith('ra-'));
    for (const id of ids) {
      hooks.removeCheckbox(id);
    }
    hooks.onChanged();
  };

  const renderLinked = (info: RetroAchievementsGameInfo): string => `
    <div class="ra-linked">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex items-start gap-3 min-w-0">
          ${
            info.iconUrl
              ? `<img class="ra-linked-icon" src="${escapeHtml(info.iconUrl)}" alt="" width="48" height="48" loading="lazy" />`
              : ''
          }
          <div class="min-w-0">
            <p class="text-sm font-medium text-strong">${escapeHtml(info.title)}</p>
            <p class="text-xs text-faint mt-1">
              RA ID ${info.gameId}${info.consoleName ? ` · ${escapeHtml(info.consoleName)}` : ''} · ${info.achievements.length} achievement${info.achievements.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <a href="https://retroachievements.org/game/${info.gameId}" class="btn-secondary text-xs" target="_blank" rel="noopener noreferrer">${iconLabel('external-link', 'Open')}</a>
          <button type="button" class="btn-secondary text-xs" data-action="ra-refresh">${iconLabel('download', 'Refresh')}</button>
          <button type="button" class="btn-secondary text-xs" data-action="ra-unlink">${iconLabel('trash', 'Unlink')}</button>
        </div>
      </div>
      <p class="hint mt-3">
        Achievements are added as checkboxes tagged with the <strong>Achievements</strong> progress bar and
        shown above the journal in the viewer. Embed any of them in the journal with the checkbox picker.
      </p>
    </div>
  `;

  const renderUnlinkedForm = (): string => `
    <label class="block">
      <span class="label">RetroAchievements game URL or ID</span>
      <div class="flex flex-wrap gap-2">
        <input type="text" id="ra-reference" class="input flex-1 min-w-[12rem]" placeholder="https://retroachievements.org/game/14402 or 14402" />
        <button type="button" class="btn-secondary" data-action="ra-link">${iconLabel('plus', 'Link')}</button>
      </div>
    </label>
    <p class="hint">Find the game on retroachievements.org and paste its page URL or numeric ID.</p>
  `;

  const render = () => {
    if (!configured) {
      statusEl().textContent =
        'Linking RetroAchievements requires RETROACHIEVEMENTS_API_KEY on the server.';
      bodyEl().innerHTML = '';
      return;
    }

    if (linkedInfo) {
      statusEl().textContent = 'Linked. Refresh to pull the latest achievement list.';
      bodyEl().innerHTML = renderLinked(linkedInfo);
    } else {
      statusEl().textContent = 'Link a RetroAchievements game to import its achievements.';
      bodyEl().innerHTML = renderUnlinkedForm();
    }
  };

  const setStatus = (message: string) => {
    statusEl().textContent = message;
  };

  const onLink = async () => {
    const input = host.querySelector('#ra-reference') as HTMLInputElement | null;
    const gameId = input ? parseGameId(input.value) : null;
    if (!gameId) {
      setStatus('Enter a valid RetroAchievements game URL or numeric ID.');
      return;
    }

    setStatus('Linking RetroAchievements game...');
    try {
      const result = await linkRetroAchievements(slug, gameId);
      linkedInfo = result.info;
      syncAchievementCheckboxes(result.info);
      render();
      setStatus(`Imported ${result.info.achievements.length} achievements.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to link RetroAchievements game');
    }
  };

  const onRefresh = async () => {
    setStatus('Refreshing from RetroAchievements...');
    try {
      const data = await fetchRetroAchievementsForGame(slug, { refresh: true });
      if (data.info) {
        linkedInfo = data.info;
        syncAchievementCheckboxes(data.info);
        render();
        setStatus('Achievement list refreshed.');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to refresh achievements');
    }
  };

  const onUnlink = async () => {
    if (!window.confirm('Unlink RetroAchievements? Achievement checkboxes will be removed.')) {
      return;
    }

    setStatus('Unlinking...');
    try {
      await unlinkRetroAchievements(slug);
      removeAchievementCheckboxes(linkedInfo);
      linkedInfo = null;
      render();
      setStatus('Unlinked.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to unlink');
    }
  };

  const onClick = (event: Event) => {
    const target = (event.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!target || !host.contains(target)) return;
    switch (target.dataset.action) {
      case 'ra-link':
        void onLink();
        break;
      case 'ra-refresh':
        void onRefresh();
        break;
      case 'ra-unlink':
        void onUnlink();
        break;
    }
  };

  renderShell();
  const cleanupCollapsible = wireCollapsiblePanels(host);
  host.addEventListener('click', onClick);

  void (async () => {
    try {
      const [status, data] = await Promise.all([
        fetchRetroAchievementsStatus(),
        fetchRetroAchievementsForGame(slug).catch(() => ({
          configured: false,
          link: null,
          info: null,
        })),
      ]);
      configured = status.configured;
      linkedInfo = data.info;
      render();
    } catch {
      setStatus('Failed to load RetroAchievements settings.');
    }
  })();

  return () => {
    cleanupCollapsible();
    host.removeEventListener('click', onClick);
  };
}
