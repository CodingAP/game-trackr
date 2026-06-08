import { fetchCheckboxConnections, fetchGames, fetchMobyGamesForGame } from '../api/client.js';
import { renderImportGameControls, wireImportGameButton } from '../components/ImportGameButton.js';
import { renderCollapsiblePanel, wireCollapsiblePanels } from '../components/CollapsiblePanel.js';
import { renderLibraryMobyHtml } from '../components/GameInfoPanel.js';
import { getProgressCheckboxes, isCheckboxComplete, buildCheckboxIndex } from '../markdown/checkboxes.js';
import { isLocallyAuthenticated } from '../storage/auth.js';
import { getProgress } from '../storage/progress.js';
import { buildCheckboxItemsForProgress } from '../utils/journalBundle.js';
import { navigate } from '../router.js';
import { iconLabel } from '../components/icons.js';

function renderLibraryHeaderActions(signedIn: boolean): string {
  if (!signedIn) return '';

  return `
    <div class="library-header-actions">
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

export async function renderLibrary(container: HTMLElement): Promise<() => void> {
  container.innerHTML = '<div class="app-shell"><p class="text-muted">Loading games...</p></div>';
  const signedIn = isLocallyAuthenticated();

  try {
    const games = await fetchGames();

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

    const cards = await Promise.all(
      games.map(async (game) => {
        let progressLabel = 'No progress yet';
        let mobyHtml = '';

        const [checkboxesResult, mobyResult] = await Promise.allSettled([
          fetchCheckboxConnections(game.slug),
          fetchMobyGamesForGame(game.slug),
        ]);

        if (mobyResult.status === 'fulfilled' && mobyResult.value.info) {
          mobyHtml = renderLibraryMobyHtml(mobyResult.value.info);
        }

        if (checkboxesResult.status === 'fulfilled') {
          try {
            const checkboxes = buildCheckboxItemsForProgress(checkboxesResult.value);
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

        const editButton = signedIn
          ? `<button type="button" class="btn-secondary" data-edit="${game.slug}">${iconLabel('edit', 'Edit')}</button>`
          : '';

        return renderCollapsiblePanel({
          title: game.name,
          className: 'library-game-card',
          content: `
            <div class="flex flex-col gap-3">
              ${mobyHtml}
              <p class="text-sm text-status">${progressLabel}</p>
              <div class="library-game-actions mt-auto">
                <button type="button" class="btn-primary" data-view="${game.slug}">${iconLabel('eye', 'View')}</button>
                ${editButton}
              </div>
            </div>
          `,
        });
      }),
    );

    container.innerHTML = `
      <div class="app-shell">
        <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 class="page-heading mb-1">Game Library</h1>
            <p class="text-muted">Pick a journal to track your completion progress.</p>
          </div>
          ${renderLibraryHeaderActions(signedIn)}
        </div>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${cards.join('')}</div>
      </div>
    `;

    const onCreate = () => navigate('/editor');
    const onView = (event: Event) => {
      const slug = (event.currentTarget as HTMLElement).dataset.view;
      if (slug) navigate(`/viewer/${slug}`);
    };

    const onEdit = (event: Event) => {
      const slug = (event.currentTarget as HTMLElement).dataset.edit;
      if (slug) navigate(`/editor/${slug}`);
    };

    container.querySelector('#create-game')?.addEventListener('click', onCreate);
    container.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', onView);
    });
    container.querySelectorAll('[data-edit]').forEach((button) => {
      button.addEventListener('click', onEdit);
    });

    const cleanupCollapsible = wireCollapsiblePanels(container);
    const cleanupImport = signedIn ? wireImportGameButton(container) : () => {};

    return () => {
      cleanupCollapsible();
      cleanupImport();
      container.querySelector('#create-game')?.removeEventListener('click', onCreate);
      container.querySelectorAll('[data-view]').forEach((button) => {
        button.removeEventListener('click', onView);
      });
      container.querySelectorAll('[data-edit]').forEach((button) => {
        button.removeEventListener('click', onEdit);
      });
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
