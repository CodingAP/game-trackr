import {
  AuthRequiredError,
  deleteGame,
  duplicateGame,
  fetchGameImages,
} from '../api/client.js';
import { requireAuth } from './AuthPrompt.js';
import { renderCollapsiblePanel, wireCollapsiblePanels } from './CollapsiblePanel.js';
import { buildJournalExportBundle, downloadJournalBundle } from '../utils/journalBundle.js';
import type {
  CheckboxConnectionsData,
  CompletionTagsData,
  FullJournalData,
  GameMapsData,
  ImageLibraryData,
} from '../types/index.js';
import { navigate } from '../router.js';
import { iconLabel } from './icons.js';

interface EditorAdminOptions {
  countAbandonedEmbeds?: () => number;
  clearAbandonedEmbeds?: () => number;
  createMode?: boolean;
}

export function mountEditorAdmin(
  host: HTMLElement,
  slug: string,
  gameName: string,
  getJournal: () => FullJournalData,
  getCheckboxes: () => CheckboxConnectionsData,
  getCompletionTags: () => CompletionTagsData,
  getMaps: () => GameMapsData,
  getImageLibrary: () => ImageLibraryData,
  options: EditorAdminOptions = {},
): () => void {
  host.innerHTML = `
    <div class="space-y-4">
      ${renderCollapsiblePanel({
        title: 'Maintenance',
        content: `
          <p class="text-muted text-sm mb-3">Remove markdown badges that reference deleted checkboxes, progress bars, or maps.</p>
          <button type="button" class="btn-secondary" data-action="clear-abandoned-embeds">${iconLabel('trash', 'Clear abandoned badges')}</button>
          <p id="admin-clear-embeds-status" class="text-muted text-sm"></p>
        `,
      })}
      ${
        options.createMode
          ? ''
          : `
      ${renderCollapsiblePanel({
        title: 'Export',
        content: `
          <button type="button" class="btn-secondary" data-action="export-journal">${iconLabel('download', 'Export journal')}</button>
          <p id="admin-export-status" class="text-muted text-sm"></p>
        `,
      })}
      ${renderCollapsiblePanel({
        title: 'Duplicate',
        content: `
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="label">New game name</span>
              <input type="text" id="duplicate-name" class="input" value="${escapeHtml(gameName)} (Copy)" />
            </label>
            <label class="block">
              <span class="label">New slug</span>
              <input type="text" id="duplicate-slug" class="input" value="${escapeHtml(slug)}-copy" pattern="[a-z0-9]+(-[a-z0-9]+)*" />
            </label>
          </div>
          <button type="button" class="btn-secondary" data-action="duplicate">${iconLabel('copy', 'Duplicate game')}</button>
          <p id="admin-duplicate-status" class="text-muted text-sm"></p>
        `,
      })}
      ${renderCollapsiblePanel({
        title: 'Delete',
        className: 'border-red-500/40',
        content: `
          <button type="button" class="btn-danger" data-action="delete">${iconLabel('trash', 'Delete game')}</button>
          <p id="admin-delete-status" class="text-muted text-sm"></p>
        `,
      })}
      `
      }
    </div>
  `;

  const clearEmbedsStatus = host.querySelector('#admin-clear-embeds-status') as HTMLElement;
  const exportStatus = host.querySelector('#admin-export-status') as HTMLElement;
  const duplicateStatus = host.querySelector('#admin-duplicate-status') as HTMLElement;
  const deleteStatus = host.querySelector('#admin-delete-status') as HTMLElement;

  const onClearAbandonedEmbeds = () => {
    if (!options.clearAbandonedEmbeds) {
      clearEmbedsStatus.textContent = 'Cleanup is unavailable.';
      return;
    }

    const count = options.countAbandonedEmbeds?.() ?? 0;
    if (count === 0) {
      clearEmbedsStatus.textContent = 'No abandoned badges found.';
      return;
    }

    const confirmed = window.confirm(
      `Remove ${count} abandoned badge${count === 1 ? '' : 's'} from all pages? This cannot be undone until you save.`,
    );
    if (!confirmed) return;

    const removed = options.clearAbandonedEmbeds();
    clearEmbedsStatus.textContent =
      removed > 0
        ? `Removed ${removed} abandoned badge${removed === 1 ? '' : 's'}. Save the game to keep changes.`
        : 'No abandoned badges found.';
  };

  const onExport = async () => {
    exportStatus.textContent = 'Exporting...';

    try {
      const images = await fetchGameImages(slug);
      const bundle = await buildJournalExportBundle(
        slug,
        gameName,
        getJournal(),
        getCheckboxes(),
        getCompletionTags(),
        getMaps(),
        getImageLibrary(),
        images,
      );
      downloadJournalBundle(bundle);
      exportStatus.textContent = 'Journal downloaded.';
    } catch (error) {
      exportStatus.textContent = error instanceof Error ? error.message : 'Export failed';
    }
  };

  const onDuplicate = async () => {
    const nameInput = host.querySelector('#duplicate-name') as HTMLInputElement;
    const slugInput = host.querySelector('#duplicate-slug') as HTMLInputElement;
    duplicateStatus.textContent = 'Duplicating...';

    try {
      const game = await duplicateGame(slug, slugInput.value.trim(), nameInput.value.trim());
      navigate(`/editor/${game.slug}`);
    } catch (error) {
      if (error instanceof AuthRequiredError && (await requireAuth())) {
        await onDuplicate();
        return;
      }
      duplicateStatus.textContent = error instanceof Error ? error.message : 'Duplicate failed';
    }
  };

  const onDelete = async () => {
    const confirmed = window.confirm(
      `Delete "${gameName}" permanently? This cannot be undone.`,
    );
    if (!confirmed) return;

    deleteStatus.textContent = 'Deleting...';
    try {
      await deleteGame(slug);
      navigate('/');
    } catch (error) {
      if (error instanceof AuthRequiredError && (await requireAuth())) {
        await onDelete();
        return;
      }
      deleteStatus.textContent = error instanceof Error ? error.message : 'Delete failed';
    }
  };

  host.querySelector('[data-action="clear-abandoned-embeds"]')?.addEventListener('click', onClearAbandonedEmbeds);
  host.querySelector('[data-action="export-journal"]')?.addEventListener('click', onExport);
  host.querySelector('[data-action="duplicate"]')?.addEventListener('click', onDuplicate);
  host.querySelector('[data-action="delete"]')?.addEventListener('click', onDelete);

  const cleanupCollapsible = wireCollapsiblePanels(host);

  return () => {
    cleanupCollapsible();
    host.querySelector('[data-action="clear-abandoned-embeds"]')?.removeEventListener(
      'click',
      onClearAbandonedEmbeds,
    );
    host.querySelector('[data-action="export-journal"]')?.removeEventListener('click', onExport);
    host.querySelector('[data-action="duplicate"]')?.removeEventListener('click', onDuplicate);
    host.querySelector('[data-action="delete"]')?.removeEventListener('click', onDelete);
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
