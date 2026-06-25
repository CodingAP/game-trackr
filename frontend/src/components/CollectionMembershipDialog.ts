import {
  createCollection,
  getCollections,
  getCollectionsForGame,
  setGameCollections,
} from '../storage/collections.js';

export interface CollectionMembershipOptions {
  slug: string;
  gameName: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Lets the user toggle which collections a single game belongs to, and create a
 * new collection inline. Resolves true when membership changed.
 */
export function openCollectionMembershipDialog(
  options: CollectionMembershipOptions,
): Promise<boolean> {
  const { slug, gameName } = options;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'auth-overlay';

    const initialSelected = new Set(
      getCollectionsForGame(getCollections(), slug).map((collection) => collection.id),
    );
    let changed = false;

    const renderList = (): string => {
      const collections = getCollections().collections;
      if (collections.length === 0) {
        return '<p class="hint">No collections yet. Create one below.</p>';
      }
      const selected = new Set(
        getCollectionsForGame(getCollections(), slug).map((collection) => collection.id),
      );
      return collections
        .map(
          (collection) => `
            <label class="collection-game-option">
              <input type="checkbox" data-collection-id="${escapeHtml(collection.id)}" ${
                selected.has(collection.id) ? 'checked' : ''
              } />
              <span>${escapeHtml(collection.name)}</span>
            </label>
          `,
        )
        .join('');
    };

    overlay.innerHTML = `
      <div class="auth-dialog panel collection-membership-dialog" role="dialog" aria-modal="true" aria-labelledby="collection-membership-title">
        <h2 id="collection-membership-title" class="auth-dialog-title">Collections</h2>
        <p class="text-muted text-sm">Choose which collections <strong>${escapeHtml(
          gameName,
        )}</strong> belongs to.</p>
        <div class="collection-game-list mt-3" data-collection-list>${renderList()}</div>
        <form id="collection-new-form" class="collection-new-row mt-3">
          <input type="text" id="collection-new-name" class="input" placeholder="New collection name" aria-label="New collection name" />
          <button type="submit" class="btn-secondary">Add</button>
        </form>
        <div class="auth-actions mt-4">
          <button type="button" class="btn-primary" data-action="done">Done</button>
        </div>
      </div>
    `;

    const list = overlay.querySelector('[data-collection-list]') as HTMLElement;

    const persistFromCheckboxes = (): void => {
      const ids = Array.from(
        list.querySelectorAll<HTMLInputElement>('[data-collection-id]:checked'),
      )
        .map((input) => input.dataset.collectionId ?? '')
        .filter(Boolean);
      setGameCollections(slug, ids);
      const nextSelected = new Set(ids);
      changed =
        nextSelected.size !== initialSelected.size ||
        [...nextSelected].some((id) => !initialSelected.has(id));
    };

    list.addEventListener('change', persistFromCheckboxes);

    const newForm = overlay.querySelector('#collection-new-form') as HTMLFormElement;
    newForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = overlay.querySelector('#collection-new-name') as HTMLInputElement;
      const name = input.value.trim();
      if (!name) {
        input.focus();
        return;
      }
      const collection = createCollection({ name, gameSlugs: [slug] });
      changed = true;
      input.value = '';
      list.innerHTML = renderList();
      // Keep the freshly created collection checked even after re-render.
      const checkbox = list.querySelector<HTMLInputElement>(
        `[data-collection-id="${CSS.escape(collection.id)}"]`,
      );
      if (checkbox) checkbox.checked = true;
    });

    const close = (): void => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(changed);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };

    overlay.querySelector('[data-action="done"]')?.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });

    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);
    (overlay.querySelector('#collection-new-name') as HTMLInputElement)?.focus();
  });
}
