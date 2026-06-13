import { slugifyProgressBarId } from '../markdown/completionProgress.js';
import { SLUG_ID_PATTERN } from '../markdown/managedCheckboxes.js';
import { renderListSearchBar, wireListSearch } from './listSearch.js';
import { icon, iconLabel } from './icons.js';
import type { ProgressBar } from '../types/index.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatProgressBarLabel(bar: ProgressBar): string {
  return bar.name.trim() || 'Untitled progress bar';
}

export function openProgressInsertDialog(options: {
  progressBars: ProgressBar[];
  getProgressBars?: () => ProgressBar[];
  onCommitProgressBar?: (bar: ProgressBar | null) => void;
  onRegisterProgressBar?: (bar: ProgressBar) => void;
  onUpdateProgressBar?: (id: string, updates: { name: string }) => void;
}): void {
  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay progress-insert-overlay';
  overlay.innerHTML = `
    <div class="auth-dialog progress-insert-dialog panel" role="dialog" aria-modal="true" aria-labelledby="progress-insert-title">
      <div class="image-insert-header">
        <h2 id="progress-insert-title" class="auth-dialog-title">Insert progress bar</h2>
        <button type="button" class="image-insert-close" data-action="close" aria-label="Close">${icon('close', 'ui-icon ui-icon-md')}</button>
      </div>
      <p class="text-muted text-sm mb-4">Insert an existing progress bar or create a new one.</p>
      ${
        options.progressBars.length > 0
          ? `
            <div class="progress-insert-list mb-4">
              <p class="label mb-2">Existing progress bars</p>
              ${renderListSearchBar({ id: 'progress-insert-search', placeholder: 'Search progress bars...', className: 'mb-2' })}
              <div class="progress-tag-options">
                ${options.progressBars
                  .map((bar) => {
                    const title = formatProgressBarLabel(bar);
                    return `
                      <button
                        type="button"
                        class="btn-secondary text-sm"
                        data-action="pick-progress-bar"
                        data-progress-bar-id="${escapeHtml(bar.id)}"
                        data-search-text="${escapeHtml(`${title} ${bar.id}`)}"
                      >
                        ${iconLabel('progress', title, 'ui-icon ui-icon-sm')}
                      </button>
                    `;
                  })
                  .join('')}
              </div>
            </div>
          `
          : ''
      }
      <div id="progress-insert-form" class="space-y-3">
        <p class="label">Create new progress bar</p>
        <label class="block">
          <span class="label">Progress bar name</span>
          <input type="text" id="progress-bar-name" class="input" placeholder="e.g. Complete World 1" required />
        </label>
        <label class="block">
          <span class="label">Progress bar id</span>
          <input
            type="text"
            id="progress-bar-id"
            class="input"
            placeholder="e.g. complete-world-1"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            required
          />
          <p class="hint mt-1">Lowercase letters, numbers, and hyphens only.</p>
        </label>
        <p id="progress-insert-error" class="text-sm text-red-400 hidden"></p>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn-primary" data-action="insert-new">${iconLabel('progress', 'Insert')}</button>
          <button type="button" class="btn-secondary" data-action="close">${iconLabel('close', 'Cancel')}</button>
        </div>
      </div>
    </div>
  `;

  const listSearch = wireListSearch(overlay);
  const nameInput = overlay.querySelector('#progress-bar-name') as HTMLInputElement;
  const idInput = overlay.querySelector('#progress-bar-id') as HTMLInputElement;
  const errorEl = overlay.querySelector('#progress-insert-error') as HTMLElement;
  const existingIds = new Set(options.progressBars.map((bar) => bar.id));
  let idTouched = false;

  const close = () => {
    listSearch.cleanup();
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };

  const showError = (message: string) => {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  };

  const clearError = () => {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
  };

  const commitBar = (bar: ProgressBar) => {
    options.onCommitProgressBar?.(bar);
    close();
  };

  const maybeSuggestId = () => {
    if (idTouched || idInput.value.trim()) return;
    const name = nameInput.value.trim();
    if (!name) return;
    idInput.value = slugifyProgressBarId(name, existingIds);
  };

  overlay.querySelectorAll('[data-action="close"]').forEach((button) => {
    button.addEventListener('click', close);
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  overlay.querySelectorAll('[data-action="pick-progress-bar"]').forEach((button) => {
    button.addEventListener('click', () => {
      const barId = (button as HTMLElement).dataset.progressBarId;
      const bars = options.getProgressBars?.() ?? options.progressBars;
      const bar = bars.find((entry) => entry.id === barId);
      if (!bar) return;
      commitBar(bar);
    });
  });

  nameInput.addEventListener('blur', maybeSuggestId);
  idInput.addEventListener('input', () => {
    idTouched = true;
    clearError();
  });
  nameInput.addEventListener('input', clearError);

  overlay.querySelector('[data-action="insert-new"]')?.addEventListener('click', () => {
    clearError();

    const name = nameInput.value.trim();
    const id = idInput.value.trim();
    if (!name || !id) return;

    if (!SLUG_ID_PATTERN.test(id)) {
      showError('Progress bar id must use lowercase letters, numbers, and hyphens.');
      idInput.focus();
      return;
    }

    const bars = options.getProgressBars?.() ?? options.progressBars;
    const existing = bars.find((bar) => bar.id === id);
    if (existing) {
      const next = { ...existing, name };
      if (existing.name.trim() !== name) {
        options.onUpdateProgressBar?.(id, { name });
      }
      commitBar(next);
      return;
    }

    const bar: ProgressBar = { id, name, showInSummary: false };
    options.onRegisterProgressBar?.(bar);
    commitBar(bar);
  });

  document.addEventListener('keydown', onKeyDown);
  document.body.appendChild(overlay);
  nameInput.focus();
}
