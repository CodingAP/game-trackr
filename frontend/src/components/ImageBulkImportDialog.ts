import { icon, iconLabel } from './icons.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export interface ImageBulkImportResult {
  added: number;
  errors: string[];
}

export function openImageBulkImportDialog(options: {
  onImport: (text: string) => Promise<ImageBulkImportResult>;
}): void {
  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay image-bulk-import-overlay';
  overlay.innerHTML = `
    <div class="auth-dialog image-bulk-import-dialog panel" role="dialog" aria-modal="true" aria-labelledby="image-bulk-import-title">
      <div class="image-insert-header">
        <h2 id="image-bulk-import-title" class="auth-dialog-title">Bulk import media URLs</h2>
        <button type="button" class="image-insert-close" data-action="close" aria-label="Close">${icon('close', 'ui-icon ui-icon-md')}</button>
      </div>
      <label class="block mb-3">
        <span class="label">Media URLs</span>
        <textarea
          id="image-bulk-import-input"
          class="input checkbox-bulk-import-textarea"
          rows="10"
          placeholder="https://example.com/image.png&#10;https://example.com/photo.jpg;Boss arena;Wiki;https://example.com/wiki"
        ></textarea>
      </label>
      <div id="image-bulk-import-feedback" class="checkbox-bulk-import-feedback hidden"></div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-primary" data-action="import">${iconLabel('import', 'Import')}</button>
        <button type="button" class="btn-secondary" data-action="close">${iconLabel('close', 'Cancel')}</button>
      </div>
    </div>
  `;

  const textarea = overlay.querySelector('#image-bulk-import-input') as HTMLTextAreaElement;
  const feedbackEl = overlay.querySelector('#image-bulk-import-feedback') as HTMLElement;
  const importButton = overlay.querySelector('[data-action="import"]') as HTMLButtonElement | null;
  const cancelButtons = overlay.querySelectorAll('[data-action="close"]');

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

  const setBusy = (busy: boolean) => {
    importButton?.toggleAttribute('disabled', busy);
    textarea.toggleAttribute('disabled', busy);
    cancelButtons.forEach((button) => {
      (button as HTMLButtonElement).toggleAttribute('disabled', busy);
    });
  };

  cancelButtons.forEach((button) => {
    button.addEventListener('click', close);
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  textarea.addEventListener('input', clearFeedback);

  importButton?.addEventListener('click', () => {
    void (async () => {
      clearFeedback();

      const text = textarea.value.trim();
      if (!text) {
        showFeedback('Paste at least one media URL.', true);
        return;
      }

      setBusy(true);
      showFeedback('Importing media...', false);

      try {
        const result = await options.onImport(text);
        if (result.added === 0 && result.errors.length === 0) {
          showFeedback('No media URLs found. Add at least one data row.', true);
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
            `<p class="text-sm font-medium mb-2">Imported ${result.added} file${result.added === 1 ? '' : 's'} with ${result.errors.length} issue${result.errors.length === 1 ? '' : 's'}:</p><ul class="checkbox-bulk-import-error-list">${result.errors
              .map((error) => `<li>${escapeHtml(error)}</li>`)
              .join('')}</ul>`,
            true,
          );
          return;
        }

        close();
      } finally {
        setBusy(false);
      }
    })();
  });

  document.addEventListener('keydown', onKeyDown);
  document.body.appendChild(overlay);
  textarea.focus();
}
