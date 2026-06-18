import type { GameMap, GameMapsData, ManagedCheckbox, MapPointType, MapScrollPosition, MapViewport } from '../types/index.js';
import {
  buildCheckboxIndex,
  collectDescendantLeaves,
  isCheckboxComplete,
} from './checkboxes.js';
import { managedToCheckboxItems } from './managedCheckboxes.js';
import { getImagePercentFromClick, wireMapZoom } from './mapZoom.js';
import { parseViewportTitle } from './images.js';
import { setCheckboxStates } from '../storage/progress.js';

export const MAP_MARKER = /\[\[map:([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export const DEFAULT_MAP_EMBED_LAYOUT = {
  viewport: { width: 800, height: 600 },
  start: { x: 0, y: 0 },
} as const;

export interface ParsedMapEmbed {
  mapRef: string;
  viewport?: MapViewport;
  start?: MapScrollPosition;
}

export interface LegacyGameMapFields {
  viewport?: MapViewport;
  start?: MapScrollPosition;
}

const DEFAULT_POINT_TYPE: MapPointType = {
  id: 'default',
  name: 'Default',
  color: '#10b981',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function resolveMap(maps: GameMap[], reference: string): GameMap | undefined {
  const trimmed = parseMapMarkerPayload(reference).mapRef;
  return (
    maps.find((map) => map.id === trimmed) ??
    maps.find((map) => map.name.toLowerCase() === trimmed.toLowerCase())
  );
}

export function parseMapMarkerPayload(mapRef: string, optionsPart?: string): ParsedMapEmbed {
  const parsed: ParsedMapEmbed = { mapRef: mapRef.trim() };
  const options = optionsPart?.trim();
  if (!options) return parsed;

  const startMatch = options.match(/@(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)/);
  const viewportPart = startMatch
    ? options.slice(0, startMatch.index).trim()
    : options;
  const viewport = parseViewportTitle(viewportPart);
  if (viewport) {
    parsed.viewport = { width: viewport.width, height: viewport.height };
  }
  if (startMatch) {
    parsed.start = {
      x: Number(startMatch[1]),
      y: Number(startMatch[2]),
    };
  }
  return parsed;
}

export function parseMapMarkerRaw(raw: string): ParsedMapEmbed {
  const match = raw.trim().match(/^\[\[map:([^\]|]+)(?:\|([^\]]+))?\]\]$/);
  if (!match) {
    return parseMapMarkerPayload(raw.trim());
  }
  return parseMapMarkerPayload(match[1], match[2]);
}

export function resolveMapEmbedLayout(
  parsed: ParsedMapEmbed,
  map?: GameMap & LegacyGameMapFields,
): { viewport: MapViewport; start: MapScrollPosition } {
  if (parsed.viewport || parsed.start) {
    return {
      viewport: parsed.viewport ?? DEFAULT_MAP_EMBED_LAYOUT.viewport,
      start: parsed.start ?? DEFAULT_MAP_EMBED_LAYOUT.start,
    };
  }

  if (map?.viewport || map?.start) {
    return {
      viewport: map.viewport ?? DEFAULT_MAP_EMBED_LAYOUT.viewport,
      start: map.start ?? DEFAULT_MAP_EMBED_LAYOUT.start,
    };
  }

  return {
    viewport: { ...DEFAULT_MAP_EMBED_LAYOUT.viewport },
    start: { ...DEFAULT_MAP_EMBED_LAYOUT.start },
  };
}

export function buildMapMarker(
  map: Pick<GameMap, 'id'>,
  layout?: { viewport?: MapViewport; start?: MapScrollPosition },
): string {
  const resolved = resolveMapEmbedLayout(
    {
      mapRef: map.id,
      viewport: layout?.viewport,
      start: layout?.start,
    },
    undefined,
  );
  const { viewport, start } = resolved;
  const isDefault =
    viewport.width === DEFAULT_MAP_EMBED_LAYOUT.viewport.width &&
    viewport.height === DEFAULT_MAP_EMBED_LAYOUT.viewport.height &&
    start.x === DEFAULT_MAP_EMBED_LAYOUT.start.x &&
    start.y === DEFAULT_MAP_EMBED_LAYOUT.start.y;
  if (isDefault) return `[[map:${map.id}]]`;
  return `[[map:${map.id}|${viewport.width}x${viewport.height}@${start.x},${start.y}]]`;
}

export function replaceMapMarkerReference(
  content: string,
  oldRef: string,
  newRef: string,
): string {
  if (oldRef === newRef) return content;
  return content.replace(MAP_MARKER, (match, mapRef: string, options?: string) => {
    if (parseMapMarkerPayload(mapRef, options).mapRef !== oldRef) return match;
    return options ? `[[map:${newRef}|${options}]]` : `[[map:${newRef}]]`;
  });
}

export function preprocessMapMarkdown(content: string): string {
  return content.replace(MAP_MARKER, (_match, mapRef: string, options?: string) => {
    const parsed = parseMapMarkerPayload(mapRef, options);
    const encoded = encodeURIComponent(parsed.mapRef);
    const layout = resolveMapEmbedLayout(parsed);
    return `<div class="game-map-mount" data-map-ref="${encoded}" data-viewport-width="${layout.viewport.width}" data-viewport-height="${layout.viewport.height}" data-start-x="${layout.start.x}" data-start-y="${layout.start.y}"></div>`;
  });
}

export function defaultPointTypes(): MapPointType[] {
  return [{ ...DEFAULT_POINT_TYPE }];
}

export function resolvePointType(map: GameMap, typeId: string | null | undefined): MapPointType {
  const types = map.pointTypes?.length ? map.pointTypes : defaultPointTypes();
  return types.find((type) => type.id === typeId) ?? types[0] ?? DEFAULT_POINT_TYPE;
}

export function normalizeGameMap(map: GameMap & LegacyGameMapFields): GameMap {
  const pointTypes =
    Array.isArray(map.pointTypes) && map.pointTypes.length > 0
      ? map.pointTypes
      : defaultPointTypes();
  const defaultTypeId = pointTypes[0].id;

  return {
    id: map.id,
    name: map.name,
    imageUrl: map.imageUrl,
    imageFilename: map.imageFilename,
    pointTypes,
    points: (Array.isArray(map.points) ? map.points : []).map((point) => ({
      id: point.id,
      x: point.x,
      y: point.y,
      label: point.label,
      typeId:
        point.typeId && pointTypes.some((type) => type.id === point.typeId)
          ? point.typeId
          : defaultTypeId,
      checkboxId: point.checkboxId ?? null,
    })),
  };
}

function renderMapPoints(map: GameMap): string {
  return map.points
    .map((point) => {
      const pointType = resolvePointType(map, point.typeId);
      const hasCheckbox = Boolean(point.checkboxId);

      return `
        <button
          type="button"
          class="game-map-point${hasCheckbox ? ' has-checkbox' : ''}"
          style="left: ${point.x}%; top: ${point.y}%;"
          data-point-id="${escapeHtml(point.id)}"
          data-point-type-id="${escapeHtml(pointType.id)}"
          ${point.checkboxId ? `data-checkbox-id="${escapeHtml(point.checkboxId)}"` : ''}
          title="${escapeHtml(point.label.trim() || 'Point')}"
          aria-label="${escapeHtml(point.label.trim() || 'Map point')}"
        >
          <span
            class="game-map-point-pin"
            style="background-color: ${escapeHtml(pointType.color)};"
            aria-hidden="true"
          ></span>
          ${
            point.label.trim()
              ? `<span class="game-map-point-label">${escapeHtml(point.label.trim())}</span>`
              : ''
          }
        </button>
      `;
    })
    .join('');
}

function renderMapLegend(map: GameMap): string {
  const types = map.pointTypes?.length ? map.pointTypes : defaultPointTypes();
  if (types.length === 0) return '';

  return `
    <div class="game-map-legend" role="group" aria-label="Map legend">
      ${types
        .map((type) => {
          const label = type.name.trim() || type.id;
          return `
            <button
              type="button"
              class="game-map-legend-item is-active"
              data-legend-type="${escapeHtml(type.id)}"
              aria-pressed="true"
              aria-label="Toggle ${escapeHtml(label)} points"
            >
              <span
                class="game-map-legend-swatch"
                style="background-color: ${escapeHtml(type.color)};"
                aria-hidden="true"
              ></span>
              <span class="game-map-legend-label">${escapeHtml(label)}</span>
            </button>
          `;
        })
        .join('')}
    </div>
  `;
}

export function renderMapZoomControls(): string {
  return `
    <div class="game-map-zoom-controls">
      <button type="button" class="game-map-zoom-btn" data-map-zoom="out" aria-label="Zoom out">−</button>
      <span class="game-map-zoom-label" data-map-zoom-label>100%</span>
      <button type="button" class="game-map-zoom-btn" data-map-zoom="in" aria-label="Zoom in">+</button>
      <button type="button" class="game-map-zoom-btn game-map-zoom-reset" data-map-zoom="reset" aria-label="Reset zoom">⟲</button>
    </div>
  `;
}

export function renderGameMapHtml(
  map: GameMap,
  layout: { viewport: MapViewport; start: MapScrollPosition } = DEFAULT_MAP_EMBED_LAYOUT,
): string {
  if (!map.imageUrl) {
    return `<p class="game-map-empty text-muted text-sm">Map "${escapeHtml(map.name)}" has no base image.</p>`;
  }

  return `
    <div
      class="game-map"
      data-map-id="${escapeHtml(map.id)}"
      data-viewport-width="${layout.viewport.width}"
      data-viewport-height="${layout.viewport.height}"
      data-start-x="${layout.start.x}"
      data-start-y="${layout.start.y}"
    >
      <div class="game-map-header">
        <span class="game-map-title">${escapeHtml(map.name.trim() || 'Untitled map')}</span>
      </div>
      <div class="game-map-body">
        <div
          class="game-map-frame"
          style="width: min(100%, ${layout.viewport.width}px); height: ${layout.viewport.height}px;"
        >
          <div class="game-map-viewport">
            <div class="game-map-stage">
              <img
                class="game-map-image"
                src="${escapeHtml(map.imageUrl)}"
                alt="${escapeHtml(map.name.trim() || 'Game map')}"
                draggable="false"
              />
              ${renderMapPoints(map)}
            </div>
          </div>
          ${renderMapZoomControls()}
        </div>
      </div>
      ${renderMapLegend(map)}
    </div>
  `;
}

export function mountGameMapBlocks(container: HTMLElement, mapsData: GameMapsData): void {
  container.querySelectorAll('.game-map-mount[data-map-ref]').forEach((element) => {
    const ref = decodeURIComponent(element.getAttribute('data-map-ref') ?? '');
    const map = resolveMap(mapsData.maps, ref);
    if (!map) {
      element.outerHTML = `<p class="game-map-unknown text-muted text-sm">Unknown map: ${escapeHtml(ref)}</p>`;
      return;
    }

    const layout = {
      viewport: {
        width: Number(element.getAttribute('data-viewport-width')) || DEFAULT_MAP_EMBED_LAYOUT.viewport.width,
        height: Number(element.getAttribute('data-viewport-height')) || DEFAULT_MAP_EMBED_LAYOUT.viewport.height,
      },
      start: {
        x: Number(element.getAttribute('data-start-x')) || DEFAULT_MAP_EMBED_LAYOUT.start.x,
        y: Number(element.getAttribute('data-start-y')) || DEFAULT_MAP_EMBED_LAYOUT.start.y,
      },
    };

    element.outerHTML = renderGameMapHtml(normalizeGameMap(map), layout);
  });
}

export interface WireGameMapsContext {
  gameSlug: string;
  checkboxes: ManagedCheckbox[];
  checkedItems: Record<string, boolean>;
  onProgressUpdate: (checkedItems: Record<string, boolean>) => void;
}

function wireSingleGameMap(root: HTMLElement, context?: WireGameMapsContext): () => void {
  const viewport = root.querySelector('.game-map-viewport') as HTMLElement | null;
  const image = root.querySelector('.game-map-image') as HTMLImageElement | null;
  const zoomLabel = root.querySelector('[data-map-zoom-label]') as HTMLElement | null;
  if (!viewport || !image) return () => {};

  const startX = Number(root.dataset.startX ?? 0);
  const startY = Number(root.dataset.startY ?? 0);

  const cleanups: Array<() => void> = [];

  const checkboxItems = context ? managedToCheckboxItems(context.checkboxes) : [];
  const checkboxIndex = buildCheckboxIndex(checkboxItems);

  const syncPointCompletionVisuals = (checkedItems: Record<string, boolean>) => {
    if (!context) return;
    syncMapPointCompletionVisuals(root, context.checkboxes, checkedItems);
  };

  const legendToggles = new Map(
    Array.from(root.querySelectorAll<HTMLElement>('[data-legend-type]')).map((button) => [
      button.dataset.legendType ?? '',
      button,
    ]),
  );

  const syncLegendVisibility = () => {
    root.querySelectorAll<HTMLElement>('.game-map-point[data-point-type-id]').forEach((point) => {
      const typeId = point.dataset.pointTypeId ?? '';
      const toggle = legendToggles.get(typeId);
      const hidden = toggle ? !toggle.classList.contains('is-active') : false;
      point.classList.toggle('is-legend-hidden', hidden);
    });
  };

  legendToggles.forEach((button) => {
    const onToggle = () => {
      const isActive = button.classList.toggle('is-active');
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      syncLegendVisibility();
    };

    button.addEventListener('click', onToggle);
    cleanups.push(() => button.removeEventListener('click', onToggle));
  });

  syncLegendVisibility();

  if (context) {
    syncPointCompletionVisuals(context.checkedItems);

    root.querySelectorAll<HTMLElement>('.game-map-point[data-checkbox-id]').forEach((point) => {
      const onClick = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();

        const checkboxId = point.dataset.checkboxId;
        if (!checkboxId || !context) return;

        const item = checkboxIndex.get(checkboxId);
        if (!item) return;

        const currentlyComplete = isCheckboxComplete(checkboxId, checkboxIndex, context.checkedItems);
        const targetChecked = !currentlyComplete;
        const updates: Record<string, boolean> = {};

        if (item.childIds.length > 0) {
          for (const leafId of collectDescendantLeaves(item.id, checkboxIndex)) {
            updates[leafId] = targetChecked;
          }
        } else {
          updates[item.id] = targetChecked;
        }

        const updated = setCheckboxStates(context.gameSlug, updates);
        context.checkedItems = updated.checkedItems;
        syncPointCompletionVisuals(updated.checkedItems);
        context.onProgressUpdate(updated.checkedItems);
      };

      point.addEventListener('click', onClick);
      cleanups.push(() => point.removeEventListener('click', onClick));
    });
  }

  cleanups.push(
    wireMapZoom(viewport, image, {
      startX,
      startY,
      zoomLabel,
      zoomControlsRoot: root,
    }),
  );

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
}

export function syncMapPointCompletionVisuals(
  container: HTMLElement,
  checkboxes: ManagedCheckbox[],
  checkedItems: Record<string, boolean>,
): void {
  const checkboxIndex = buildCheckboxIndex(managedToCheckboxItems(checkboxes));

  container.querySelectorAll<HTMLElement>('.game-map-point[data-checkbox-id]').forEach((point) => {
    const checkboxId = point.dataset.checkboxId;
    if (!checkboxId) return;

    const completed = isCheckboxComplete(checkboxId, checkboxIndex, checkedItems);
    point.classList.toggle('is-completed', completed);
    point.setAttribute('aria-pressed', completed ? 'true' : 'false');
  });
}

export function wireGameMaps(container: HTMLElement, context?: WireGameMapsContext): () => void {
  const cleanups = Array.from(container.querySelectorAll('.game-map')).map((map) =>
    wireSingleGameMap(map as HTMLElement, context),
  );
  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
}

export { getImagePercentFromClick, wireMapZoom };
