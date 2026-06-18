import { buildMapMarker } from '../markdown/gameMaps.js';
import { renderListSearchBar, wireListSearch } from './listSearch.js';
import { icon, iconLabel } from './icons.js';
import type { GameMap } from '../types/index.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function openMapInsertDialog(options: {
  maps: GameMap[];
  getMaps?: () => GameMap[];
  onInsert: (marker: string) => void;
}): void {
  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay map-insert-overlay';
  overlay.innerHTML = `
    <div class="auth-dialog map-insert-dialog panel" role="dialog" aria-modal="true" aria-labelledby="map-insert-title">
      <div class="image-insert-header">
        <h2 id="map-insert-title" class="auth-dialog-title">Insert map</h2>
        <button type="button" class="image-insert-close" data-action="close" aria-label="Close">${icon('close', 'ui-icon ui-icon-md')}</button>
      </div>
      <p class="text-muted text-sm mb-4">Inserts a map embed at the cursor. Set viewport size per embed after inserting.</p>
      ${
        options.maps.length > 0
          ? `
            <div class="map-insert-list mb-4">
              <p class="label mb-2">Existing maps</p>
              ${renderListSearchBar({ id: 'map-insert-search', placeholder: 'Search maps...', className: 'mb-2' })}
              <div class="progress-tag-options">
                ${options.maps
                  .map((map) => {
                    const title = map.name.trim() || 'Untitled map';
                    return `
                      <button
                        type="button"
                        class="btn-secondary text-sm"
                        data-action="pick-map"
                        data-map-id="${escapeHtml(map.id)}"
                        data-search-text="${escapeHtml(`${title} ${map.id}`)}"
                      >
                        ${iconLabel('map', title, 'ui-icon ui-icon-sm')}
                      </button>
                    `;
                  })
                  .join('')}
              </div>
            </div>
          `
          : `
            <p class="hint mb-4">No maps yet. Add one in the Maps tab first.</p>
          `
      }
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-secondary" data-action="close">${iconLabel('close', 'Cancel')}</button>
      </div>
    </div>
  `;

  const listSearch = wireListSearch(overlay);

  const close = () => {
    listSearch.cleanup();
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };

  overlay.querySelectorAll('[data-action="close"]').forEach((button) => {
    button.addEventListener('click', close);
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  overlay.querySelectorAll('[data-action="pick-map"]').forEach((button) => {
    button.addEventListener('click', () => {
      const mapId = (button as HTMLElement).dataset.mapId;
      const maps = options.getMaps?.() ?? options.maps;
      const map = maps.find((entry) => entry.id === mapId);
      if (!map) return;
      options.onInsert(buildMapMarker(map));
      close();
    });
  });

  document.addEventListener('keydown', onKeyDown);
  document.body.appendChild(overlay);
}
