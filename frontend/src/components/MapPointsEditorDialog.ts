import {
  getImagePercentFromClick,
  renderMapZoomControls,
  resolvePointType,
  wireMapZoom,
} from '../markdown/gameMaps.js';
import type { GameMap, ManagedCheckbox, MapPoint } from '../types/index.js';
import { icon, iconLabel } from './icons.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
}

function renderPointTypeOptions(map: GameMap, selectedTypeId: string | null | undefined): string {
  return map.pointTypes
    .map(
      (type) => `
        <option value="${escapeHtml(type.id)}"${selectedTypeId === type.id ? ' selected' : ''}>
          ${escapeHtml(type.name.trim() || type.id)}
        </option>
      `,
    )
    .join('');
}

function renderCheckboxOptions(
  checkboxes: ManagedCheckbox[],
  selectedCheckboxId: string | null | undefined,
): string {
  return `
    <option value="">None</option>
    ${checkboxes
      .map(
        (checkbox) => `
          <option value="${escapeHtml(checkbox.id)}"${
            selectedCheckboxId === checkbox.id ? ' selected' : ''
          }>
            ${escapeHtml(checkbox.label.trim() || checkbox.id)}
          </option>
        `,
      )
      .join('')}
  `;
}

function renderPointTypeToolbar(map: GameMap, activeTypeId: string): string {
  return `
    <div class="map-points-editor-type-toolbar">
      <span class="label">Place as</span>
      <div class="map-points-editor-type-options" role="radiogroup" aria-label="Point type for new points">
        ${map.pointTypes
          .map((type) => {
            const isActive = type.id === activeTypeId;
            return `
              <button
                type="button"
                class="map-points-editor-type-option${isActive ? ' is-active' : ''}"
                data-action="select-place-type"
                data-type-id="${escapeHtml(type.id)}"
                role="radio"
                aria-checked="${isActive ? 'true' : 'false'}"
              >
                <span
                  class="map-points-editor-type-swatch"
                  style="background-color: ${escapeHtml(type.color)};"
                  aria-hidden="true"
                ></span>
                <span>${escapeHtml(type.name.trim() || type.id)}</span>
              </button>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}

function renderPointsSidebar(
  map: GameMap,
  points: MapPoint[],
  checkboxes: ManagedCheckbox[],
  selectedPointId: string | null,
): string {
  return `
    <aside class="map-points-editor-sidebar" aria-label="Map points">
      <div class="map-points-editor-sidebar-header">
        <p class="label">Points</p>
        <p class="hint">${points.length === 0 ? 'Click the map to add a point.' : `${points.length} point${points.length === 1 ? '' : 's'}`}</p>
      </div>
      <div class="map-points-editor-points-list">
        ${
          points.length === 0
            ? '<p class="text-muted text-sm">No points yet.</p>'
            : points
                .map(
                  (point, index) => `
                    <article class="map-points-editor-point-card${
                      selectedPointId === point.id ? ' is-selected' : ''
                    }" data-point-card="${escapeHtml(point.id)}">
                      <div class="map-points-editor-point-card-header">
                        <button
                          type="button"
                          class="map-points-editor-point-select"
                          data-action="select-point"
                          data-point-id="${escapeHtml(point.id)}"
                        >
                          Point ${index + 1}
                        </button>
                        <button
                          type="button"
                          class="map-points-editor-point-remove"
                          data-action="remove-point"
                          data-point-id="${escapeHtml(point.id)}"
                          aria-label="Remove point"
                        >${icon('trash', 'ui-icon ui-icon-sm')}</button>
                      </div>
                      <label class="block mb-2">
                        <span class="label text-xs">Label</span>
                        <input
                          type="text"
                          class="input map-points-editor-point-label"
                          data-point-id="${escapeHtml(point.id)}"
                          value="${escapeHtml(point.label)}"
                          placeholder="Point label"
                        />
                      </label>
                      <label class="block mb-2">
                        <span class="label text-xs">Type</span>
                        <select class="input map-points-editor-point-type" data-point-id="${escapeHtml(point.id)}">
                          ${renderPointTypeOptions(map, point.typeId)}
                        </select>
                      </label>
                      <label class="block">
                        <span class="label text-xs">Checkbox</span>
                        <select class="input map-points-editor-point-checkbox" data-point-id="${escapeHtml(point.id)}">
                          ${renderCheckboxOptions(checkboxes, point.checkboxId)}
                        </select>
                      </label>
                    </article>
                  `,
                )
                .join('')
        }
      </div>
    </aside>
  `;
}

function renderMapCanvas(
  map: GameMap,
  points: MapPoint[],
  selectedPointId: string | null,
): string {
  return `
    <section class="map-points-editor-canvas-wrap" aria-label="Map canvas">
      <div class="map-points-editor-canvas-frame">
        <div class="map-points-editor-viewport" data-map-viewport>
          <div class="map-points-editor-stage">
            <img
              class="map-points-editor-image"
              src="${escapeHtml(map.imageUrl)}"
              alt="${escapeHtml(map.name.trim() || 'Game map')}"
              draggable="false"
            />
            ${points
              .map((point) => {
                const pointType = resolvePointType(map, point.typeId);
                return `
                  <button
                    type="button"
                    class="map-editor-point${selectedPointId === point.id ? ' is-selected' : ''}"
                    style="left: ${point.x}%; top: ${point.y}%;"
                    data-map-point
                    data-point-id="${escapeHtml(point.id)}"
                    aria-label="${escapeHtml(point.label.trim() || 'Map point')}"
                  >
                    <span
                      class="map-editor-point-pin"
                      style="background-color: ${escapeHtml(pointType.color)};"
                      aria-hidden="true"
                    ></span>
                  </button>
                `;
              })
              .join('')}
          </div>
        </div>
        ${renderMapZoomControls()}
      </div>
      <p class="hint mt-2">Middle-click drag to pan. Use zoom controls or the mouse wheel to zoom. Click the map to add a point with the selected type.</p>
    </section>
  `;
}

export function openMapPointsEditorDialog(options: {
  map: GameMap;
  checkboxes: ManagedCheckbox[];
  onSave: (points: MapPoint[]) => void;
}): () => void {
  const { map, checkboxes, onSave } = options;
  let points: MapPoint[] = structuredClone(map.points);
  let selectedPointId: string | null = points[0]?.id ?? null;
  let activePointTypeId = map.pointTypes[0]?.id ?? 'default';
  let cleanupZoom = () => {};

  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay map-points-editor-overlay';

  const renderDialog = () => {
    overlay.innerHTML = `
      <div class="map-points-editor-dialog panel" role="dialog" aria-modal="true" aria-labelledby="map-points-editor-title">
        <header class="map-points-editor-header">
          <div class="min-w-0">
            <h2 id="map-points-editor-title" class="auth-dialog-title">Edit map points</h2>
            <p class="hint truncate">${escapeHtml(map.name.trim() || 'Untitled map')}</p>
          </div>
          <div class="map-points-editor-header-actions">
            <button type="button" class="btn-primary" data-action="save">${iconLabel('save', 'Done')}</button>
            <button type="button" class="map-points-editor-close" data-action="close" aria-label="Close">${icon('close', 'ui-icon ui-icon-md')}</button>
          </div>
        </header>
        ${renderPointTypeToolbar(map, activePointTypeId)}
        <div class="map-points-editor-body">
          ${renderPointsSidebar(map, points, checkboxes, selectedPointId)}
          ${renderMapCanvas(map, points, selectedPointId)}
        </div>
      </div>
    `;

    wireDialogActions();
    wireCanvasZoom();
  };

  const syncFromDom = () => {
    overlay.querySelectorAll('.map-points-editor-point-label').forEach((input) => {
      const pointId = (input as HTMLElement).dataset.pointId;
      const point = points.find((entry) => entry.id === pointId);
      if (point) point.label = (input as HTMLInputElement).value;
    });

    overlay.querySelectorAll('.map-points-editor-point-type').forEach((select) => {
      const pointId = (select as HTMLElement).dataset.pointId;
      const point = points.find((entry) => entry.id === pointId);
      if (point) point.typeId = (select as HTMLSelectElement).value || null;
    });

    overlay.querySelectorAll('.map-points-editor-point-checkbox').forEach((select) => {
      const pointId = (select as HTMLElement).dataset.pointId;
      const point = points.find((entry) => entry.id === pointId);
      if (point) {
        const value = (select as HTMLSelectElement).value;
        point.checkboxId = value || null;
      }
    });
  };

  const isEditingSidebar = (): boolean => {
    const active = document.activeElement;
    if (!active || !overlay.contains(active)) return false;
    return active.matches('.map-points-editor-sidebar input, .map-points-editor-sidebar select, .map-points-editor-sidebar textarea');
  };

  const render = (force = false) => {
    if (!force && isEditingSidebar()) return;
    syncFromDom();
    cleanupZoom();
    renderDialog();
  };

  const wireCanvasZoom = () => {
    cleanupZoom();
    const viewportEl = overlay.querySelector('[data-map-viewport]') as HTMLElement | null;
    const frame = viewportEl?.closest('.map-points-editor-canvas-frame') as HTMLElement | null;
    const image = viewportEl?.querySelector('.map-points-editor-image') as HTMLImageElement | null;
    const zoomLabel = frame?.querySelector('[data-map-zoom-label]') as HTMLElement | null;
    if (!viewportEl || !image || !frame) return;

    cleanupZoom = wireMapZoom(viewportEl, image, {
      startX: 0,
      startY: 0,
      zoomLabel,
      zoomControlsRoot: frame,
    });
  };

  const wireDialogActions = () => {
    overlay.querySelector('[data-action="save"]')?.addEventListener('click', () => {
      syncFromDom();
      onSave(
        points.map((point) => ({
          ...point,
          label: point.label.trim(),
          x: clampPercent(point.x),
          y: clampPercent(point.y),
          typeId: point.typeId ?? map.pointTypes[0]?.id ?? 'default',
          checkboxId: point.checkboxId || null,
        })),
      );
      close();
    });

    overlay.querySelector('[data-action="close"]')?.addEventListener('click', close);

    overlay.querySelectorAll('[data-action="select-place-type"]').forEach((button) => {
      button.addEventListener('click', () => {
        const typeId = (button as HTMLElement).dataset.typeId;
        if (!typeId) return;
        activePointTypeId = typeId;
        render(true);
      });
    });

    overlay.querySelectorAll('[data-action="select-point"]').forEach((button) => {
      button.addEventListener('click', () => {
        const pointId = (button as HTMLElement).dataset.pointId;
        if (!pointId) return;
        selectedPointId = pointId;
        render(true);
      });
    });

    overlay.querySelectorAll('[data-map-point]').forEach((pointEl) => {
      pointEl.addEventListener('click', (event) => {
        event.stopPropagation();
        const pointId = (pointEl as HTMLElement).dataset.pointId;
        if (!pointId) return;
        selectedPointId = pointId;
        render(true);
      });
    });

    overlay.querySelectorAll('[data-action="remove-point"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        syncFromDom();
        const pointId = (button as HTMLElement).dataset.pointId;
        if (!pointId) return;
        points = points.filter((point) => point.id !== pointId);
        if (selectedPointId === pointId) {
          selectedPointId = points[0]?.id ?? null;
        }
        render(true);
      });
    });

    const viewport = overlay.querySelector('[data-map-viewport]');
    viewport?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-map-point]')) return;

      const image = viewport.querySelector('.map-points-editor-image') as HTMLImageElement | null;
      if (!image) return;

      const position = getImagePercentFromClick(image, event.clientX, event.clientY);
      if (!position) return;

      syncFromDom();
      const point: MapPoint = {
        id: crypto.randomUUID(),
        x: clampPercent(position.x),
        y: clampPercent(position.y),
        label: `Point ${points.length + 1}`,
        typeId: activePointTypeId,
        checkboxId: null,
      };
      points.push(point);
      selectedPointId = point.id;
      render(true);
    });
  };

  const close = () => {
    cleanupZoom();
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKeyDown);
  renderDialog();

  return close;
}
