import { defaultMediaAlt } from './media.js';
import type { ImageLibraryData, ImageLibraryEntry, UploadedImage } from '../types/index.js';
import { findDocumentImageByUrlInPages } from './imageDocument.js';

export type { ImageLibraryData, ImageLibraryEntry } from '../types/index.js';

export function getLibraryEntry(
  library: ImageLibraryData,
  url: string,
): ImageLibraryEntry | undefined {
  return library.images.find((entry) => entry.url === url);
}

export function mergeLibraryWithUploads(
  uploaded: UploadedImage[],
  library: ImageLibraryData,
  contents: Record<string, string>,
): ImageLibraryData {
  const byUrl = new Map(library.images.map((entry) => [entry.url, entry]));

  for (const image of uploaded) {
    if (byUrl.has(image.url)) continue;

    const documentRef = findDocumentImageByUrlInPages(contents, image.url);
    byUrl.set(image.url, {
      url: image.url,
      filename: image.filename,
      alt: documentRef?.alt?.trim() || defaultMediaAlt(image.filename),
      source: documentRef?.source,
    });
  }

  return {
    images: uploaded.map((image) => {
      const existing = byUrl.get(image.url);
      return (
        existing ?? {
          url: image.url,
          filename: image.filename,
          alt: defaultMediaAlt(image.filename),
        }
      );
    }),
  };
}

export function removeLibraryEntry(library: ImageLibraryData, url: string): ImageLibraryData {
  return {
    images: library.images.filter((entry) => entry.url !== url),
  };
}

export function upsertLibraryEntry(
  library: ImageLibraryData,
  entry: ImageLibraryEntry,
): ImageLibraryData {
  const images = [...library.images];
  const index = images.findIndex((item) => item.url === entry.url);
  if (index === -1) {
    images.push(entry);
  } else {
    images[index] = entry;
  }
  return { images };
}
