import {
  buildImageSnippet,
  parseCenteredTitle,
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
  centered?: boolean;
}

export interface DocumentImageRef extends DocumentImage {
  pageId: string;
}

const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g;
const FIGURE_BLOCK =
  /<figure class="[^"]*(?:image-figure|media-figure)[^"]*">[\s\S]*?<\/figure>/g;

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
    const centered = title ? parseCenteredTitle(title) : false;
    const source =
      title && !viewport && !centered ? parseMarkdownLink(title) ?? undefined : undefined;

    markdownImages.push({
      start,
      end,
      raw: match[0],
      alt,
      url,
      viewport,
      source,
      centered: centered || undefined,
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

export function findDocumentImageByUrlInPages(
  contents: Record<string, string>,
  url: string,
): DocumentImageRef | undefined {
  for (const [pageId, content] of Object.entries(contents)) {
    const match = findDocumentImageByUrl(content, url);
    if (match) return { ...match, pageId };
  }
  return undefined;
}

export function countDocumentImagesByUrl(
  contents: Record<string, string>,
  url: string,
): number {
  return Object.values(contents).reduce(
    (total, content) => total + parseDocumentImages(content).filter((image) => image.url === url).length,
    0,
  );
}

export function propagateImageMetadataInContent(
  content: string,
  url: string,
  metadata: Pick<ImageSnippetOptions, 'alt' | 'source'>,
): string {
  let next = content;
  const matches = parseDocumentImages(content)
    .filter((image) => image.url === url)
    .sort((a, b) => b.start - a.start);

  for (const image of matches) {
    const parsed = parseImageEmbedRaw(image.raw);
    next = replaceDocumentImage(next, image, {
      alt: metadata.alt,
      url,
      viewport: parsed?.viewport,
      source: metadata.source,
      centered: parsed?.centered,
    });
  }

  return next;
}

export function propagateImageMetadataInPages(
  contents: Record<string, string>,
  url: string,
  metadata: Pick<ImageSnippetOptions, 'alt' | 'source'>,
): Record<string, string> {
  const next: Record<string, string> = { ...contents };
  for (const [pageId, content] of Object.entries(contents)) {
    const updated = propagateImageMetadataInContent(content, url, metadata);
    if (updated !== content) {
      next[pageId] = updated;
    }
  }
  return next;
}

export function removeAllDocumentImagesByUrl(
  contents: Record<string, string>,
  url: string,
): Record<string, string> {
  const next: Record<string, string> = { ...contents };
  for (const [pageId, content] of Object.entries(contents)) {
    let updated = content;
    const matches = parseDocumentImages(content)
      .filter((image) => image.url === url)
      .sort((a, b) => b.start - a.start);

    for (const image of matches) {
      updated = removeDocumentImage(updated, image);
    }

    if (updated !== content) {
      next[pageId] = updated;
    }
  }
  return next;
}

export function readImageViewportOptions(form: HTMLElement): ParsedViewport | undefined {
  const width = Number((form.querySelector('[data-field="width"]') as HTMLInputElement).value);
  const height = Number((form.querySelector('[data-field="height"]') as HTMLInputElement).value);
  const scaleToFit = (form.querySelector('[data-field="scale"]') as HTMLInputElement).checked;
  const hasViewport = Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
  return hasViewport ? { width, height, scaleToFit } : undefined;
}

export function readImageEmbedLayoutOptions(form: HTMLElement): {
  viewport?: ParsedViewport;
  centered: boolean;
} {
  return {
    viewport: readImageViewportOptions(form),
    centered: (form.querySelector('[data-field="center"]') as HTMLInputElement | null)?.checked ?? false,
  };
}

function parseFigureBlock(raw: string, start: number, end: number): DocumentImage | null {
  const figureClass = raw.match(/<figure class="([^"]*)"/i)?.[1] ?? '';
  const imgTag = raw.match(/<img\b[^>]*>/i)?.[0];
  const videoTag = raw.match(/<video\b[^>]*>/i)?.[0];
  const mediaTag = imgTag ?? videoTag;
  if (!mediaTag) return null;

  const url = mediaTag.match(/\bsrc="([^"]*)"/i)?.[1] ?? '';
  const alt = imgTag?.match(/\balt="([^"]*)"/i)?.[1] ?? (videoTag ? 'video' : '');
  const title = mediaTag.match(/\btitle="([^"]*)"/i)?.[1];
  const viewport = title ? parseViewportTitle(title) ?? undefined : undefined;
  const centered =
    figureClass.includes('image-figure-centered') ||
    figureClass.includes('media-figure-centered') ||
    parseCenteredTitle(title);

  const figcaption =
    raw.match(/<figcaption class="(?:image-source|media-source)">([\s\S]*?)<\/figcaption>/i)?.[1];
  let source: ImageSourceLink | undefined;
  if (figcaption) {
    const anchor = figcaption.match(/<a href="([^"]*)">([^<]*)<\/a>/i);
    if (anchor) {
      source = { url: anchor[1], label: anchor[2] };
    } else {
      source = parseMarkdownLink(figcaption.trim()) ?? undefined;
    }
  }

  return { start, end, raw, alt, url, viewport, source, centered: centered || undefined };
}

export function parseImageEmbedRaw(raw: string): ImageSnippetOptions | null {
  const markdownMatch = raw.match(/^!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)$/);
  if (markdownMatch) {
    const alt = markdownMatch[1];
    const url = markdownMatch[2];
    const title = markdownMatch[3];
    const viewport = title ? parseViewportTitle(title) ?? undefined : undefined;
    const centered = title ? parseCenteredTitle(title) : false;
    const source =
      title && !viewport && !centered ? parseMarkdownLink(title) ?? undefined : undefined;
    return {
      alt: alt.trim() || 'image',
      url,
      viewport,
      source,
      centered: centered || undefined,
    };
  }

  const imgTag = raw.match(/<img\b[^>]*>/i)?.[0];
  const videoTag = raw.match(/<video\b[^>]*>/i)?.[0];
  const mediaTag = imgTag ?? videoTag;
  if (!mediaTag) return null;

  const url = mediaTag.match(/\bsrc="([^"]*)"/i)?.[1] ?? '';
  if (!url) return null;

  const alt = imgTag?.match(/\balt="([^"]*)"/i)?.[1] ?? 'video';
  const title = mediaTag.match(/\btitle="([^"]*)"/i)?.[1];
  const viewport = title ? parseViewportTitle(title) ?? undefined : undefined;
  const figureClass = raw.match(/<figure class="([^"]*)"/i)?.[1] ?? '';
  const centered =
    figureClass.includes('image-figure-centered') ||
    figureClass.includes('media-figure-centered') ||
    parseCenteredTitle(title);

  const figcaption =
    raw.match(/<figcaption class="(?:image-source|media-source)">([\s\S]*?)<\/figcaption>/i)?.[1];
  let source: ImageSourceLink | undefined;
  if (figcaption) {
    const anchor = figcaption.match(/<a href="([^"]*)">([^<]*)<\/a>/i);
    if (anchor) {
      source = { url: anchor[1], label: anchor[2] };
    } else {
      source = parseMarkdownLink(figcaption.trim()) ?? undefined;
    }
  }

  return {
    alt: alt.trim() || 'image',
    url,
    viewport,
    source,
    centered: centered || undefined,
  };
}

