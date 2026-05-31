import path from 'node:path';

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
]);

export function isImageFilename(filename: string): boolean {
  if (filename.startsWith('.')) return false;
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

export function filterImageFilenames(filenames: string[]): string[] {
  return filenames.filter(isImageFilename);
}
