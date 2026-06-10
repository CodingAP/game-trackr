import { AuthRequiredError, uploadGameImage } from '../api/client.js';
import {
  buildMapMarker,
  defaultPointTypes,
  getImagePercentFromClick,
  normalizeGameMap,
  renderMapZoomControls,
  resolvePointType,
  wireMapZoom,
} from '../markdown/gameMaps.js';
import type {
  CheckboxConnectionsData,
  GameMap,
  GameMapsData,
  ManagedCheckbox,
  MapPointType,
} from '../types/index.js';
import type { MarkdownEditorHandle } from '../types/markdownEditor.js';
import { requireAuth } from './AuthPrompt.js';
import { renderCollapsiblePanel, wireCollapsiblePanels } from './CollapsiblePanel.js';
import { renderListSearchBar, wireListSearch } from './listSearch.js';
import { iconLabel } from './icons.js';

const POINT_TYPE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function slugifyMapId(name: string, existing: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'map';

  if (!existing.has(base)) return base;

  let counter = 2;
  while (existing.has(`${base}-${counter}`)) {
    counter += 1;
  }
  return `${base}-${counter}`;
}

function slugifyPointTypeId(name: string, existing: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'type';

  if (!existing.has(base)) return base;

  let counter = 2;
  while (existing.has(`${base}-${counter}`)) {
    counter += 1;
  }
  return `${base}-${counter}`;
}

function defaultMap(existing: Set<string>): GameMap {
  const name = 'New map';
  return {
    id: slugifyMapId(name, existing),
    name,
    imageUrl: '',
    imageFilename: '',
    viewport: { width: 800, height: 600 },
    start: { x: 0, y: 0 },
    pointTypes: defaultPointTypes(),
    points: [],
  };
}

function readNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeColor(value: string, fallback: string): string {
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : fallback;
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

function renderPointTypesEditor(map: GameMap): string {
  return `
    <div class="map-editor-point-types mb-3">
      <span class="label">Point types</span>
      <p class="hint mt-1">Define custom point types for the map legend. Each point can use one type.</p>
      <ul class="map-editor-point-type-list mt-2">
        ${map.pointTypes
          .map(
            (type) => `
              <li class="map-editor-point-type-item">
                <input
                  type="text"
                  class="input map-editor-point-type-name"
                  data-map-point-type-name="${map.id}"
                  data-type-id="${type.id}"
                  value="${escapeHtml(type.name)}"
                  placeholder="Type name"
                />
                <input
                  type="color"
                  class="map-editor-point-type-color"
                  data-map-point-type-color="${map.id}"
                  data-type-id="${type.id}"
                  value="${escapeHtml(type.color)}"
                  title="Type color"
                />
                <button
                  type="button"
                  class="btn-secondary text-xs"
                  data-action="remove-point-type"
                  data-map-id="${map.id}"
                  data-type-id="${type.id}"
                  ${map.pointTypes.length <= 1 ? 'disabled' : ''}
                >${iconLabel('trash', 'Remove', 'ui-icon ui-icon-sm')}</button>
              </li>
            `,
          )
          .join('')}
      </ul>
      <button
        type="button"
        class="btn-secondary text-xs mt-2"
        data-action="add-point-type"
        data-map-id="${map.id}"
      >${iconLabel('plus', 'Add type', 'ui-icon ui-icon-sm')}</button>
    </div>
  `;
}

function renderMapEditorBody(
  map: GameMap,
  selectedPointId: string | null,
  checkboxes: ManagedCheckbox[],
): string {
  return `
    <div class="grid gap-3 sm:grid-cols-2 mb-3">
      <label class="block">
        <span class="label">Map name</span>
        <input type="text" class="input" data-map-name="${map.id}" value="${escapeHtml(map.name)}" />
      </label>
      <label class="block">
        <span class="label">Map id</span>
        <input
          type="text"
          class="input"
          data-map-id-field="${map.id}"
          value="${escapeHtml(map.id)}"
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
        />
      </label>
      <label class="block">
        <span class="label">Viewport width (px)</span>
        <input type="number" class="input" min="100" step="1" data-map-viewport-width="${map.id}" value="${map.viewport.width}" />
      </label>
      <label class="block">
        <span class="label">Viewport height (px)</span>
        <input type="number" class="input" min="100" step="1" data-map-viewport-height="${map.id}" value="${map.viewport.height}" />
      </label>
      <label class="block">
        <span class="label">Start X (px)</span>
        <input type="number" class="input" min="0" step="1" data-map-start-x="${map.id}" value="${map.start.x}" />
      </label>
      <label class="block">
        <span class="label">Start Y (px)</span>
        <input type="number" class="input" min="0" step="1" data-map-start-y="${map.id}" value="${map.start.y}" />
      </label>
    </div>

    <div class="map-editor-upload mb-3">
      <span class="label">Base image</span>
      <div class="flex flex-wrap items-center gap-3 mt-1">
        <input type="file" accept="image/*" data-map-image-input="${map.id}" class="input file-input" />
        <button type="button" class="btn-secondary text-xs" data-action="upload-map-image" data-map-id="${map.id}">
          ${iconLabel('upload', 'Upload', 'ui-icon ui-icon-sm')}
        </button>
      </div>
      ${
        map.imageUrl
          ? `<p class="hint mt-1 truncate">${escapeHtml(map.imageFilename || map.imageUrl)}</p>`
          : '<p class="hint mt-1">Upload a base image for this map.</p>'
      }
    </div>

    ${renderPointTypesEditor(map)}

    ${
      map.imageUrl
        ? `
          <div class="map-editor-canvas-wrap mb-3">
            <div
              class="map-editor-frame"
              style="width: min(100%, ${map.viewport.width}px); height: ${map.viewport.height}px;"
            >
              <div class="map-editor-viewport" data-map-viewport="${map.id}">
                <div class="map-editor-stage">
                  <img
                    class="map-editor-image"
                    src="${escapeHtml(map.imageUrl)}"
                    alt=""
                    draggable="false"
                  />
                  ${map.points
                    .map((point) => {
                      const pointType = resolvePointType(map, point.typeId);
                      return `
                        <button
                          type="button"
                          class="map-editor-point${selectedPointId === point.id ? ' is-selected' : ''}"
                          style="left: ${point.x}%; top: ${point.y}%;"
                          data-map-point="${map.id}"
                          data-point-id="${point.id}"
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
            <p class="hint mt-2">Scroll to pan, use zoom controls or mouse wheel to zoom. Click the map to add a point.</p>
          </div>
        `
        : ''
    }

    <div class="map-editor-points mb-3">
      <span class="label">Points</span>
      ${
        map.points.length === 0
          ? '<p class="text-faint text-sm mt-1">No points yet.</p>'
          : `
            <ul class="map-editor-point-list mt-2">
              ${map.points
                .map(
                  (point) => `
                    <li class="map-editor-point-item${selectedPointId === point.id ? ' is-selected' : ''}">
                      <input
                        type="text"
                        class="input map-editor-point-label"
                        data-map-point-label="${map.id}"
                        data-point-id="${point.id}"
                        value="${escapeHtml(point.label)}"
                        placeholder="Point label"
                      />
                      <label class="map-editor-point-field">
                        <span class="label text-xs">Type</span>
                        <select
                          class="input map-editor-point-type"
                          data-map-point-type="${map.id}"
                          data-point-id="${point.id}"
                        >
                          ${renderPointTypeOptions(map, point.typeId)}
                        </select>
                      </label>
                      <label class="map-editor-point-field">
                        <span class="label text-xs">Checkbox</span>
                        <select
                          class="input map-editor-point-checkbox"
                          data-map-point-checkbox="${map.id}"
                          data-point-id="${point.id}"
                        >
                          ${renderCheckboxOptions(checkboxes, point.checkboxId)}
                        </select>
                      </label>
                      <button
                        type="button"
                        class="btn-secondary text-xs"
                        data-action="select-map-point"
                        data-map-id="${map.id}"
                        data-point-id="${point.id}"
                      >${iconLabel('edit', 'Select', 'ui-icon ui-icon-sm')}</button>
                      <button
                        type="button"
                        class="btn-secondary text-xs"
                        data-action="remove-map-point"
                        data-map-id="${map.id}"
                        data-point-id="${point.id}"
                      >${iconLabel('trash', 'Remove', 'ui-icon ui-icon-sm')}</button>
                    </li>
                  `,
                )
                .join('')}
            </ul>
          `
      }
    </div>

    <div class="flex flex-wrap gap-2">
      <button type="button" class="btn-secondary text-xs" data-action="insert-map-marker" data-map-id="${map.id}">
        ${iconLabel('plus', 'Insert in content', 'ui-icon ui-icon-sm')}
      </button>
      <button type="button" class="btn-danger text-xs" data-action="remove-map" data-map-id="${map.id}">
        ${iconLabel('trash', 'Remove map', 'ui-icon ui-icon-sm')}
      </button>
    </div>
  `;
}

export function mountMapsEditor(
  host: HTMLElement,
  editor: MarkdownEditorHandle,
  slug: string,
  initial: GameMapsData,
  getCheckboxes: () => CheckboxConnectionsData,
): { getData: () => GameMapsData; cleanup: () => void } {
  let maps: GameMap[] = structuredClone(initial.maps).map(normalizeGameMap);
  const expandedMaps = new Set<string>();
  const selectedPoints = new Map<string, string | null>();
  let searchQuery = '';
  let cleanupSearch = () => {};
  let cleanupCanvasZoom = () => {};

  const syncFromDom = () => {
    host.querySelectorAll('[data-map-name]').forEach((input) => {
      const mapId = (input as HTMLElement).dataset.mapName;
      const map = maps.find((entry) => entry.id === mapId);
      if (map) map.name = (input as HTMLInputElement).value;
    });

    host.querySelectorAll('[data-map-viewport-width]').forEach((input) => {
      const mapId = (input as HTMLElement).dataset.mapViewportWidth;
      const map = maps.find((entry) => entry.id === mapId);
      if (map) map.viewport.width = Math.max(100, readNumber((input as HTMLInputElement).value, map.viewport.width));
    });

    host.querySelectorAll('[data-map-viewport-height]').forEach((input) => {
      const mapId = (input as HTMLElement).dataset.mapViewportHeight;
      const map = maps.find((entry) => entry.id === mapId);
      if (map) map.viewport.height = Math.max(100, readNumber((input as HTMLInputElement).value, map.viewport.height));
    });

    host.querySelectorAll('[data-map-start-x]').forEach((input) => {
      const mapId = (input as HTMLElement).dataset.mapStartX;
      const map = maps.find((entry) => entry.id === mapId);
      if (map) map.start.x = Math.max(0, readNumber((input as HTMLInputElement).value, map.start.x));
    });

    host.querySelectorAll('[data-map-start-y]').forEach((input) => {
      const mapId = (input as HTMLElement).dataset.mapStartY;
      const map = maps.find((entry) => entry.id === mapId);
      if (map) map.start.y = Math.max(0, readNumber((input as HTMLInputElement).value, map.start.y));
    });

    host.querySelectorAll('[data-map-point-label]').forEach((input) => {
      const mapId = (input as HTMLElement).dataset.mapPointLabel;
      const pointId = (input as HTMLElement).dataset.pointId;
      const map = maps.find((entry) => entry.id === mapId);
      const point = map?.points.find((entry) => entry.id === pointId);
      if (point) point.label = (input as HTMLInputElement).value;
    });

    host.querySelectorAll('[data-map-point-type]').forEach((select) => {
      const mapId = (select as HTMLElement).dataset.mapPointType;
      const pointId = (select as HTMLElement).dataset.pointId;
      const map = maps.find((entry) => entry.id === mapId);
      const point = map?.points.find((entry) => entry.id === pointId);
      if (point) point.typeId = (select as HTMLSelectElement).value || null;
    });

    host.querySelectorAll('[data-map-point-checkbox]').forEach((select) => {
      const mapId = (select as HTMLElement).dataset.mapPointCheckbox;
      const pointId = (select as HTMLElement).dataset.pointId;
      const map = maps.find((entry) => entry.id === mapId);
      const point = map?.points.find((entry) => entry.id === pointId);
      if (point) {
        const value = (select as HTMLSelectElement).value;
        point.checkboxId = value || null;
      }
    });

    host.querySelectorAll('[data-map-point-type-name]').forEach((input) => {
      const mapId = (input as HTMLElement).dataset.mapPointTypeName;
      const typeId = (input as HTMLElement).dataset.typeId;
      const map = maps.find((entry) => entry.id === mapId);
      const type = map?.pointTypes.find((entry) => entry.id === typeId);
      if (type) type.name = (input as HTMLInputElement).value;
    });

    host.querySelectorAll('[data-map-point-type-color]').forEach((input) => {
      const mapId = (input as HTMLElement).dataset.mapPointTypeColor;
      const typeId = (input as HTMLElement).dataset.typeId;
      const map = maps.find((entry) => entry.id === mapId);
      const type = map?.pointTypes.find((entry) => entry.id === typeId);
      if (type) {
        type.color = normalizeColor((input as HTMLInputElement).value, type.color);
      }
    });
  };

  const wireCanvasZoom = () => {
    cleanupCanvasZoom();
    const cleanups: Array<() => void> = [];

    host.querySelectorAll('[data-map-viewport]').forEach((viewportEl) => {
      const mapId = (viewportEl as HTMLElement).dataset.mapViewport;
      const map = maps.find((entry) => entry.id === mapId);
      const frame = viewportEl.closest('.map-editor-frame') as HTMLElement | null;
      const image = viewportEl.querySelector('.map-editor-image') as HTMLImageElement | null;
      const zoomLabel = frame?.querySelector('[data-map-zoom-label]') as HTMLElement | null;
      if (!map || !image || !frame) return;

      cleanups.push(
        wireMapZoom(viewportEl as HTMLElement, image, {
          startX: map.start.x,
          startY: map.start.y,
          zoomLabel,
          zoomControlsRoot: frame,
        }),
      );
    });

    cleanupCanvasZoom = () => {
      cleanups.forEach((cleanup) => cleanup());
      cleanupCanvasZoom = () => {};
    };
  };

  const render = () => {
    syncFromDom();
    cleanupCanvasZoom();

    const checkboxes = getCheckboxes().checkboxes;

    host.innerHTML = `
      ${maps.length > 0 ? renderListSearchBar({ id: 'maps-search', placeholder: 'Search maps...' }) : ''}
      <div class="space-y-2">
        ${
          maps.length === 0
            ? '<p class="text-faint text-sm">No maps yet.</p>'
            : maps
                .map((map) => {
                  const title = map.name.trim() || map.id || 'Untitled map';
                  const selectedPointId = selectedPoints.get(map.id) ?? null;
                  return renderCollapsiblePanel({
                    title,
                    className: 'map-editor-card',
                    defaultOpen: expandedMaps.has(map.id),
                    attributes: {
                      'map-id': map.id,
                      'search-text': `${map.name} ${map.id}`,
                    },
                    content: renderMapEditorBody(map, selectedPointId, checkboxes),
                  });
                })
                .join('')
        }
      </div>
      <div class="mt-4">
        <button type="button" class="btn-secondary" data-action="add-map">${iconLabel('plus', 'Add map')}</button>
      </div>
    `;

    wireStaticActions();
    wireCanvasZoom();

    cleanupSearch();
    const search = wireListSearch(host, {
      preserveQuery: () => searchQuery,
      onQueryChange: (query) => {
        searchQuery = query;
      },
    });
    cleanupSearch = search.cleanup;
  };

  const wireStaticActions = () => {
    host.querySelectorAll('[data-action="add-map"]').forEach((button) => {
      button.addEventListener('click', () => {
        syncFromDom();
        const map = defaultMap(new Set(maps.map((entry) => entry.id)));
        maps.push(map);
        expandedMaps.add(map.id);
        render();
      });
    });

    host.querySelectorAll('[data-action="remove-map"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const mapId = (button as HTMLElement).dataset.mapId;
        if (!mapId) return;
        maps = maps.filter((entry) => entry.id !== mapId);
        expandedMaps.delete(mapId);
        selectedPoints.delete(mapId);
        render();
      });
    });

    host.querySelectorAll('[data-action="add-point-type"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        syncFromDom();
        const mapId = (button as HTMLElement).dataset.mapId;
        const map = maps.find((entry) => entry.id === mapId);
        if (!map) return;

        const existingIds = new Set(map.pointTypes.map((type) => type.id));
        const color = POINT_TYPE_COLORS[map.pointTypes.length % POINT_TYPE_COLORS.length];
        const name = `Type ${map.pointTypes.length + 1}`;
        const type: MapPointType = {
          id: slugifyPointTypeId(name, existingIds),
          name,
          color,
        };
        map.pointTypes.push(type);
        render();
      });
    });

    host.querySelectorAll('[data-action="remove-point-type"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        syncFromDom();
        const mapId = (button as HTMLElement).dataset.mapId;
        const typeId = (button as HTMLElement).dataset.typeId;
        const map = maps.find((entry) => entry.id === mapId);
        if (!map || !typeId || map.pointTypes.length <= 1) return;

        const fallbackTypeId = map.pointTypes.find((type) => type.id !== typeId)?.id;
        if (!fallbackTypeId) return;

        map.pointTypes = map.pointTypes.filter((type) => type.id !== typeId);
        for (const point of map.points) {
          if (point.typeId === typeId) point.typeId = fallbackTypeId;
        }
        render();
      });
    });

    host.querySelectorAll('[data-action="insert-map-marker"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        syncFromDom();
        const mapId = (button as HTMLElement).dataset.mapId;
        const map = maps.find((entry) => entry.id === mapId);
        if (!map) return;
        editor.insertLine(buildMapMarker(map));
      });
    });

    host.querySelectorAll('[data-map-id-field]').forEach((input) => {
      input.addEventListener('change', () => {
        syncFromDom();
        const oldId = (input as HTMLElement).dataset.mapIdField;
        const newId = (input as HTMLInputElement).value.trim();
        const map = maps.find((entry) => entry.id === oldId);
        if (!map || !newId || newId === oldId) return;
        if (maps.some((entry) => entry.id === newId)) return;

        if (expandedMaps.has(oldId)) {
          expandedMaps.delete(oldId);
          expandedMaps.add(newId);
        }
        const selected = selectedPoints.get(oldId) ?? null;
        selectedPoints.delete(oldId);
        if (selected) selectedPoints.set(newId, selected);
        map.id = newId;
        render();
      });
    });

    host.querySelectorAll('[data-action="upload-map-image"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        void handleMapImageUpload((button as HTMLElement).dataset.mapId);
      });
    });

    host.querySelectorAll('[data-map-viewport]').forEach((canvas) => {
      canvas.addEventListener('click', (event) => {
        event.stopPropagation();
        const target = event.target as HTMLElement;
        if (target.closest('[data-map-point]')) return;

        const mapId = (canvas as HTMLElement).dataset.mapViewport;
        const map = maps.find((entry) => entry.id === mapId);
        const img = canvas.querySelector('.map-editor-image') as HTMLImageElement | null;
        if (!map || !img) return;

        const position = getImagePercentFromClick(img, event.clientX, event.clientY);
        if (!position) return;

        syncFromDom();
        const point = {
          id: crypto.randomUUID(),
          x: clampPercent(position.x),
          y: clampPercent(position.y),
          label: `Point ${map.points.length + 1}`,
          typeId: map.pointTypes[0]?.id ?? 'default',
          checkboxId: null,
        };
        map.points.push(point);
        selectedPoints.set(map.id, point.id);
        render();
      });
    });

    host.querySelectorAll('[data-map-point]').forEach((pointEl) => {
      pointEl.addEventListener('click', (event) => {
        event.stopPropagation();
        const mapId = (pointEl as HTMLElement).dataset.mapPoint;
        const pointId = (pointEl as HTMLElement).dataset.pointId;
        if (!mapId || !pointId) return;
        selectedPoints.set(mapId, pointId);
        render();
      });
    });

    host.querySelectorAll('[data-action="select-map-point"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const mapId = (button as HTMLElement).dataset.mapId;
        const pointId = (button as HTMLElement).dataset.pointId;
        if (!mapId || !pointId) return;
        selectedPoints.set(mapId, pointId);
        render();
      });
    });

    host.querySelectorAll('[data-action="remove-map-point"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        syncFromDom();
        const mapId = (button as HTMLElement).dataset.mapId;
        const pointId = (button as HTMLElement).dataset.pointId;
        const map = maps.find((entry) => entry.id === mapId);
        if (!map || !pointId) return;
        map.points = map.points.filter((point) => point.id !== pointId);
        if (selectedPoints.get(mapId ?? '') === pointId) {
          selectedPoints.set(mapId ?? '', null);
        }
        render();
      });
    });
  };

  const handleMapImageUpload = async (mapId: string | undefined) => {
    if (!mapId) return;
    syncFromDom();
    const map = maps.find((entry) => entry.id === mapId);
    const input = host.querySelector(`[data-map-image-input="${mapId}"]`) as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!map || !file) return;

    try {
      const uploaded = await uploadGameImage(slug, file);
      map.imageUrl = uploaded.url;
      map.imageFilename = uploaded.filename;
      if (input) input.value = '';
      expandedMaps.add(map.id);
      render();
    } catch (error) {
      if (error instanceof AuthRequiredError && (await requireAuth())) {
        await handleMapImageUpload(mapId);
      }
    }
  };

  const cleanupCollapsible = wireCollapsiblePanels(host, {
    onToggle: (panel, expanded) => {
      const mapId = panel.dataset.mapId;
      if (!mapId) return;
      if (expanded) expandedMaps.add(mapId);
      else expandedMaps.delete(mapId);
    },
  });

  render();

  return {
    getData: () => {
      syncFromDom();
      return {
        maps: maps.map((map) => normalizeGameMap({
          ...map,
          name: map.name.trim() || 'Untitled map',
          viewport: {
            width: Math.max(100, Math.round(map.viewport.width)),
            height: Math.max(100, Math.round(map.viewport.height)),
          },
          start: {
            x: Math.max(0, Math.round(map.start.x)),
            y: Math.max(0, Math.round(map.start.y)),
          },
          points: map.points.map((point) => ({
            ...point,
            label: point.label.trim(),
            x: clampPercent(point.x),
            y: clampPercent(point.y),
            typeId: point.typeId ?? map.pointTypes[0]?.id ?? 'default',
            checkboxId: point.checkboxId || null,
          })),
        })),
      };
    },
    cleanup: () => {
      cleanupCanvasZoom();
      cleanupSearch();
      cleanupCollapsible();
    },
  };
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
}
