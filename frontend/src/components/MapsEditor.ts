import { AuthRequiredError, uploadGameImage } from '../api/client.js';
import {
  buildMapMarker,
  defaultPointTypes,
  normalizeGameMap,
} from '../markdown/gameMaps.js';
import type {
  CheckboxConnectionsData,
  GameMap,
  GameMapsData,
  MapPointType,
} from '../types/index.js';
import { requireAuth } from './AuthPrompt.js';
import { openMapPointsEditorDialog } from './MapPointsEditorDialog.js';
import {
  renderEditorItemTable,
  renderEditorSplitLayout,
  resolveEditorSelection,
  wireEditorItemTable,
  wireEditorItemTableRemove,
} from './editorLibraryUi.js';
import { renderListSearchBar, wireListSearch } from './listSearch.js';
import { readListScroll, restoreListScroll } from '../utils/scrollList.js';
import { icon, iconLabel } from './icons.js';

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

function createMapFromName(name: string, existing: GameMap[]): GameMap {
  const trimmed = name.trim() || 'New map';
  const existingIds = new Set(existing.map((entry) => entry.id));
  return {
    id: slugifyMapId(trimmed, existingIds),
    name: trimmed,
    imageUrl: '',
    imageFilename: '',
    pointTypes: defaultPointTypes(),
    points: [],
  };
}

function normalizeColor(value: string, fallback: string): string {
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : fallback;
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

function renderMapEditorBody(map: GameMap): string {
  const pointsButtonLabel =
    map.points.length === 0 ? 'Add points' : `Edit points (${map.points.length})`;

  return `
    <label class="block mb-3">
      <span class="label">Map name</span>
      <input type="text" class="input" data-map-name="${map.id}" value="${escapeHtml(map.name)}" />
    </label>
    <p class="hint mb-3">Embed id: <code>${escapeHtml(buildMapMarker(map))}</code></p>

    <div class="map-editor-upload mb-3">
      <label class="block">
        <span class="label">Base image</span>
        <div class="media-add-input-row mt-1">
          <input type="file" accept="image/*" data-map-image-input="${map.id}" class="input file-input" />
          <button type="button" class="btn-secondary" data-action="upload-map-image" data-map-id="${map.id}">
            ${iconLabel('upload', 'Upload', 'ui-icon ui-icon-sm')}
          </button>
        </div>
      </label>
      ${
        map.imageUrl
          ? `<p class="hint mt-1 truncate">${escapeHtml(map.imageFilename || map.imageUrl)}</p>`
          : '<p class="hint mt-1">Upload a base image for this map.</p>'
      }
    </div>

    ${renderPointTypesEditor(map)}

    <div class="map-editor-points mb-3">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span class="label">Points</span>
        <button
          type="button"
          class="btn-secondary text-sm"
          data-action="edit-map-points"
          data-map-id="${map.id}"
          ${map.imageUrl ? '' : 'disabled'}
        >${iconLabel('edit', pointsButtonLabel)}</button>
      </div>
      <p class="hint">${
        map.imageUrl
          ? map.points.length === 0
            ? 'Open the point editor to place points on the map.'
            : `${map.points.length} point${map.points.length === 1 ? '' : 's'} placed.`
          : 'Upload a base image before adding points.'
      }</p>
    </div>
  `;
}

function renderMapDetailPanel(map: GameMap): string {
  return `
    <div class="image-library-detail panel" data-item-detail data-map-id="${escapeHtml(map.id)}">
      <div class="mb-3">
        <p class="label mb-1">Selected map</p>
        <p class="text-sm font-medium text-strong">${escapeHtml(map.name.trim() || 'Untitled map')}</p>
      </div>
      ${renderMapEditorBody(map)}
      <p class="hint">The embed id updates automatically when you rename this map. Set viewport size and scroll position per embed in the journal.</p>
    </div>
  `;
}

export function mountMapsEditor(
  host: HTMLElement,
  slug: string,
  initial: GameMapsData,
  getCheckboxes: () => CheckboxConnectionsData,
  options: {
    onMapsChanged?: () => void;
    onMapIdChanged?: (oldId: string, newId: string) => void;
  } = {},
): { getData: () => GameMapsData; cleanup: () => void } {
  let maps: GameMap[] = structuredClone(initial.maps).map(normalizeGameMap);
  let selectedId: string | null = resolveEditorSelection(maps, null);
  let showAddPanel = maps.length === 0;
  let searchQuery = '';
  let cleanupSearch = () => {};
  let closePointsDialog = () => {};

  host.innerHTML = renderEditorSplitLayout({
    listTitle: 'Maps',
    listLabel: 'Maps',
    detailLabel: 'Map details',
    addAction: 'add-map',
    addLabel: 'Add map',
    searchHtml: renderListSearchBar({
      id: 'maps-search',
      placeholder: 'Search maps...',
      className: 'mb-3',
    }),
  });

  const tableHost = host.querySelector('[data-item-table-host]') as HTMLElement;
  const detailHost = host.querySelector('[data-item-detail-host]') as HTMLElement;
  detailHost.innerHTML = `
    <div data-map-add-panel class="image-library-detail panel${showAddPanel ? '' : ' hidden'}">
      <p class="label mb-3">Add map</p>
      <label class="block mb-3">
        <span class="label">Map name</span>
        <input
          type="text"
          data-field="new-map-name"
          class="input"
          placeholder="e.g. World map"
        />
      </label>
      <p class="hint mb-3">The embed id is generated from the name.</p>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-primary" data-action="confirm-add-map">${iconLabel('plus', 'Add map')}</button>
        <button type="button" class="btn-secondary" data-action="cancel-add-map">${iconLabel('close', 'Cancel')}</button>
      </div>
    </div>
    <div data-map-edit-host class="min-w-0"></div>
    <p data-map-detail-placeholder class="editor-split-detail-empty text-muted text-sm hidden">
      No maps yet. Click + to add one.
    </p>
  `;

  const addPanel = detailHost.querySelector('[data-map-add-panel]') as HTMLElement;
  const editHost = detailHost.querySelector('[data-map-edit-host]') as HTMLElement;
  const detailPlaceholder = detailHost.querySelector(
    '[data-map-detail-placeholder]',
  ) as HTMLElement;
  const newNameInput = addPanel.querySelector('[data-field="new-map-name"]') as HTMLInputElement;

  const syncFromDom = () => {
    editHost.querySelectorAll('[data-map-name]').forEach((input) => {
      const mapId = (input as HTMLElement).dataset.mapName;
      const map = maps.find((entry) => entry.id === mapId);
      if (map) map.name = (input as HTMLInputElement).value;
    });

    editHost.querySelectorAll('[data-map-point-type-name]').forEach((input) => {
      const mapId = (input as HTMLElement).dataset.mapPointTypeName;
      const typeId = (input as HTMLElement).dataset.typeId;
      const map = maps.find((entry) => entry.id === mapId);
      const type = map?.pointTypes.find((entry) => entry.id === typeId);
      if (type) type.name = (input as HTMLInputElement).value;
    });

    editHost.querySelectorAll('[data-map-point-type-color]').forEach((input) => {
      const mapId = (input as HTMLElement).dataset.mapPointTypeColor;
      const typeId = (input as HTMLElement).dataset.typeId;
      const map = maps.find((entry) => entry.id === mapId);
      const type = map?.pointTypes.find((entry) => entry.id === typeId);
      if (type) {
        type.color = normalizeColor((input as HTMLInputElement).value, type.color);
      }
    });
  };

  const isEditingDetail = (): boolean => {
    const active = document.activeElement;
    if (!active || !detailHost.contains(active)) return false;
    return active.matches('input, select, textarea');
  };

  const scrollSelectedRowIntoView = () => {
    requestAnimationFrame(() => {
      tableHost.querySelector<HTMLElement>('tr.is-selected')?.scrollIntoView({ block: 'nearest' });
    });
  };

  const commitMapUpdate = (id: string, updates: { name?: string }): string | false => {
    const map = maps.find((entry) => entry.id === id);
    if (!map) return false;

    if (updates.name !== undefined) {
      map.name = updates.name.trim();
    }

    const nameForId = map.name.trim() || 'Untitled map';
    const derivedId = slugifyMapId(
      nameForId,
      new Set(maps.filter((entry) => entry.id !== map.id).map((entry) => entry.id)),
    );

    if (derivedId !== map.id) {
      if (maps.some((entry) => entry.id === derivedId)) return false;
      const oldId = map.id;
      if (selectedId === oldId) selectedId = derivedId;
      map.id = derivedId;
      options.onMapIdChanged?.(oldId, derivedId);
    }

    render();
    return map.id;
  };

  const render = () => {
    if (isEditingDetail()) return;

    syncFromDom();

    if (!showAddPanel) {
      selectedId = resolveEditorSelection(maps, selectedId);
    }

    const listScrollTop = readListScroll(tableHost);

    tableHost.innerHTML = renderEditorItemTable(
      maps.map((map) => ({
        id: map.id,
        primary: map.name.trim() || 'Untitled map',
        searchText: `${map.name} ${map.id}`,
      })),
      {
        emptyMessage: 'No maps yet. Click + to add one.',
        selectedId: showAddPanel ? null : selectedId,
        rowAction: 'select-map',
        primaryHeader: 'Name',
        removeAction: 'remove-map',
      },
    );

    if (showAddPanel) {
      addPanel.classList.remove('hidden');
      editHost.innerHTML = '';
      editHost.classList.add('hidden');
      detailPlaceholder.classList.add('hidden');
    } else if (selectedId) {
      const map = maps.find((entry) => entry.id === selectedId);
      if (map) {
        addPanel.classList.add('hidden');
        editHost.classList.remove('hidden');
        editHost.innerHTML = renderMapDetailPanel(map);
        detailPlaceholder.classList.add('hidden');
      } else {
        addPanel.classList.add('hidden');
        editHost.innerHTML = '';
        editHost.classList.add('hidden');
        detailPlaceholder.textContent = 'Select a map from the list.';
        detailPlaceholder.classList.remove('hidden');
      }
    } else {
      addPanel.classList.add('hidden');
      editHost.innerHTML = '';
      editHost.classList.add('hidden');
      detailPlaceholder.textContent = 'No maps yet. Click + to add one.';
      detailPlaceholder.classList.remove('hidden');
    }

    wireStaticActions();

    cleanupSearch();
    const search = wireListSearch(host, {
      preserveQuery: () => searchQuery,
      onQueryChange: (query) => {
        searchQuery = query;
      },
      itemSelector: '[data-search-text]',
    });
    cleanupSearch = search.cleanup;
    options.onMapsChanged?.();
    restoreListScroll(tableHost, listScrollTop);
  };

  const handleMapImageUpload = async (mapId: string | undefined) => {
    if (!mapId) return;
    syncFromDom();
    const map = maps.find((entry) => entry.id === mapId);
    const input = editHost.querySelector(`[data-map-image-input="${mapId}"]`) as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!map || !file) return;

    try {
      const uploaded = await uploadGameImage(slug, file);
      map.imageUrl = uploaded.url;
      map.imageFilename = uploaded.filename;
      if (input) input.value = '';
      render();
    } catch (error) {
      if (error instanceof AuthRequiredError && (await requireAuth())) {
        await handleMapImageUpload(mapId);
      }
    }
  };

  const wireStaticActions = () => {
    wireEditorItemTable(tableHost, {
      rowSelector: '[data-action="select-map"]',
      readKey: (row) => row.dataset.itemId,
      isSelected: (id) => !showAddPanel && id === selectedId,
      onSelect: (id) => {
        showAddPanel = false;
        selectedId = id;
        render();
      },
    });

    wireEditorItemTableRemove(tableHost, {
      buttonSelector: '[data-action="remove-map"]',
      readKey: (button) => button.dataset.itemId,
      onRemove: (mapId) => {
        maps = maps.filter((entry) => entry.id !== mapId);
        selectedId = resolveEditorSelection(maps, selectedId);
        if (maps.length === 0) showAddPanel = true;
        render();
      },
    });

    editHost.querySelectorAll('[data-map-name]').forEach((input) => {
      input.addEventListener('input', () => {
        const mapId = (input as HTMLElement).dataset.mapName;
        const map = maps.find((entry) => entry.id === mapId);
        if (map) map.name = (input as HTMLInputElement).value;
      });
      input.addEventListener('blur', () => {
        const mapId = (input as HTMLElement).dataset.mapName;
        if (!mapId) return;
        commitMapUpdate(mapId, { name: (input as HTMLInputElement).value.trim() });
      });
    });

    editHost.querySelectorAll('[data-action="add-point-type"]').forEach((button) => {
      button.addEventListener('click', () => {
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

    editHost.querySelectorAll('[data-action="remove-point-type"]').forEach((button) => {
      button.addEventListener('click', () => {
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

    editHost.querySelectorAll('[data-action="upload-map-image"]').forEach((button) => {
      button.addEventListener('click', () => {
        void handleMapImageUpload((button as HTMLElement).dataset.mapId);
      });
    });

    editHost.querySelectorAll('[data-action="edit-map-points"]').forEach((button) => {
      button.addEventListener('click', () => {
        syncFromDom();
        const mapId = (button as HTMLElement).dataset.mapId;
        const map = maps.find((entry) => entry.id === mapId);
        if (!map?.imageUrl) return;

        closePointsDialog();
        closePointsDialog = openMapPointsEditorDialog({
          map: structuredClone(map),
          checkboxes: getCheckboxes().checkboxes,
          onSave: (points) => {
            map.points = points;
            render();
          },
        });
      });
    });
  };

  const confirmAddMap = () => {
    const name = newNameInput.value.trim();
    if (!name) {
      newNameInput.focus();
      return;
    }

    const map = createMapFromName(name, maps);
    maps.push(map);
    selectedId = map.id;
    showAddPanel = false;
    newNameInput.value = '';
    render();
    scrollSelectedRowIntoView();
  };

  host.querySelector('[data-action="add-map"]')?.addEventListener('click', () => {
    showAddPanel = true;
    render();
    newNameInput.focus();
  });

  addPanel.querySelector('[data-action="confirm-add-map"]')?.addEventListener('click', confirmAddMap);
  addPanel.querySelector('[data-action="cancel-add-map"]')?.addEventListener('click', () => {
    showAddPanel = false;
    newNameInput.value = '';
    render();
  });
  newNameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      confirmAddMap();
    }
  });

  render();

  return {
    getData: () => {
      syncFromDom();
      return {
        maps: maps.map((map) => normalizeGameMap({
          ...map,
          name: map.name.trim() || 'Untitled map',
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
    renameCheckboxReference: (oldId: string, newId: string) => {
      let changed = false;
      for (const map of maps) {
        for (const point of map.points) {
          if (point.checkboxId !== oldId) continue;
          point.checkboxId = newId;
          changed = true;
        }
      }
      if (changed) render();
    },
    cleanup: () => {
      closePointsDialog();
      cleanupSearch();
    },
  };
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
}
