import type { GameMap, GameMapsData } from '../types/index.js';

export const MAP_MARKER = /\[\[map:([^\]]+)\]\]/g;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function resolveMap(maps: GameMap[], reference: string): GameMap | undefined {
  const trimmed = reference.trim();
  return (
    maps.find((map) => map.id === trimmed) ??
    maps.find((map) => map.name.toLowerCase() === trimmed.toLowerCase())
  );
}

export function buildMapMarker(map: GameMap): string {
  return `[[map:${map.id}]]`;
}

export function preprocessMapMarkdown(content: string): string {
  return content.replace(MAP_MARKER, (_match, reference: string) => {
    const encoded = encodeURIComponent(reference.trim());
    return `<div class="game-map-mount" data-map-ref="${encoded}"></div>`;
  });
}

function renderMapPoints(map: GameMap): string {
  return map.points
    .map(
      (point) => `
        <button
          type="button"
          class="game-map-point"
          style="left: ${point.x}%; top: ${point.y}%;"
          title="${escapeHtml(point.label.trim() || 'Point')}"
          aria-label="${escapeHtml(point.label.trim() || 'Map point')}"
        >
          <span class="game-map-point-pin" aria-hidden="true"></span>
          ${
            point.label.trim()
              ? `<span class="game-map-point-label">${escapeHtml(point.label.trim())}</span>`
              : ''
          }
        </button>
      `,
    )
    .join('');
}

function renderZoomControls(): string {
  return `
    <div class="game-map-zoom-controls">
      <button type="button" class="game-map-zoom-btn" data-map-zoom="out" aria-label="Zoom out">−</button>
      <span class="game-map-zoom-label" data-map-zoom-label>100%</span>
      <button type="button" class="game-map-zoom-btn" data-map-zoom="in" aria-label="Zoom in">+</button>
      <button type="button" class="game-map-zoom-btn game-map-zoom-reset" data-map-zoom="reset" aria-label="Reset zoom">⟲</button>
    </div>
  `;
}

export function renderGameMapHtml(map: GameMap): string {
  if (!map.imageUrl) {
    return `<p class="game-map-empty text-muted text-sm">Map "${escapeHtml(map.name)}" has no base image.</p>`;
  }

  return `
    <div
      class="game-map"
      data-map-id="${escapeHtml(map.id)}"
      data-viewport-width="${map.viewport.width}"
      data-viewport-height="${map.viewport.height}"
      data-start-x="${map.start.x}"
      data-start-y="${map.start.y}"
    >
      <div class="game-map-header">
        <span class="game-map-title">${escapeHtml(map.name.trim() || 'Untitled map')}</span>
      </div>
      <div class="game-map-body">
        <div
          class="game-map-frame"
          style="width: min(100%, ${map.viewport.width}px); height: ${map.viewport.height}px;"
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
          ${renderZoomControls()}
        </div>
      </div>
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

    element.outerHTML = renderGameMapHtml(map);
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function syncViewportCentering(viewport: HTMLElement, image: HTMLImageElement): void {
  const displayWidth = image.offsetWidth;
  const displayHeight = image.offsetHeight;
  const shouldCenter =
    displayWidth > 0 &&
    displayHeight > 0 &&
    displayWidth <= viewport.clientWidth &&
    displayHeight <= viewport.clientHeight;

  viewport.classList.toggle('is-centered', shouldCenter);
}

function wireSingleGameMap(root: HTMLElement): () => void {
  const viewport = root.querySelector('.game-map-viewport') as HTMLElement | null;
  const image = root.querySelector('.game-map-image') as HTMLImageElement | null;
  const zoomLabel = root.querySelector('[data-map-zoom-label]') as HTMLElement | null;
  if (!viewport || !image) return () => {};

  const startX = Number(root.dataset.startX ?? 0);
  const startY = Number(root.dataset.startY ?? 0);

  let zoom = 1;
  let hasAppliedStart = false;
  const cleanups: Array<() => void> = [];

  const updateZoomLabel = () => {
    if (zoomLabel) zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  };

  const clampScroll = () => {
    const maxX = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const maxY = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollLeft = clamp(viewport.scrollLeft, 0, maxX);
    viewport.scrollTop = clamp(viewport.scrollTop, 0, maxY);
  };

  const applyImageZoom = () => {
    if (!image.naturalWidth || !image.naturalHeight) return;
    image.style.width = `${image.naturalWidth * zoom}px`;
    image.style.height = `${image.naturalHeight * zoom}px`;
    updateZoomLabel();
    syncViewportCentering(viewport, image);
    clampScroll();
  };

  const applyStartScroll = () => {
    if (hasAppliedStart) return;
    const maxX = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const maxY = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollLeft = clamp(startX * zoom, 0, maxX);
    viewport.scrollTop = clamp(startY * zoom, 0, maxY);
    hasAppliedStart = true;
    clampScroll();
  };

  const setZoom = (nextZoom: number, anchor?: { x: number; y: number }) => {
    const oldZoom = zoom;
    const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    if (clampedZoom === oldZoom) return;

    const anchorX = anchor?.x ?? viewport.scrollLeft + viewport.clientWidth / 2;
    const anchorY = anchor?.y ?? viewport.scrollTop + viewport.clientHeight / 2;
    const pointerOffsetX = anchor ? anchor.x - viewport.scrollLeft : viewport.clientWidth / 2;
    const pointerOffsetY = anchor ? anchor.y - viewport.scrollTop : viewport.clientHeight / 2;

    zoom = clampedZoom;
    applyImageZoom();

    const ratio = zoom / oldZoom;
    viewport.scrollLeft = anchorX * ratio - pointerOffsetX;
    viewport.scrollTop = anchorY * ratio - pointerOffsetY;
    clampScroll();
  };

  const onReady = () => {
    applyImageZoom();
    applyStartScroll();
  };

  if (image.complete) {
    onReady();
  } else {
    const onLoad = () => onReady();
    image.addEventListener('load', onLoad, { once: true });
    cleanups.push(() => image.removeEventListener('load', onLoad));
  }

  root.querySelectorAll('[data-map-zoom]').forEach((button) => {
    const onClick = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      const action = (button as HTMLElement).dataset.mapZoom;
      if (action === 'in') setZoom(zoom + ZOOM_STEP);
      else if (action === 'out') setZoom(zoom - ZOOM_STEP);
      else if (action === 'reset') {
        zoom = 1;
        applyImageZoom();
        hasAppliedStart = false;
        applyStartScroll();
      }
    };
    button.addEventListener('click', onClick);
    cleanups.push(() => button.removeEventListener('click', onClick));
  });

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const anchor = {
      x: viewport.scrollLeft + (event.clientX - rect.left),
      y: viewport.scrollTop + (event.clientY - rect.top),
    };
    const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    setZoom(zoom + delta, anchor);
  };
  viewport.addEventListener('wheel', onWheel, { passive: false });
  cleanups.push(() => viewport.removeEventListener('wheel', onWheel));

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
}

export function wireGameMaps(container: HTMLElement): () => void {
  const cleanups = Array.from(container.querySelectorAll('.game-map')).map((map) =>
    wireSingleGameMap(map as HTMLElement),
  );
  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
}
