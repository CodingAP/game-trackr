import {
  AuthRequiredError,
  deleteGame,
  duplicateGame,
  fetchGameImages,
} from '../api/client.js';
import { requireAuth } from './AuthPrompt.js';
import { renderCollapsiblePanel, wireCollapsiblePanels } from './CollapsiblePanel.js';
import { buildJournalExportBundle, downloadJournalBundle } from '../utils/journalBundle.js';
import type { CompletionTagsData } from '../types/index.js';
import { navigate } from '../router.js';

export function mountEditorAdmin(
  host: HTMLElement,
  slug: string,
  gameName: string,
  getContent: () => string,
  getCompletionTags: () => CompletionTagsData,
): () => void {
  host.innerHTML = `
    <div class="space-y-4">
      ${renderCollapsiblePanel({
        title: 'Export',
        content: `
          <p class="text-muted text-sm">Download this journal's markdown, completion tags, and uploaded images as a <code class="text-xs">.gametrackr.json</code> file.</p>
          <button type="button" class="btn-secondary" data-action="export-journal">Export journal</button>
          <p id="admin-export-status" class="text-muted text-sm"></p>
        `,
      })}
      ${renderCollapsiblePanel({
        title: 'Duplicate',
        content: `
          <p class="text-muted text-sm">Create a copy of this game journal with a new slug.</p>
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
          <button type="button" class="btn-secondary" data-action="duplicate">Duplicate game</button>
          <p id="admin-duplicate-status" class="text-muted text-sm"></p>
        `,
      })}
      ${renderCollapsiblePanel({
        title: 'Delete',
        className: 'border-red-500/40',
        content: `
          <p class="text-muted text-sm">Permanently delete this game, its markdown, images, and completion tags.</p>
          <button type="button" class="btn-danger" data-action="delete">Delete game</button>
          <p id="admin-delete-status" class="text-muted text-sm"></p>
        `,
      })}
    </div>
  `;

  const exportStatus = host.querySelector('#admin-export-status') as HTMLElement;
  const duplicateStatus = host.querySelector('#admin-duplicate-status') as HTMLElement;
  const deleteStatus = host.querySelector('#admin-delete-status') as HTMLElement;

  const onExport = async () => {
    exportStatus.textContent = 'Exporting...';

    try {
      const images = await fetchGameImages(slug);
      const bundle = await buildJournalExportBundle(
        slug,
        gameName,
        getContent(),
        getCompletionTags(),
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

  host.querySelector('[data-action="export-journal"]')?.addEventListener('click', onExport);
  host.querySelector('[data-action="duplicate"]')?.addEventListener('click', onDuplicate);
  host.querySelector('[data-action="delete"]')?.addEventListener('click', onDelete);

  const cleanupCollapsible = wireCollapsiblePanels(host);

  return () => {
    cleanupCollapsible();
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
