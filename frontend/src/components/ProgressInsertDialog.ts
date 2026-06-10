import { slugifyProgressBarId } from '../markdown/completionProgress.js';
import { icon, iconLabel } from './icons.js';
import type { CompletionTag } from '../types/index.js';

export function openProgressInsertDialog(options: {
  tags: CompletionTag[];
  getTags?: () => CompletionTag[];
  onCommitTag?: (tag: CompletionTag | null) => void;
  onRegisterTag?: (tag: CompletionTag) => void;
  onUpdateTag?: (id: string, updates: { name: string }) => void;
}): void {
  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay progress-insert-overlay';
  overlay.innerHTML = `
    <div class="auth-dialog progress-insert-dialog panel" role="dialog" aria-modal="true" aria-labelledby="progress-insert-title">
      <div class="image-insert-header">
        <h2 id="progress-insert-title" class="auth-dialog-title">Insert progress bar</h2>
        <button type="button" class="image-insert-close" data-action="close" aria-label="Close">${icon('close', 'ui-icon ui-icon-md')}</button>
      </div>
      <p class="text-muted text-sm mb-4">The progress bar updates when you leave the name field.</p>
      <div id="progress-insert-form" class="space-y-3">
        <label class="block">
          <span class="label">Progress bar name</span>
          <input type="text" id="progress-tag-name" class="input" placeholder="e.g. Complete World 1" />
        </label>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn-secondary" data-action="close">${iconLabel('close', 'Done')}</button>
        </div>
      </div>
    </div>
  `;

  const nameInput = overlay.querySelector('#progress-tag-name') as HTMLInputElement;
  let linkedTagId: string | null = null;

  const close = () => {
    commitName();
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };

  const commitName = () => {
    const trimmed = nameInput.value.trim();
    if (!trimmed) {
      options.onCommitTag?.(null);
      return;
    }

    const tags = options.getTags?.() ?? options.tags;
    const existingIds = new Set(tags.map((tag) => tag.id));
    const existing = tags.find(
      (tag) => tag.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );

    let tag: CompletionTag;
    if (existing) {
      linkedTagId = existing.id;
      tag = existing;
      if (existing.name.trim() !== trimmed) {
        options.onUpdateTag?.(existing.id, { name: trimmed });
        tag = { ...existing, name: trimmed };
      }
    } else if (linkedTagId) {
      options.onUpdateTag?.(linkedTagId, { name: trimmed });
      tag = {
        id: linkedTagId,
        name: trimmed,
        showInSummary: false,
      };
    } else {
      tag = {
        id: slugifyProgressBarId(trimmed, existingIds),
        name: trimmed,
        showInSummary: false,
      };
      linkedTagId = tag.id;
      options.onRegisterTag?.(tag);
    }

    options.onCommitTag?.(tag);
  };

  overlay.querySelectorAll('[data-action="close"]').forEach((button) => {
    button.addEventListener('click', close);
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  nameInput.addEventListener('blur', commitName);

  document.addEventListener('keydown', onKeyDown);
  document.body.appendChild(overlay);
  nameInput.focus();
}
