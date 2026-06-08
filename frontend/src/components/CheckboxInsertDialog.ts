import {
  buildCheckboxMarker,
  formatManagedCheckboxLabel,
  slugifyCheckboxId,
} from '../markdown/managedCheckboxes.js';
import { renderListSearchBar, wireListSearch } from './listSearch.js';
import { icon, iconLabel } from './icons.js';
import type { ManagedCheckbox } from '../types/index.js';

const CHECKBOX_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function openCheckboxInsertDialog(options: {
  checkboxes: ManagedCheckbox[];
  onInsert: (marker: string) => void;
  onRegisterCheckbox?: (checkbox: ManagedCheckbox) => void;
}): void {
  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay checkbox-insert-overlay';
  overlay.innerHTML = `
    <div class="auth-dialog checkbox-insert-dialog panel" role="dialog" aria-modal="true" aria-labelledby="checkbox-insert-title">
      <div class="image-insert-header">
        <h2 id="checkbox-insert-title" class="auth-dialog-title">Insert checkbox</h2>
        <button type="button" class="image-insert-close" data-action="close" aria-label="Close">${icon('close', 'ui-icon ui-icon-md')}</button>
      </div>
      <p class="text-muted text-sm mb-4">Inserts a managed checkbox marker at the cursor.</p>
      ${
        options.checkboxes.length > 0
          ? `
            <div class="checkbox-insert-list mb-4">
              <p class="label mb-2">Existing checkboxes</p>
              ${renderListSearchBar({ id: 'checkbox-insert-search', placeholder: 'Search checkboxes...', className: 'mb-2' })}
              <div class="progress-tag-options">
                ${options.checkboxes
                  .map((checkbox) => {
                    const title = formatManagedCheckboxLabel(checkbox);
                    return `
                      <button
                        type="button"
                        class="btn-secondary text-sm"
                        data-action="pick-checkbox"
                        data-checkbox-id="${escapeHtml(checkbox.id)}"
                        data-search-text="${escapeHtml(`${title} ${checkbox.id} ${checkbox.label}`)}"
                      >
                        ${iconLabel('checkbox', title, 'ui-icon ui-icon-sm')}
                      </button>
                    `;
                  })
                  .join('')}
              </div>
            </div>
          `
          : ''
      }
      <div id="checkbox-insert-form" class="space-y-3">
        <label class="block">
          <span class="label">Label</span>
          <input type="text" id="checkbox-label" class="input" placeholder="e.g. Defeat the boss" required />
        </label>
        <label class="block">
          <span class="label">Checkbox id</span>
          <input
            type="text"
            id="checkbox-id"
            class="input"
            placeholder="e.g. defeat-boss"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            required
          />
          <p class="hint mt-1">Lowercase letters, numbers, and hyphens only.</p>
        </label>
        <p id="checkbox-insert-error" class="text-sm text-red-400 hidden"></p>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn-primary" data-action="insert-new">${iconLabel('checkbox', 'Insert')}</button>
          <button type="button" class="btn-secondary" data-action="close">${iconLabel('close', 'Cancel')}</button>
        </div>
      </div>
    </div>
  `;

  const listSearch = wireListSearch(overlay);
  const labelInput = overlay.querySelector('#checkbox-label') as HTMLInputElement;
  const idInput = overlay.querySelector('#checkbox-id') as HTMLInputElement;
  const errorEl = overlay.querySelector('#checkbox-insert-error') as HTMLElement;
  const existingIds = new Set(options.checkboxes.map((checkbox) => checkbox.id));
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

  const insertForCheckbox = (checkbox: ManagedCheckbox, label?: string) => {
    options.onInsert(buildCheckboxMarker(checkbox.id, label ?? (checkbox.label.trim() || checkbox.id)));
    close();
  };

  const maybeSuggestId = () => {
    if (idTouched || idInput.value.trim()) return;
    const label = labelInput.value.trim();
    if (!label) return;
    idInput.value = slugifyCheckboxId(label, existingIds);
  };

  overlay.querySelectorAll('[data-action="close"]').forEach((button) => {
    button.addEventListener('click', close);
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  overlay.querySelectorAll('[data-action="pick-checkbox"]').forEach((button) => {
    button.addEventListener('click', () => {
      const checkboxId = (button as HTMLElement).dataset.checkboxId;
      const checkbox = options.checkboxes.find((entry) => entry.id === checkboxId);
      if (checkbox) insertForCheckbox(checkbox);
    });
  });

  labelInput.addEventListener('blur', maybeSuggestId);
  idInput.addEventListener('input', () => {
    idTouched = true;
    clearError();
  });
  labelInput.addEventListener('input', clearError);

  overlay.querySelector('[data-action="insert-new"]')?.addEventListener('click', () => {
    clearError();

    const label = labelInput.value.trim();
    const id = idInput.value.trim();
    if (!label || !id) return;

    if (!CHECKBOX_ID_PATTERN.test(id)) {
      showError('Checkbox id must use lowercase letters, numbers, and hyphens.');
      idInput.focus();
      return;
    }

    const existing = options.checkboxes.find((checkbox) => checkbox.id === id);
    if (existing) {
      insertForCheckbox(existing, label);
      return;
    }

    if (options.onRegisterCheckbox) {
      options.onRegisterCheckbox({
        id,
        label,
        parentId: null,
        tagIds: [],
      });
    }

    options.onInsert(buildCheckboxMarker(id, label));
    close();
  });

  document.addEventListener('keydown', onKeyDown);
  document.body.appendChild(overlay);
  labelInput.focus();
}
