import type {
  CompletionTagsData,
  JournalExportBundle,
  JournalExportImage,
  UploadedImage,
} from '../types/index.js';
import { JOURNAL_EXPORT_VERSION } from '../types/index.js';

const IMPORT_DRAFT_KEY = 'game-tracking:import-draft';

export interface ImportDraft {
  name: string;
  slug: string;
  content: string;
  completionTags?: CompletionTagsData;
}

export function slugifyJournalName(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'imported-game';
}

export function nameFromMarkdownFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').trim();
  const spaced = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return spaced || 'Imported Game';
}

export function downloadJsonFile(filename: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadJournalBundle(bundle: JournalExportBundle): void {
  downloadJsonFile(`${bundle.slug}.gametrackr.json`, bundle);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

export async function buildJournalExportBundle(
  slug: string,
  name: string,
  content: string,
  completionTags: CompletionTagsData,
  uploadedImages: UploadedImage[],
): Promise<JournalExportBundle> {
  const images: JournalExportImage[] = await Promise.all(
    uploadedImages.map(async (image) => {
      const response = await fetch(image.url);
      if (!response.ok) {
        throw new Error(`Failed to load image: ${image.filename}`);
      }

      const blob = await response.blob();
      const data = arrayBufferToBase64(await blob.arrayBuffer());

      return {
        filename: image.filename,
        mimeType: blob.type || 'application/octet-stream',
        data,
      };
    }),
  );

  return {
    version: JOURNAL_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    name,
    slug,
    content,
    completionTags,
    images,
  };
}

export function setImportDraft(draft: ImportDraft): void {
  sessionStorage.setItem(IMPORT_DRAFT_KEY, JSON.stringify(draft));
}

export function consumeImportDraft(): ImportDraft | null {
  const raw = sessionStorage.getItem(IMPORT_DRAFT_KEY);
  if (!raw) return null;

  sessionStorage.removeItem(IMPORT_DRAFT_KEY);

  try {
    const draft = JSON.parse(raw) as ImportDraft;
    if (!draft.name || !draft.slug || typeof draft.content !== 'string') {
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function isJournalExportBundle(value: unknown): value is JournalExportBundle {
  if (!value || typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;
  return (
    record.version === JOURNAL_EXPORT_VERSION &&
    typeof record.content === 'string' &&
    typeof record.name === 'string' &&
    typeof record.slug === 'string' &&
    record.completionTags !== null &&
    typeof record.completionTags === 'object' &&
    Array.isArray((record.completionTags as CompletionTagsData).tags) &&
    Array.isArray(record.images)
  );
}

export type ParsedImportFile =
  | { kind: 'bundle'; bundle: JournalExportBundle }
  | { kind: 'markdown'; name: string; slug: string; content: string };

export async function parseImportFile(file: File): Promise<ParsedImportFile> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.json') || lowerName.endsWith('.gametrackr.json')) {
    const parsed = JSON.parse(await file.text()) as unknown;
    if (!isJournalExportBundle(parsed)) {
      throw new Error('Invalid journal bundle file.');
    }
    return { kind: 'bundle', bundle: parsed };
  }

  const content = await file.text();
  if (!content.trim()) {
    throw new Error('That markdown file is empty.');
  }

  const name = nameFromMarkdownFilename(file.name);
  return {
    kind: 'markdown',
    name,
    slug: slugifyJournalName(name),
    content,
  };
}
