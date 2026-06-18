import { icon, iconLabel } from './icons.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export interface CheckboxBulkImportResult {
  added: number;
  errors: string[];
}

export function openCheckboxBulkImportDialog(options: {
  onImport: (text: string) => CheckboxBulkImportResult;
}): void {
  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay checkbox-bulk-import-overlay';
  overlay.innerHTML = `
    <div class="auth-dialog checkbox-bulk-import-dialog panel" role="dialog" aria-modal="true" aria-labelledby="checkbox-bulk-import-title">
      <div class="image-insert-header">
        <h2 id="checkbox-bulk-import-title" class="auth-dialog-title">Bulk add checkboxes</h2>
        <button type="button" class="image-insert-close" data-action="close" aria-label="Close">${icon('close', 'ui-icon ui-icon-md')}</button>
      </div>
      <p class="text-muted text-sm mb-3">
        Paste one checkbox per line. A plain line is just a label. Use semicolons for parent and progress bars.
      </p>
      <p class="hint mb-3">
        Simple: <code>Defeat the boss</code> (one per line)<br />
        Full format: <code>Label;Parent;Progress Bars</code><br />
        Example: <code>Find the key;Defeat the boss;Main quest, Collectibles</code>
      </p>
      <label class="block mb-3">
        <span class="label">Checkbox data</span>
        <textarea
          id="checkbox-bulk-import-input"
          class="input checkbox-bulk-import-textarea"
          rows="10"
          placeholder="Defeat the boss&#10;Find the key&#10;Collect all coins;Main quest;Collectibles"
        ></textarea>
      </label>
      <div id="checkbox-bulk-import-feedback" class="checkbox-bulk-import-feedback hidden"></div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-primary" data-action="import">${iconLabel('import', 'Import')}</button>
        <button type="button" class="btn-secondary" data-action="close">${iconLabel('close', 'Cancel')}</button>
      </div>
    </div>
  `;

  const textarea = overlay.querySelector('#checkbox-bulk-import-input') as HTMLTextAreaElement;
  const feedbackEl = overlay.querySelector('#checkbox-bulk-import-feedback') as HTMLElement;

  const close = () => {
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };

  const showFeedback = (message: string, isError: boolean) => {
    feedbackEl.innerHTML = message;
    feedbackEl.classList.remove('hidden', 'checkbox-bulk-import-feedback-error', 'checkbox-bulk-import-feedback-success');
    feedbackEl.classList.add(isError ? 'checkbox-bulk-import-feedback-error' : 'checkbox-bulk-import-feedback-success');
  };

  const clearFeedback = () => {
    feedbackEl.textContent = '';
    feedbackEl.classList.add('hidden');
    feedbackEl.classList.remove('checkbox-bulk-import-feedback-error', 'checkbox-bulk-import-feedback-success');
  };

  overlay.querySelectorAll('[data-action="close"]').forEach((button) => {
    button.addEventListener('click', close);
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  textarea.addEventListener('input', clearFeedback);

  overlay.querySelector('[data-action="import"]')?.addEventListener('click', () => {
    clearFeedback();

    const text = textarea.value.trim();
    if (!text) {
      showFeedback('Paste at least one line of checkbox data.', true);
      return;
    }

    const result = options.onImport(text);
    if (result.added === 0 && result.errors.length === 0) {
      showFeedback('No checkboxes found. Add at least one data row.', true);
      return;
    }

    if (result.added === 0 && result.errors.length > 0) {
      showFeedback(
        `<p class="text-sm font-medium mb-2">Nothing was imported.</p><ul class="checkbox-bulk-import-error-list">${result.errors
          .map((error) => `<li>${escapeHtml(error)}</li>`)
          .join('')}</ul>`,
        true,
      );
      return;
    }

    if (result.errors.length > 0) {
      showFeedback(
        `<p class="text-sm font-medium mb-2">Imported ${result.added} checkbox${result.added === 1 ? '' : 'es'} with ${result.errors.length} issue${result.errors.length === 1 ? '' : 's'}:</p><ul class="checkbox-bulk-import-error-list">${result.errors
          .map((error) => `<li>${escapeHtml(error)}</li>`)
          .join('')}</ul>`,
        true,
      );
      return;
    }

    close();
  });

  document.addEventListener('keydown', onKeyDown);
  document.body.appendChild(overlay);
  textarea.focus();
}
