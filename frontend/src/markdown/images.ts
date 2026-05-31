import type { ImageViewportSettings } from '../types/index.js';
import { formatViewportTitle } from '../storage/settings.js';

const VIEWPORT_TITLE = /^(\d+)\s*[x×]\s*(\d+)(?:\s+(fit|scale))?$/i;
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
}

export function buildImageSnippet(options: ImageSnippetOptions): string {
  const alt = escapeAttr(options.alt);
  const titleAttr = options.viewport
    ? ` title="${escapeAttr(formatViewportTitle(options.viewport.width, options.viewport.height, options.viewport.scaleToFit))}"`
    : '';

  if (options.source) {
    const sourceLink = `<a href="${escapeAttr(options.source.url)}">${escapeHtml(options.source.label)}</a>`;
    return `\n<figure class="image-figure">\n  <img src="${options.url}" alt="${alt}"${titleAttr} />\n  <figcaption class="image-source">${sourceLink}</figcaption>\n</figure>\n`;
  }

  if (options.viewport) {
    return `\n![${alt}](${options.url} "${formatViewportTitle(options.viewport.width, options.viewport.height, options.viewport.scaleToFit)}")\n`;
  }

  return `\n![${alt}](${options.url})\n`;
}

export function applyImageSources(container: HTMLElement): void {
  container.querySelectorAll('img').forEach((img) => {
    const title = img.getAttribute('title');
    if (!title || parseViewportTitle(title)) return;

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
    const override = parseViewportTitle(img.getAttribute('title'));

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
      img.removeAttribute('title');
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
  });
}

export function updateDefaultImageViewports(
  container: HTMLElement,
  globalSettings: ImageViewportSettings,
): void {
  container.querySelectorAll('img').forEach((img) => {
    const viewport = img.closest('.image-viewport') as HTMLElement | null;
    if (viewport?.dataset.customViewport === 'true') return;

    resetViewport(viewport ?? createViewportFor(img), img);

    if (globalSettings.enabled) {
      applyCustomViewport(
        viewport ?? (img.closest('.image-viewport') as HTMLElement),
        img,
        globalSettings.width,
        globalSettings.height,
        globalSettings.scaleToFit,
      );
    } else {
      applyNaturalViewport(viewport ?? (img.closest('.image-viewport') as HTMLElement), img);
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
