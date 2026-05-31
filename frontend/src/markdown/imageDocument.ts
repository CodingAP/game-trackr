import {
  buildImageSnippet,
  parseMarkdownLink,
  parseViewportTitle,
  type ImageSnippetOptions,
  type ImageSourceLink,
  type ParsedViewport,
} from './images.js';

export interface DocumentImage {
  start: number;
  end: number;
  raw: string;
  alt: string;
  url: string;
  viewport?: ParsedViewport;
  source?: ImageSourceLink;
}

const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g;
const FIGURE_BLOCK = /<figure class="image-figure">[\s\S]*?<\/figure>/g;

export function parseDocumentImages(content: string): DocumentImage[] {
  const figures: DocumentImage[] = [];
  const occupied: Array<{ start: number; end: number }> = [];

  for (const match of content.matchAll(FIGURE_BLOCK)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const end = start + raw.length;
    const parsed = parseFigureBlock(raw, start, end);
    if (parsed) {
      figures.push(parsed);
      occupied.push({ start, end });
    }
  }

  const markdownImages: DocumentImage[] = [];
  for (const match of content.matchAll(MARKDOWN_IMAGE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (occupied.some((range) => start >= range.start && start < range.end)) continue;

    const alt = match[1];
    const url = match[2];
    const title = match[3];
    const viewport = title ? parseViewportTitle(title) ?? undefined : undefined;
    const source =
      title && !viewport ? parseMarkdownLink(title) ?? undefined : undefined;

    markdownImages.push({
      start,
      end,
      raw: match[0],
      alt,
      url,
      viewport,
      source,
    });
  }

  return [...figures, ...markdownImages].sort((a, b) => a.start - b.start);
}

export function replaceDocumentImage(
  content: string,
  image: DocumentImage,
  options: ImageSnippetOptions,
): string {
  const snippet = buildImageSnippet(options);
  return `${content.slice(0, image.start)}${snippet}${content.slice(image.end)}`;
}

export function removeDocumentImage(content: string, image: DocumentImage): string {
  return `${content.slice(0, image.start)}${content.slice(image.end)}`;
}

export function findDocumentImageByUrl(content: string, url: string): DocumentImage | undefined {
  return parseDocumentImages(content).find((image) => image.url === url);
}

export function upsertDocumentImage(
  content: string,
  options: ImageSnippetOptions,
): string {
  const existing = findDocumentImageByUrl(content, options.url);
  if (existing) {
    return replaceDocumentImage(content, existing, options);
  }

  const snippet = buildImageSnippet(options);
  const trimmed = content.trimEnd();
  const prefix = trimmed.length === 0 ? '' : '\n\n';
  return `${trimmed}${prefix}${snippet}`;
}

function parseFigureBlock(raw: string, start: number, end: number): DocumentImage | null {
  const imgTag = raw.match(/<img\b[^>]*>/i)?.[0];
  if (!imgTag) return null;

  const url = imgTag.match(/\bsrc="([^"]*)"/i)?.[1] ?? '';
  const alt = imgTag.match(/\balt="([^"]*)"/i)?.[1] ?? '';
  const title = imgTag.match(/\btitle="([^"]*)"/i)?.[1];
  const viewport = title ? parseViewportTitle(title) ?? undefined : undefined;

  const figcaption = raw.match(/<figcaption class="image-source">([\s\S]*?)<\/figcaption>/i)?.[1];
  let source: ImageSourceLink | undefined;
  if (figcaption) {
    const anchor = figcaption.match(/<a href="([^"]*)">([^<]*)<\/a>/i);
    if (anchor) {
      source = { url: anchor[1], label: anchor[2] };
    } else {
      source = parseMarkdownLink(figcaption.trim()) ?? undefined;
    }
  }

  return { start, end, raw, alt, url, viewport, source };
}

export function readImageFormOptions(form: HTMLElement, url: string): ImageSnippetOptions {
  const alt = (form.querySelector('[data-field="alt"]') as HTMLInputElement).value.trim() || 'image';
  const width = Number((form.querySelector('[data-field="width"]') as HTMLInputElement).value);
  const height = Number((form.querySelector('[data-field="height"]') as HTMLInputElement).value);
  const scaleToFit = (form.querySelector('[data-field="scale"]') as HTMLInputElement).checked;
  const sourceLabel = (form.querySelector('[data-field="source-label"]') as HTMLInputElement).value.trim();
  const sourceUrl = (form.querySelector('[data-field="source-url"]') as HTMLInputElement).value.trim();

  const hasViewport = Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;

  return {
    alt,
    url,
    viewport: hasViewport ? { width, height, scaleToFit } : undefined,
    source: sourceLabel && sourceUrl ? { label: sourceLabel, url: sourceUrl } : undefined,
  };
}
