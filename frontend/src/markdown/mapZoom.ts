export const MIN_MAP_ZOOM = 0.5;
export const MAX_MAP_ZOOM = 3;
export const MAP_ZOOM_STEP = 0.25;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function syncViewportCentering(viewport: HTMLElement, image: HTMLImageElement): void {
  const displayWidth = image.offsetWidth;
  const displayHeight = image.offsetHeight;
  const shouldCenter =
    displayWidth > 0 &&
    displayHeight > 0 &&
    displayWidth <= viewport.clientWidth &&
    displayHeight <= viewport.clientHeight;

  viewport.classList.toggle('is-centered', shouldCenter);
}

export interface WireMapZoomOptions {
  startX?: number;
  startY?: number;
  zoomLabel?: HTMLElement | null;
  zoomControlsRoot?: ParentNode | null;
}

export function wireMapZoom(
  viewport: HTMLElement,
  image: HTMLImageElement,
  options: WireMapZoomOptions = {},
): () => void {
  const zoomLabel = options.zoomLabel ?? null;
  const startX = options.startX ?? 0;
  const startY = options.startY ?? 0;
  const zoomControlsRoot = options.zoomControlsRoot ?? viewport.parentElement;

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
    const clampedZoom = clamp(nextZoom, MIN_MAP_ZOOM, MAX_MAP_ZOOM);
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

  zoomControlsRoot?.querySelectorAll('[data-map-zoom]').forEach((button) => {
    const onClick = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      const action = (button as HTMLElement).dataset.mapZoom;
      if (action === 'in') setZoom(zoom + MAP_ZOOM_STEP);
      else if (action === 'out') setZoom(zoom - MAP_ZOOM_STEP);
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
    const delta = event.deltaY < 0 ? MAP_ZOOM_STEP : -MAP_ZOOM_STEP;
    setZoom(zoom + delta, anchor);
  };
  viewport.addEventListener('wheel', onWheel, { passive: false });
  cleanups.push(() => viewport.removeEventListener('wheel', onWheel));

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
}

export function getImagePercentFromClick(
  image: HTMLImageElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const rect = image.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const x = ((clientX - rect.left) / rect.width) * 100;
  const y = ((clientY - rect.top) / rect.height) * 100;
  return { x, y };
}
