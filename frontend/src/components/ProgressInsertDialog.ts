import { buildTagProgressMarker } from '../markdown/completionProgress.js';
import { renderListSearchBar, wireListSearch } from './listSearch.js';
import { icon, iconLabel } from './icons.js';
import type { CompletionTag } from '../types/index.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function openProgressInsertDialog(options: {
  tags: CompletionTag[];
  onInsert: (marker: string) => void;
}): void {
  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay progress-insert-overlay';
  overlay.innerHTML = `
    <div class="auth-dialog progress-insert-dialog panel" role="dialog" aria-modal="true" aria-labelledby="progress-insert-title">
      <div class="image-insert-header">
        <h2 id="progress-insert-title" class="auth-dialog-title">Insert progress bar</h2>
        <button type="button" class="image-insert-close" data-action="close" aria-label="Close">${icon('close', 'ui-icon ui-icon-md')}</button>
      </div>
      <p class="text-muted text-sm mb-4">Inserts a completion tag progress bar at the cursor.</p>
      ${
        options.tags.length > 0
          ? `
            <div class="progress-tag-list mb-4">
              <p class="label mb-2">Completion tags</p>
              ${renderListSearchBar({ id: 'progress-insert-search', placeholder: 'Search tags...', className: 'mb-2' })}
              <div class="progress-tag-options">
                ${options.tags
                  .map((tag) => {
                    const name = tag.name.trim() || 'Untitled tag';
                    return `
                      <button
                        type="button"
                        class="btn-secondary text-sm"
                        data-action="pick-tag"
                        data-tag-id="${tag.id}"
                        data-search-text="${escapeHtml(`${name} ${tag.id}`)}"
                      >
                        ${iconLabel('tag', name, 'ui-icon ui-icon-sm')}
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
        <label class="block">
          <span class="label">Tag name</span>
          <input type="text" id="progress-tag-name" class="input" placeholder="e.g. Complete World 1" required />
        </label>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn-primary" data-action="insert-new">${iconLabel('progress', 'Insert')}</button>
          <button type="button" class="btn-secondary" data-action="close">${iconLabel('close', 'Cancel')}</button>
        </div>
      </div>
    </div>
  `;

  const nameInput = overlay.querySelector('#progress-tag-name') as HTMLInputElement;
  const listSearch = wireListSearch(overlay);

  const close = () => {
    listSearch.cleanup();
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };

  const insertForTag = (tag: CompletionTag) => {
    options.onInsert(buildTagProgressMarker(tag));
    close();
  };

  overlay.querySelectorAll('[data-action="close"]').forEach((button) => {
    button.addEventListener('click', close);
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  overlay.querySelectorAll('[data-action="pick-tag"]').forEach((button) => {
    button.addEventListener('click', () => {
      const tagId = (button as HTMLElement).dataset.tagId;
      const tag = options.tags.find((entry) => entry.id === tagId);
      if (tag) insertForTag(tag);
    });
  });

  overlay.querySelector('[data-action="insert-new"]')?.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) return;
    options.onInsert(buildTagProgressMarker({ id: '', name }));
    close();
  });

  document.addEventListener('keydown', onKeyDown);
  document.body.appendChild(overlay);
  nameInput.focus();
}
