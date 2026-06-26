import {
  fetchCheckboxConnections,
  fetchProgressBars,
  fetchGame,
  fetchGameJournal,
  fetchMaps,
  fetchMobyGamesForGame,
  fetchRetroAchievementsForGame,
} from '../api/client.js';
import { renderCollapsiblePanel, wireCollapsiblePanels } from '../components/CollapsiblePanel.js';
import { renderGameInfoHtml, wireGameInfoPanel } from '../components/GameInfoPanel.js';
import { renderNotesPanelHtml, wireNotesPanel } from '../components/NotesPanel.js';
import { wirePlaytimePanel } from '../components/PlaytimePanel.js';
import { wireReturnToTop } from '../components/ReturnToTop.js';
import {
  computeTagProgress,
  mountTagProgressBlocks,
  preprocessTagProgressMarkdown,
  refreshProgressUi,
  renderCompletionSummaryHtml,
  renderProgressBarHtml,
} from '../markdown/completionProgress.js';
import {
  mergeRetroAchievements,
  renderAchievementRows,
  RA_PROGRESS_BAR_ID,
  RA_PROGRESS_BAR_NAME,
} from '../markdown/retroAchievements.js';
import {
  applyImageSources,
  applyImageViewports,
  wireClickableJournalImages,
} from '../markdown/images.js';
import {
  buildCheckboxIndex,
  collectDescendantLeaves,
  isCheckboxComplete,
} from '../markdown/checkboxes.js';
import {
  collectManagedCheckboxInputs,
  managedToCheckboxItems,
  preprocessManagedCheckboxMarkdown,
} from '../markdown/managedCheckboxes.js';
import {
  mountGameMapBlocks,
  preprocessMapMarkdown,
  syncMapPointCompletionVisuals,
  wireGameMaps,
} from '../markdown/gameMaps.js';
import { renderMarkdown } from '../markdown/render.js';
import { buildToc, renderJournalTocNav, wireTocNav } from '../markdown/toc.js';
import { getImageViewportSettings } from '../storage/settings.js';
import { getProgress, setCheckboxStates } from '../storage/progress.js';
import { isLocallyAuthenticated } from '../storage/auth.js';
import type { ProgressBar, FullJournalData, ManagedCheckbox } from '../types/index.js';
import { navigate } from '../router.js';
import { icon, iconLabel } from '../components/icons.js';

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
    const [game, journal, checkboxesData, progressBarsData, mapsData, mobyData, raData] =
      await Promise.all([
        fetchGame(slug),
        fetchGameJournal(slug),
        fetchCheckboxConnections(slug),
        fetchProgressBars(slug),
        fetchMaps(slug),
        fetchMobyGamesForGame(slug).catch(() => ({
          configured: false,
          link: null,
          info: null,
        })),
        fetchRetroAchievementsForGame(slug).catch(() => ({
          configured: false,
          link: null,
          info: null,
        })),
      ]);

    const raInfo =
      raData.info && raData.info.achievements.length > 0 ? raData.info : null;

    let progressBars = progressBarsData.tags;
    let managed = checkboxesData.checkboxes;
    if (raInfo) {
      const merged = mergeRetroAchievements(managed, progressBars, raInfo);
      managed = merged.managed;
      progressBars = merged.bars;
    }
    const checkboxes = managedToCheckboxItems(managed);
    const progress = getProgress(slug);
    const viewportSettings = getImageViewportSettings();
    const gameInfoHtml = mobyData.info ? renderGameInfoHtml(mobyData.info) : '';
    const summaryHtml = renderCompletionSummaryHtml(
      slug,
      progressBars,
      checkboxes,
      progress.checkedItems,
      managed,
    );

    const achievementsBar = raInfo
      ? progressBars.find((bar) => bar.id === RA_PROGRESS_BAR_ID)
      : undefined;
    const achievementsHtml =
      raInfo && achievementsBar
        ? renderCollapsiblePanel({
            id: 'achievements-section',
            title: RA_PROGRESS_BAR_NAME,
            className: 'achievements-section',
            content: `
              <div class="achievements-panel-inner">
                ${renderProgressBarHtml(
                  RA_PROGRESS_BAR_NAME,
                  computeTagProgress(achievementsBar, progress.checkedItems, checkboxes, managed),
                  { tagId: RA_PROGRESS_BAR_ID },
                )}
                <ul id="achievements-list" class="achievement-list"></ul>
              </div>
            `,
          })
        : '';

    const sortedPages = [...journal.pages].sort((a, b) => a.order - b.order);
    let activePageId = params.page ?? sortedPages[0]?.id ?? 'main';
    if (!sortedPages.some((page) => page.id === activePageId)) {
      activePageId = sortedPages[0]?.id ?? 'main';
    }

    const signedIn = isLocallyAuthenticated();
    const editButton = signedIn
      ? `<button type="button" id="edit-game" class="btn-secondary">${iconLabel('edit', 'Edit')}</button>`
      : '';

    container.innerHTML = `
      <div class="viewer-shell">
        <div id="viewer-top" class="viewer-header">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 class="page-heading">${escapeHtml(game.name)}</h1>
            </div>
            <div class="flex flex-wrap gap-2">
              ${editButton}
            </div>
          </div>
        </div>

        ${gameInfoHtml}
        ${summaryHtml}
        ${achievementsHtml}
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
          ${icon('arrow-up', 'ui-icon ui-icon-lg')}
        </button>
      </div>
    `;

    const cleanupCollapsible = wireCollapsiblePanels(container);
    const cleanupPlaytime = wirePlaytimePanel(container, slug);
    const cleanupNotes = wireNotesPanel(container, slug);
    wireGameInfoPanel(container);

    const body = container.querySelector('#markdown-body') as HTMLElement;
    const tocContent = container.querySelector('#toc-content') as HTMLElement;
    const returnTopButton = container.querySelector('#return-top') as HTMLElement;
    const viewerTop = container.querySelector('#viewer-top') as HTMLElement;

    let cleanupToc: (() => void) | null = null;
    let cleanupGameMaps: (() => void) | null = null;
    let cleanupImageLinks: (() => void) | null = null;
    let cleanupReturnTop = wireReturnToTop(returnTopButton, viewerTop);

    const scrollJournalIntoView = () => {
      const journalPanel = container.querySelector('.viewer-content-panel') as HTMLElement | null;
      journalPanel?.scrollIntoView({ block: 'start' });
    };

    const managedLabelById = new Map(managed.map((checkbox) => [checkbox.id, checkbox.label]));

    const renderPage = (pageId: string, options: { scrollIntoView?: boolean } = {}) => {
      activePageId = pageId;
      const content = journal.contents[pageId] ?? '';
      body.innerHTML = renderMarkdown(
        preprocessMapMarkdown(
          preprocessTagProgressMarkdown(
            preprocessManagedCheckboxMarkdown(content, managedLabelById),
          ),
        ),
      );
      cleanupGameMaps?.();
      mountGameMapBlocks(body, mapsData);
      mountTagProgressBlocks(body, progressBars, checkboxes, progress.checkedItems, managed);
      applyImageSources(body);
      applyImageViewports(body, viewportSettings);
      cleanupImageLinks?.();
      cleanupImageLinks = wireClickableJournalImages(body);

      const achievementsList = container.querySelector('#achievements-list');
      if (raInfo && achievementsList) {
        achievementsList.innerHTML = renderAchievementRows(raInfo, progress.checkedItems);
      }

      const syncCheckboxVisuals = wireCheckboxes(
        container,
        slug,
        checkboxes,
        progress.checkedItems,
        progressBars,
        managed,
        container,
      );
      cleanupGameMaps = wireGameMaps(body, {
        gameSlug: slug,
        checkboxes: managed,
        checkedItems: progress.checkedItems,
        onProgressUpdate: (checkedItems) => {
          progress.checkedItems = checkedItems;
          refreshProgressUi(container, progressBars, checkboxes, checkedItems, managed);
          syncCheckboxVisuals(checkedItems);
        },
      });

      const tocEntries = buildToc(body);
      tocContent.innerHTML = renderJournalTocNav(sortedPages, pageId, tocEntries, slug);
      cleanupToc?.();
      cleanupToc = wireTocNav(tocContent, {
        onPageChange: (nextPageId) => {
          if (nextPageId === activePageId) return;
          renderPage(nextPageId, { scrollIntoView: true });
          const path = `/viewer/${slug}/${nextPageId}`;
          if (window.location.pathname !== path) {
            history.pushState(null, '', path);
          }
        },
      });

      if (options.scrollIntoView) {
        queueMicrotask(scrollJournalIntoView);
      }
    };

    renderPage(activePageId);

    const onEdit = () => {
      navigate(`/editor/${slug}`);
    };

    if (signedIn) {
      container.querySelector('#edit-game')?.addEventListener('click', onEdit);
    }

    return () => {
      cleanupImageLinks?.();
      cleanupGameMaps?.();
      cleanupCollapsible();
      cleanupPlaytime();
      cleanupNotes();
      cleanupToc?.();
      cleanupReturnTop();
      if (signedIn) {
        container.querySelector('#edit-game')?.removeEventListener('click', onEdit);
      }
    };
  } catch (error) {
    container.innerHTML = `
      <div class="panel border-red-500/40 max-w-3xl mx-auto">
        <h2 class="text-xl font-semibold mb-2">Failed to load journal</h2>
        <p class="text-muted mb-4">${escapeHtml(error instanceof Error ? error.message : 'Unknown error')}</p>
        <button type="button" id="back-library" class="btn-secondary">${iconLabel('library', 'Back to Library')}</button>
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
  checkboxes: ReturnType<typeof managedToCheckboxItems>,
  checkedItems: Record<string, boolean>,
  progressBars: ProgressBar[],
  managed: ManagedCheckbox[],
  root: HTMLElement,
): (state: Record<string, boolean>) => void {
  const index = buildCheckboxIndex(checkboxes);
  const inputs = collectManagedCheckboxInputs(container);

  const syncCheckboxVisuals = (state: Record<string, boolean>) => {
    inputs.forEach((input) => {
      const id = input.dataset.cbId;
      if (!id) return;

      const item = index.get(id);
      if (!item) return;

      input.disabled = false;
      input.checked = isCheckboxComplete(id, index, state);
      input.indeterminate = false;

      if (item.childIds.length > 0) {
        const completedChildren = item.childIds.filter((childId) =>
          isCheckboxComplete(childId, index, state),
        ).length;
        input.indeterminate =
          completedChildren > 0 && completedChildren < item.childIds.length;
      }

      const row = input.closest('.managed-checkbox');
      if (row) {
        row.classList.toggle('is-checked', input.checked && !input.indeterminate);
        row.classList.toggle('is-indeterminate', input.indeterminate);
        row.classList.toggle(
          'is-unchecked',
          !input.checked && !input.indeterminate,
        );
      }
    });
  };

  syncCheckboxVisuals(checkedItems);

  inputs.forEach((input) => {
    const id = input.dataset.cbId;
    if (!id) return;

    const item = index.get(id);
    if (!item) return;

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
      syncMapPointCompletionVisuals(container, managed, updated.checkedItems);
      refreshProgressUi(root, progressBars, checkboxes, updated.checkedItems, managed);
    });
  });

  return syncCheckboxVisuals;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
