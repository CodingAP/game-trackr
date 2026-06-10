import type { ImageViewportSettings } from '../types/index.js';
import { formatViewportTitle } from '../storage/settings.js';
import { isVideoUrl } from './media.js';

const VIEWPORT_TITLE = /^(\d+)\s*[x×]\s*(\d+)(?:\s+(fit|scale))?(?:\s+center)?$/i;
const CENTER_ONLY_TITLE = /^center$/i;
const MARKDOWN_LINK = /^\[([^\]]+)\]\(([^)]+)\)$/;

export interface ParsedViewport {
  width: number;
  height: number;
  scaleToFit: boolean;
}

export interface ImageSourceLink {
  label: string;
  url: string;
}

export function parseCenteredTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  const trimmed = title.trim();
  return CENTER_ONLY_TITLE.test(trimmed) || /\bcenter\b/i.test(trimmed);
}

export function parseViewportTitle(title: string | null | undefined): ParsedViewport | null {
  if (!title) return null;
  const match = title.trim().match(VIEWPORT_TITLE);
  if (!match) return null;
  return {
    width: Number(match[1]),
    height: Number(match[2]),
    scaleToFit: Boolean(match[3]),
  };
}

export function formatImageEmbedTitle(options: {
  viewport?: ParsedViewport;
  centered?: boolean;
}): string | undefined {
  if (options.viewport) {
    const base = formatViewportTitle(
      options.viewport.width,
      options.viewport.height,
      options.viewport.scaleToFit,
    );
    return options.centered ? `${base} center` : base;
  }
  if (options.centered) return 'center';
  return undefined;
}

export function parseMarkdownLink(value: string | null | undefined): ImageSourceLink | null {
  if (!value) return null;
  const match = value.trim().match(MARKDOWN_LINK);
  if (!match) return null;
  const label = match[1].trim();
  const url = match[2].trim();
  if (!label || !url) return null;
  return { label, url };
}

export interface ImageSnippetOptions {
  alt: string;
  url: string;
  viewport?: ParsedViewport;
  source?: ImageSourceLink;
  centered?: boolean;
}

function buildVideoSnippet(options: ImageSnippetOptions): string {
  const embedTitle = formatImageEmbedTitle(options);
  const titleAttr = embedTitle ? ` title="${escapeAttr(embedTitle)}"` : '';
  const figureClass = options.centered ? 'media-figure media-figure-centered' : 'media-figure';
  const videoTag = `<video src="${options.url}" controls playsinline${titleAttr}></video>`;

  if (options.source) {
    const sourceLink = `<a href="${escapeAttr(options.source.url)}">${escapeHtml(options.source.label)}</a>`;
    return `\n<figure class="${figureClass}">\n  ${videoTag}\n  <figcaption class="media-source">${sourceLink}</figcaption>\n</figure>\n`;
  }

  return `\n<figure class="${figureClass}">\n  ${videoTag}\n</figure>\n`;
}

export function buildImageSnippet(options: ImageSnippetOptions): string {
  if (isVideoUrl(options.url)) {
    return buildVideoSnippet(options);
  }

  const alt = escapeAttr(options.alt);
  const embedTitle = formatImageEmbedTitle(options);
  const titleAttr = embedTitle ? ` title="${escapeAttr(embedTitle)}"` : '';
  const figureClass = options.centered ? 'image-figure image-figure-centered' : 'image-figure';

  if (options.source) {
    const sourceLink = `<a href="${escapeAttr(options.source.url)}">${escapeHtml(options.source.label)}</a>`;
    return `\n<figure class="${figureClass}">\n  <img src="${options.url}" alt="${alt}"${titleAttr} />\n  <figcaption class="image-source">${sourceLink}</figcaption>\n</figure>\n`;
  }

  if (options.viewport || options.centered) {
    const title = embedTitle ?? '';
    return `\n![${alt}](${options.url}${title ? ` "${title}"` : ''})\n`;
  }

  return `\n![${alt}](${options.url})\n`;
}

export function openImageInNewTab(url: string): void {
  const trimmed = url.trim();
  if (!trimmed) return;
  window.open(trimmed, '_blank', 'noopener,noreferrer');
}

export function wireClickableJournalImages(container: HTMLElement): () => void {
  const cleanups: Array<() => void> = [];

  const wireElement = (element: HTMLImageElement | HTMLVideoElement, defaultTitle: string) => {
    if (element.closest('.game-map')) return;

    element.classList.add('journal-image-clickable');
    if (!element.title) {
      element.title = defaultTitle;
    }

    const onClick = (event: Event) => {
      event.preventDefault();
      openImageInNewTab(element.currentSrc || element.src);
    };

    element.addEventListener('click', onClick);
    cleanups.push(() => {
      element.removeEventListener('click', onClick);
      element.classList.remove('journal-image-clickable');
    });
  };

  container.querySelectorAll('img').forEach((img) => {
    wireElement(img as HTMLImageElement, 'Open image in new tab');
  });

  container.querySelectorAll('figure.media-figure video').forEach((video) => {
    wireElement(video as HTMLVideoElement, 'Open video in new tab');
  });

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
}

export function applyImageSources(container: HTMLElement): void {
  container.querySelectorAll('img').forEach((img) => {
    const title = img.getAttribute('title');
    if (!title || parseViewportTitle(title) || parseCenteredTitle(title)) return;

    img.removeAttribute('title');

    let figure = img.closest('figure.image-figure') as HTMLElement | null;
    if (!figure) {
      figure = document.createElement('figure');
      figure.className = 'image-figure';
      img.parentNode?.insertBefore(figure, img);
      figure.append(img);
    }

    if (figure.querySelector('.image-source')) return;

    figure.append(renderSourceCaption(title));
  });

  container.querySelectorAll('figure.image-figure figcaption.image-source').forEach((caption) => {
    if (caption.querySelector('a')) return;
    const text = caption.textContent?.trim();
    if (!text) return;

    const link = parseMarkdownLink(text);
    if (!link) return;

    caption.replaceChildren(createSourceAnchor(link));
  });
}

export function applyImageViewports(
  container: HTMLElement,
  globalSettings: ImageViewportSettings,
): void {
  container.querySelectorAll('img').forEach((img) => {
    const title = img.getAttribute('title');
    const override = parseViewportTitle(title);
    const centered = parseCenteredTitle(title);

    let viewport = img.closest('.image-viewport') as HTMLElement | null;
    if (!viewport) {
      viewport = document.createElement('div');
      viewport.className = 'image-viewport';
      img.parentNode?.insertBefore(viewport, img);
      viewport.append(img);
    }

    resetViewport(viewport, img);

    if (override) {
      applyCustomViewport(viewport, img, override.width, override.height, override.scaleToFit);
      viewport.dataset.customViewport = 'true';
    } else if (globalSettings.enabled) {
      applyCustomViewport(
        viewport,
        img,
        globalSettings.width,
        globalSettings.height,
        globalSettings.scaleToFit,
      );
    } else {
      applyNaturalViewport(viewport, img);
    }

    if (centered) {
      applyCenteredImage(viewport, img);
    }

    if (override || centered) {
      img.removeAttribute('title');
    }
  });

  container.querySelectorAll('figure.image-figure-centered').forEach((figure) => {
    const img = figure.querySelector('img');
    if (!img) return;
    const viewport = img.closest('.image-viewport') as HTMLElement | null;
    applyCenteredImage(viewport, img);
  });

  applyMediaViewports(container, globalSettings);
}

export function applyMediaViewports(
  container: HTMLElement,
  globalSettings: ImageViewportSettings,
): void {
  container.querySelectorAll('figure.media-figure video').forEach((video) => {
    const element = video as HTMLVideoElement;
    const title = element.getAttribute('title');
    const override = parseViewportTitle(title);
    const centered = parseCenteredTitle(title);

    let viewport = element.closest('.media-viewport') as HTMLElement | null;
    if (!viewport) {
      viewport = document.createElement('div');
      viewport.className = 'media-viewport';
      element.parentNode?.insertBefore(viewport, element);
      viewport.append(element);
    }

    viewport.className = 'media-viewport';
    viewport.style.maxWidth = '';
    viewport.style.maxHeight = '';
    viewport.style.width = '';
    element.style.maxWidth = '';
    element.style.maxHeight = '';
    element.style.width = '';
    element.style.height = '';

    const width = override?.width ?? (globalSettings.enabled ? globalSettings.width : undefined);
    const height = override?.height ?? (globalSettings.enabled ? globalSettings.height : undefined);

    if (width && height) {
      viewport.classList.add('media-viewport-custom');
      viewport.style.maxWidth = `${width}px`;
      viewport.style.maxHeight = `${height}px`;
      element.style.maxWidth = '100%';
      element.style.height = 'auto';
      if (override) viewport.dataset.customViewport = 'true';
    } else {
      viewport.classList.add('media-viewport-natural');
      element.style.maxWidth = '100%';
      element.style.height = 'auto';
    }

    const figure = element.closest('figure.media-figure') as HTMLElement | null;
    if (centered || figure?.classList.contains('media-figure-centered')) {
      figure?.classList.add('media-figure-centered');
      viewport.classList.add('media-embed-centered');
    }

    if (override || centered) {
      element.removeAttribute('title');
    }
  });
}

function renderSourceCaption(content: string): HTMLElement {
  const caption = document.createElement('figcaption');
  caption.className = 'image-source';

  const link = parseMarkdownLink(content);
  if (link) {
    caption.append(createSourceAnchor(link));
    return caption;
  }

  caption.textContent = content;
  return caption;
}

function createSourceAnchor(link: ImageSourceLink): HTMLAnchorElement {
  const anchor = document.createElement('a');
  anchor.href = link.url;
  anchor.textContent = link.label;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  return anchor;
}

function createViewportFor(img: HTMLImageElement): HTMLElement {
  const viewport = document.createElement('div');
  viewport.className = 'image-viewport';
  img.parentNode?.insertBefore(viewport, img);
  viewport.append(img);
  return viewport;
}

function resetViewport(viewport: HTMLElement, img: HTMLImageElement): void {
  viewport.className = 'image-viewport';
  viewport.style.maxWidth = '';
  viewport.style.maxHeight = '';
  viewport.style.width = '';
  img.style.maxWidth = '';
  img.style.maxHeight = '';
  img.style.width = '';
  img.style.height = '';
  img.style.objectFit = '';
}

function applyNaturalViewport(viewport: HTMLElement, img: HTMLImageElement): void {
  viewport.classList.add('image-viewport-natural');
  img.classList.add('image-natural');
}

function applyCenteredImage(viewport: HTMLElement | null, img: HTMLImageElement): void {
  const figure = img.closest('figure.image-figure') as HTMLElement | null;
  figure?.classList.add('image-figure-centered');
  (viewport ?? img).classList.add('image-embed-centered');
}

function applyCustomViewport(
  viewport: HTMLElement,
  img: HTMLImageElement,
  width: number,
  height: number,
  scaleToFit: boolean,
): void {
  viewport.classList.add('image-viewport-custom');
  viewport.style.maxWidth = `${width}px`;
  viewport.style.maxHeight = `${height}px`;

  if (scaleToFit) {
    viewport.classList.add('image-viewport-scale');
    viewport.style.width = `${width}px`;
    viewport.style.height = `${height}px`;
    img.classList.add('image-scaled');
  } else {
    img.classList.add('image-natural');
  }
}

function escapeAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
