import { fetchCompletionTags, fetchGame, fetchGameContent, fetchMobyGamesForGame } from '../api/client.js';
import { renderCollapsiblePanel, wireCollapsiblePanels } from '../components/CollapsiblePanel.js';
import { renderGameInfoHtml, wireGameInfoPanel } from '../components/GameInfoPanel.js';
import { renderNotesPanelHtml, wireNotesPanel } from '../components/NotesPanel.js';
import { wirePlaytimePanel } from '../components/PlaytimePanel.js';
import { wireReturnToTop } from '../components/ReturnToTop.js';
import {
  mountTagProgressBlocks,
  preprocessTagProgressMarkdown,
  refreshProgressUi,
  renderCompletionSummaryHtml,
} from '../markdown/completionProgress.js';
import { applyImageSources, applyImageViewports } from '../markdown/images.js';
import {
  buildCheckboxIndex,
  collectDescendantLeaves,
  collectTaskListItems,
  extractCheckboxes,
  isCheckboxComplete,
} from '../markdown/checkboxes.js';
import { renderMarkdown } from '../markdown/render.js';
import { buildToc, renderTocNav, wireTocNav } from '../markdown/toc.js';
import { getImageViewportSettings } from '../storage/settings.js';
import { getProgress, setCheckboxStates } from '../storage/progress.js';
import type { CompletionTag } from '../types/index.js';
import { navigate } from '../router.js';

export async function renderViewer(
  container: HTMLElement,
  params: Record<string, string>,
): Promise<() => void> {
  const slug = params.slug;
  if (!slug) {
    navigate('/');
    return () => {};
  }

  container.innerHTML = '<p class="text-muted">Loading journal...</p>';

  try {
    const [game, content, tagsData, mobyData] = await Promise.all([
      fetchGame(slug),
      fetchGameContent(slug),
      fetchCompletionTags(slug),
      fetchMobyGamesForGame(slug).catch(() => ({
        configured: false,
        link: null,
        info: null,
      })),
    ]);
    const tags = tagsData.tags;
    const checkboxes = extractCheckboxes(content);
    const progress = getProgress(slug);
    const viewportSettings = getImageViewportSettings();
    const gameInfoHtml = mobyData.info ? renderGameInfoHtml(mobyData.info) : '';
    const summaryHtml = renderCompletionSummaryHtml(slug, tags, checkboxes, progress.checkedItems);

    container.innerHTML = `
      <div class="viewer-shell">
        <div id="viewer-top" class="viewer-header">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 class="page-heading">${escapeHtml(game.name)}</h1>
            </div>
            <div class="flex flex-wrap gap-2">
              <button type="button" id="edit-game" class="btn-secondary">Edit</button>
            </div>
          </div>
        </div>

        ${gameInfoHtml}
        ${summaryHtml}
        ${renderNotesPanelHtml()}

        <div class="viewer-layout">
          ${renderCollapsiblePanel({
            id: 'viewer-toc',
            title: 'Contents',
            className: 'viewer-toc',
            content: '<div id="toc-content"></div>',
          })}
          ${renderCollapsiblePanel({
            title: 'Journal',
            className: 'viewer-content-panel',
            content: '<article id="markdown-body" class="markdown-body viewer-content"></article>',
          })}
        </div>

        <button type="button" id="return-top" class="return-top" aria-label="Return to top">
          <span aria-hidden="true">↑</span>
        </button>
      </div>
    `;

    const cleanupCollapsible = wireCollapsiblePanels(container);
    const cleanupPlaytime = wirePlaytimePanel(container, slug);
    const cleanupNotes = wireNotesPanel(container, slug);
    wireGameInfoPanel(container);

    const body = container.querySelector('#markdown-body') as HTMLElement;
    body.innerHTML = renderMarkdown(preprocessTagProgressMarkdown(content));
    mountTagProgressBlocks(body, tags, checkboxes, progress.checkedItems);
    applyImageSources(body);
    applyImageViewports(body, viewportSettings);
    wireCheckboxes(body, slug, checkboxes, progress.checkedItems, tags, container);

    const tocEntries = buildToc(body);
    const tocContent = container.querySelector('#toc-content') as HTMLElement;
    tocContent.innerHTML = renderTocNav(tocEntries);

    const returnTopButton = container.querySelector('#return-top') as HTMLElement;
    const viewerTop = container.querySelector('#viewer-top') as HTMLElement;

    const cleanupToc = wireTocNav(tocContent);
    const cleanupReturnTop = wireReturnToTop(returnTopButton, viewerTop);

    const onEdit = () => navigate(`/editor/${slug}`);

    container.querySelector('#edit-game')?.addEventListener('click', onEdit);

    return () => {
      cleanupCollapsible();
      cleanupPlaytime();
      cleanupNotes();
      cleanupToc();
      cleanupReturnTop();
      container.querySelector('#edit-game')?.removeEventListener('click', onEdit);
    };
  } catch (error) {
    container.innerHTML = `
      <div class="panel border-red-500/40 max-w-3xl mx-auto">
        <h2 class="text-xl font-semibold mb-2">Failed to load journal</h2>
        <p class="text-muted mb-4">${escapeHtml(error instanceof Error ? error.message : 'Unknown error')}</p>
        <button type="button" id="back-library" class="btn-secondary">Back to Library</button>
      </div>
    `;
    const onBack = () => navigate('/');
    container.querySelector('#back-library')?.addEventListener('click', onBack);
    return () => {
      container.querySelector('#back-library')?.removeEventListener('click', onBack);
    };
  }
}

function wireCheckboxes(
  container: HTMLElement,
  gameSlug: string,
  checkboxes: ReturnType<typeof extractCheckboxes>,
  checkedItems: Record<string, boolean>,
  tags: CompletionTag[],
  root: HTMLElement,
): void {
  const index = buildCheckboxIndex(checkboxes);
  const listItems = collectTaskListItems(container);

  const syncCheckboxVisuals = (state: Record<string, boolean>) => {
    listItems.forEach((li, itemIndex) => {
      const item = checkboxes[itemIndex];
      if (!item) return;

      const input = li.querySelector(':scope > input[type="checkbox"]') as HTMLInputElement | null;
      if (!input) return;

      input.dataset.checkboxId = item.id;
      input.checked = isCheckboxComplete(item.id, index, state);
      input.indeterminate = false;

      if (item.childIds.length > 0) {
        const completedChildren = item.childIds.filter((childId) =>
          isCheckboxComplete(childId, index, state),
        ).length;
        input.indeterminate =
          completedChildren > 0 && completedChildren < item.childIds.length;
      }
    });
  };

  syncCheckboxVisuals(checkedItems);

  listItems.forEach((li, itemIndex) => {
    const item = checkboxes[itemIndex];
    if (!item) return;

    const input = li.querySelector(':scope > input[type="checkbox"]') as HTMLInputElement | null;
    if (!input) return;

    input.disabled = false;

    input.addEventListener('change', () => {
      const targetChecked = input.checked;
      const updates: Record<string, boolean> = {};

      if (item.childIds.length > 0) {
        for (const leafId of collectDescendantLeaves(item.id, index)) {
          updates[leafId] = targetChecked;
        }
      } else {
        updates[item.id] = targetChecked;
      }

      const updated = setCheckboxStates(gameSlug, updates);
      syncCheckboxVisuals(updated.checkedItems);
      refreshProgressUi(root, tags, checkboxes, updated.checkedItems);
    });
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
