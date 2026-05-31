import { renderCollapsiblePanel } from './CollapsiblePanel.js';
import { getNotes, saveNotes } from '../storage/notes.js';

export function renderNotesPanelHtml(): string {
  return renderCollapsiblePanel({
    id: 'viewer-notes',
    title: 'Notes',
    className: 'viewer-notes',
    content: `
      <label class="notes-editor">
        <span class="label">Personal notes</span>
        <textarea
          id="game-notes-input"
          class="notes-textarea input"
          rows="6"
          placeholder="Keep track of hints, goals, reminders, or anything else for this journal..."
        ></textarea>
      </label>
      <p id="notes-save-status" class="notes-save-status text-faint text-xs" aria-live="polite"></p>
    `,
  });
}

export function wireNotesPanel(root: HTMLElement, gameSlug: string): () => void {
  const textarea = root.querySelector('#game-notes-input') as HTMLTextAreaElement | null;
  const status = root.querySelector('#notes-save-status') as HTMLElement | null;
  if (!textarea) return () => {};

  textarea.value = getNotes(gameSlug).content;

  let saveTimer: number | undefined;
  let statusTimer: number | undefined;

  const onInput = () => {
    if (saveTimer) window.clearTimeout(saveTimer);
    if (statusTimer) window.clearTimeout(statusTimer);
    if (status) status.textContent = 'Saving...';

    saveTimer = window.setTimeout(() => {
      saveNotes(gameSlug, textarea.value);
      if (status) status.textContent = 'Saved';
      statusTimer = window.setTimeout(() => {
        if (status) status.textContent = '';
      }, 2000);
    }, 400);
  };

  textarea.addEventListener('input', onInput);

  return () => {
    if (saveTimer) window.clearTimeout(saveTimer);
    if (statusTimer) window.clearTimeout(statusTimer);
    textarea.removeEventListener('input', onInput);
  };
}
