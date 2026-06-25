import type { Collection } from '../storage/collections.js';

export interface CollectionEditResult {
  name: string;
  description: string;
  thumbnailUrl: string;
  gameSlugs: string[];
}

export interface CollectionEditGame {
  slug: string;
  name: string;
}

export interface CollectionEditOptions {
  collection?: Collection;
  games: CollectionEditGame[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function openCollectionEditDialog(
  options: CollectionEditOptions,
): Promise<CollectionEditResult | null> {
  const { collection, games } = options;
  const isEdit = Boolean(collection);
  const selected = new Set(collection?.gameSlugs ?? []);

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'auth-overlay';

    const gameRows = games
      .map(
        (game) => `
          <label class="collection-game-option">
            <input type="checkbox" data-game-slug="${escapeHtml(game.slug)}" ${
              selected.has(game.slug) ? 'checked' : ''
            } />
            <span>${escapeHtml(game.name)}</span>
          </label>
        `,
      )
      .join('');

    overlay.innerHTML = `
      <div class="auth-dialog panel collection-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="collection-edit-title">
        <h2 id="collection-edit-title" class="auth-dialog-title">${
          isEdit ? 'Edit collection' : 'New collection'
        }</h2>
        <form id="collection-edit-form" class="space-y-3">
          <label class="block">
            <span class="label">Name</span>
            <input type="text" id="collection-name" class="input" value="${escapeHtml(
              collection?.name ?? '',
            )}" placeholder="Collection name" required />
          </label>
          <label class="block">
            <span class="label">Description</span>
            <textarea id="collection-description" class="input" rows="2" placeholder="Optional description">${escapeHtml(
              collection?.description ?? '',
            )}</textarea>
          </label>
          <label class="block">
            <span class="label">Thumbnail URL</span>
            <input type="url" id="collection-thumbnail" class="input" value="${escapeHtml(
              collection?.thumbnailUrl ?? '',
            )}" placeholder="https://example.com/cover.jpg" />
          </label>
          <div class="collection-thumb-preview" data-thumb-preview ${
            collection?.thumbnailUrl ? '' : 'hidden'
          }>
            <img id="collection-thumb-img" src="${escapeHtml(
              collection?.thumbnailUrl ?? '',
            )}" alt="Thumbnail preview" />
          </div>
          <div class="block">
            <span class="label">Games</span>
            ${
              games.length > 0
                ? `<div class="collection-game-list">${gameRows}</div>`
                : '<p class="hint">No games available yet.</p>'
            }
          </div>
          <div class="auth-actions mt-2">
            <button type="submit" class="btn-primary">${isEdit ? 'Save' : 'Create'}</button>
            <button type="button" class="btn-secondary" data-action="cancel">Cancel</button>
          </div>
        </form>
      </div>
    `;

    const close = (result: CollectionEditResult | null): void => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(result);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close(null);
    };

    const thumbInput = overlay.querySelector('#collection-thumbnail') as HTMLInputElement;
    const thumbPreview = overlay.querySelector('[data-thumb-preview]') as HTMLElement;
    const thumbImg = overlay.querySelector('#collection-thumb-img') as HTMLImageElement;

    const updatePreview = () => {
      const url = thumbInput.value.trim();
      if (url) {
        thumbImg.src = url;
        thumbPreview.hidden = false;
      } else {
        thumbImg.removeAttribute('src');
        thumbPreview.hidden = true;
      }
    };
    thumbInput.addEventListener('input', updatePreview);
    thumbImg.addEventListener('error', () => {
      thumbPreview.hidden = true;
    });

    const form = overlay.querySelector('#collection-edit-form') as HTMLFormElement;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = (overlay.querySelector('#collection-name') as HTMLInputElement).value.trim();
      if (!name) {
        (overlay.querySelector('#collection-name') as HTMLInputElement).focus();
        return;
      }
      const description = (
        overlay.querySelector('#collection-description') as HTMLTextAreaElement
      ).value.trim();
      const thumbnailUrl = thumbInput.value.trim();
      const gameSlugs = Array.from(
        overlay.querySelectorAll<HTMLInputElement>('[data-game-slug]:checked'),
      )
        .map((input) => input.dataset.gameSlug ?? '')
        .filter(Boolean);

      close({ name, description, thumbnailUrl, gameSlugs });
    });

    overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', () => close(null));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(null);
    });

    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);
    (overlay.querySelector('#collection-name') as HTMLInputElement)?.focus();
  });
}
