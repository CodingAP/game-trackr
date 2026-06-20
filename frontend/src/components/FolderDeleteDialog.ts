export type FolderDeleteChoice = 'cancel' | 'folder-only' | 'folder-and-games';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function openFolderDeleteDialog(
  folderName: string,
  gameCount: number,
): Promise<FolderDeleteChoice> {
  if (gameCount === 0) {
    return Promise.resolve(
      window.confirm(`Delete folder "${folderName}"?`) ? 'folder-only' : 'cancel',
    );
  }

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'auth-overlay';
    overlay.innerHTML = `
      <div class="auth-dialog panel" role="dialog" aria-modal="true" aria-labelledby="folder-delete-title">
        <h2 id="folder-delete-title" class="auth-dialog-title">Delete folder</h2>
        <p class="text-muted text-sm">
          Delete <strong>${escapeHtml(folderName)}</strong>? It contains ${gameCount} game${gameCount === 1 ? '' : 's'}.
        </p>
        <div class="auth-actions mt-4">
          <button type="button" class="btn-secondary" data-action="folder-only">
            Delete folder only
          </button>
          <button type="button" class="btn-danger" data-action="folder-and-games">
            Delete folder and games
          </button>
          <button type="button" class="btn-secondary" data-action="cancel">Cancel</button>
        </div>
        <p class="hint mt-3">
          Delete folder only moves games to Uncategorized. Delete folder and games permanently removes every game in this folder.
        </p>
      </div>
    `;

    const close = (choice: FolderDeleteChoice): void => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(choice);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        close('cancel');
      }
    };

    overlay.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', () => {
        close((button as HTMLElement).dataset.action as FolderDeleteChoice);
      });
    });

    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);
    overlay.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.focus();
  });
}
