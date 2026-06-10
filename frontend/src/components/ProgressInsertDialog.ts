import { upsertProgressBarByName } from '../markdown/progressBars.js';
import { icon, iconLabel } from './icons.js';
import type { ProgressBar } from '../types/index.js';

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
      <p class="text-muted text-sm mb-4">The progress bar updates when you leave the name field.</p>
      <div id="progress-insert-form" class="space-y-3">
        <label class="block">
          <span class="label">Progress bar name</span>
          <input type="text" id="progress-bar-name" class="input" placeholder="e.g. Complete World 1" />
        </label>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn-secondary" data-action="close">${iconLabel('close', 'Done')}</button>
        </div>
      </div>
    </div>
  `;

  const nameInput = overlay.querySelector('#progress-bar-name') as HTMLInputElement;
  let linkedBarId: string | null = null;

  const close = () => {
    commitName();
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };

  const commitName = () => {
    const bars = options.getProgressBars?.() ?? options.progressBars;
    const bar = upsertProgressBarByName(nameInput.value, bars, linkedBarId, {
      onRegister: (entry) => {
        linkedBarId = entry.id;
        options.onRegisterProgressBar?.(entry);
      },
      onUpdate: options.onUpdateProgressBar,
    });

    if (!bar) {
      options.onCommitProgressBar?.(null);
      return;
    }

    linkedBarId = bar.id;
    options.onCommitProgressBar?.(bar);
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
