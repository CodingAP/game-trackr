import path from 'node:path';

export const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
export const MAX_MEDIA_SIZE_LABEL = '100 MB';

const IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webm',
  '.webp',
  '.mp4',
]);

export function isImageFilename(filename: string): boolean {
  if (filename.startsWith('.')) return false;
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

export function filterImageFilenames(filenames: string[]): string[] {
  return filenames.filter(isImageFilename);
}

export function sanitizeImportFilename(filename: string): string | null {
  const base = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!base || !isImageFilename(base)) return null;
  return base;
}
