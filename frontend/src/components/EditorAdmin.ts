import {
  AuthRequiredError,
  deleteGame,
  fetchGameImages,
} from '../api/client.js';
import { requireAuth } from './AuthPrompt.js';
import { renderCollapsiblePanel, wireCollapsiblePanels } from './CollapsiblePanel.js';
import { buildJournalExportBundle, downloadJournalBundle } from '../utils/journalBundle.js';
import type {
  CheckboxConnectionsData,
  ProgressBarsData,
  FullJournalData,
  GameMapsData,
  ImageLibraryData,
} from '../types/index.js';
import { navigate } from '../router.js';
import { iconLabel } from './icons.js';

interface EditorAdminOptions {
  countAbandonedEmbeds?: () => number;
  clearAbandonedEmbeds?: () => number;
  countPagesWithExtraWhitespace?: () => number;
  removeExtraWhitespace?: () => number;
  createMode?: boolean;
}

export function mountEditorAdmin(
  host: HTMLElement,
  slug: string,
  gameName: string,
  getJournal: () => FullJournalData,
  getCheckboxes: () => CheckboxConnectionsData,
  getProgressBars: () => ProgressBarsData,
  getMaps: () => GameMapsData,
  getImageLibrary: () => ImageLibraryData,
  options: EditorAdminOptions = {},
): () => void {
  host.innerHTML = `
    <div class="space-y-4">
      ${renderCollapsiblePanel({
        title: 'Maintenance',
        content: `
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-secondary" data-action="clear-abandoned-embeds">${iconLabel('trash', 'Clear abandoned badges')}</button>
            <button type="button" class="btn-secondary" data-action="remove-extra-whitespace">${iconLabel('edit', 'Remove extra whitespace')}</button>
          </div>
          <p id="admin-clear-embeds-status" class="text-muted text-sm mt-3"></p>
          <p id="admin-whitespace-status" class="text-muted text-sm"></p>
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
  const whitespaceStatus = host.querySelector('#admin-whitespace-status') as HTMLElement;
  const exportStatus = host.querySelector('#admin-export-status') as HTMLElement;
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
        getProgressBars(),
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

  const onRemoveExtraWhitespace = () => {
    if (!options.removeExtraWhitespace) {
      whitespaceStatus.textContent = 'Cleanup is unavailable.';
      return;
    }

    const pageCount = options.countPagesWithExtraWhitespace?.() ?? 0;
    if (pageCount === 0) {
      whitespaceStatus.textContent = 'No extra whitespace found.';
      return;
    }

    const confirmed = window.confirm(
      `Clean up extra whitespace on ${pageCount} page${pageCount === 1 ? '' : 's'}? This removes trailing spaces and collapses extra blank lines. Save the game to keep changes.`,
    );
    if (!confirmed) return;

    const cleanedPages = options.removeExtraWhitespace();
    whitespaceStatus.textContent =
      cleanedPages > 0
        ? `Cleaned ${cleanedPages} page${cleanedPages === 1 ? '' : 's'}. Save the game to keep changes.`
        : 'No extra whitespace found.';
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
  host.querySelector('[data-action="remove-extra-whitespace"]')?.addEventListener('click', onRemoveExtraWhitespace);
  host.querySelector('[data-action="export-journal"]')?.addEventListener('click', onExport);
  host.querySelector('[data-action="delete"]')?.addEventListener('click', onDelete);

  const cleanupCollapsible = wireCollapsiblePanels(host);

  return () => {
    cleanupCollapsible();
    host.querySelector('[data-action="clear-abandoned-embeds"]')?.removeEventListener(
      'click',
      onClearAbandonedEmbeds,
    );
    host.querySelector('[data-action="remove-extra-whitespace"]')?.removeEventListener(
      'click',
      onRemoveExtraWhitespace,
    );
    host.querySelector('[data-action="export-journal"]')?.removeEventListener('click', onExport);
    host.querySelector('[data-action="delete"]')?.removeEventListener('click', onDelete);
  };
}
