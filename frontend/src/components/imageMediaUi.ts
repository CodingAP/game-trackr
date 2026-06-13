import { defaultMediaAlt, isVideoUrl } from '../markdown/media.js';
import { getLibraryEntry, type ImageLibraryData } from '../markdown/imageLibrary.js';
import type { ImageLibraryEntry, UploadedImage } from '../types/index.js';
import { iconLabel } from './icons.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function readMediaOptions(form: HTMLElement) {
  const altInput = form.querySelector('[data-field="alt"]') as HTMLInputElement | null;
  const sourceLabelInput = form.querySelector('[data-field="source-label"]') as HTMLInputElement | null;
  const sourceUrlInput = form.querySelector('[data-field="source-url"]') as HTMLInputElement | null;
  const sourceLabel = sourceLabelInput?.value.trim();
  const sourceUrl = sourceUrlInput?.value.trim();

  return {
    alt: altInput?.value.trim(),
    source: sourceLabel && sourceUrl ? { label: sourceLabel, url: sourceUrl } : undefined,
  };
}

export function renderMediaThumb(url: string, className: string): string {
  if (isVideoUrl(url)) {
    return `<video src="${escapeHtml(url)}" class="${className}" muted playsinline preload="metadata"></video>`;
  }
  return `<img src="${escapeHtml(url)}" alt="" class="${className}" />`;
}

export function resolveMediaAltText(
  image: Pick<UploadedImage, 'url' | 'filename'>,
  library?: ImageLibraryData,
): string {
  const entry = library ? getLibraryEntry(library, image.url) : undefined;
  return entry?.alt?.trim() || defaultMediaAlt(image.filename);
}

export function renderImageTable(
  images: UploadedImage[],
  library?: ImageLibraryData,
  options: {
    emptyMessage?: string;
    rowAction?: string;
    selectedUrl?: string | null;
  } = {},
): string {
  const emptyMessage = options.emptyMessage ?? 'No uploaded media yet. Add one on the right.';
  const rowAction = options.rowAction ?? 'pick-image';

  if (images.length === 0) {
    return `<p class="text-muted text-sm px-3 py-4">${escapeHtml(emptyMessage)}</p>`;
  }

  return `
    <div class="image-picker-table-wrap">
      <table class="image-picker-table">
        <thead>
          <tr>
            <th scope="col">Preview</th>
            <th scope="col">Alt text</th>
          </tr>
        </thead>
        <tbody>
          ${images
            .map((image) => {
              const altText = resolveMediaAltText(image, library);
              const selected = options.selectedUrl === image.url;
              return `
                <tr
                  tabindex="0"
                  role="button"
                  class="${selected ? 'is-selected' : ''}"
                  data-action="${escapeHtml(rowAction)}"
                  data-image-url="${escapeHtml(image.url)}"
                  data-image-filename="${escapeHtml(image.filename)}"
                  data-search-text="${escapeHtml(`${altText} ${image.filename} ${image.url}`)}"
                  title="${escapeHtml(altText)}"
                  aria-pressed="${selected ? 'true' : 'false'}"
                >
                  <td class="image-picker-table-preview">
                    ${renderMediaThumb(image.url, 'image-picker-table-thumb')}
                  </td>
                  <td class="image-picker-table-name">${escapeHtml(altText)}</td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

export function renderImageAddForm(options: {
  formId?: string;
  uploadMultiple?: boolean;
  uploadButtonLabel?: string;
} = {}): string {
  const formId = options.formId ?? 'image-add-form';
  const uploadMultiple = options.uploadMultiple ? ' multiple' : '';
  const uploadButtonLabel = options.uploadButtonLabel ?? 'Upload and insert';

  return `
    <form id="${escapeHtml(formId)}" class="space-y-4">
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block sm:col-span-2">
          <span class="label">Alt text</span>
          <input type="text" data-field="alt" class="input" placeholder="Optional — defaults to filename" />
        </label>
        <label class="block">
          <span class="label">Source label</span>
          <input type="text" data-field="source-label" class="input" placeholder="Optional" />
        </label>
        <label class="block">
          <span class="label">Source URL</span>
          <input type="url" data-field="source-url" class="input" placeholder="Optional" />
        </label>
      </div>
      <div class="image-add-source space-y-3">
        <label class="block">
          <span class="label">Import from URL</span>
          <div class="mt-1 flex flex-wrap gap-2">
            <input
              type="url"
              data-field="import-url"
              class="input min-w-0 flex-1"
              placeholder="https://example.com/file.png"
              autocomplete="off"
            />
            <button type="button" class="btn-secondary" data-action="import-url">${iconLabel('link', 'Import')}</button>
          </div>
        </label>
        <label class="block">
          <span class="label">Upload file</span>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <input type="file" data-field="file" accept="image/*,video/webm,video/mp4"${uploadMultiple} class="input file-input min-w-0 flex-1" />
            <button type="submit" class="btn-primary">${iconLabel('upload', uploadButtonLabel)}</button>
          </div>
        </label>
      </div>
      <p data-role="upload-status" class="text-sm text-muted"></p>
    </form>
  `;
}

export function renderImageEditPanel(entry: ImageLibraryEntry, embedCount: number): string {
  const statusClass = embedCount > 0 ? 'image-status-in-doc' : 'image-status-stored';
  const statusLabel =
    embedCount > 0
      ? `${embedCount} embed${embedCount === 1 ? '' : 's'} in content`
      : 'Not in content';

  return `
    <div class="image-library-detail panel mt-4" data-image-url="${escapeHtml(entry.url)}">
      <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 items-start gap-3">
          ${renderMediaThumb(entry.url, 'image-edit-preview')}
          <div class="min-w-0">
            <p class="label mb-1">Selected media</p>
            <p class="image-edit-filename truncate text-sm font-medium text-strong">${escapeHtml(entry.filename)}</p>
            <p class="image-edit-dimensions text-xs text-muted" data-role="image-dimensions">…</p>
          </div>
        </div>
        <span class="image-status-badge ${statusClass}">${statusLabel}</span>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block sm:col-span-2">
          <span class="label">Alt text</span>
          <input type="text" data-field="alt" class="input" value="${escapeHtml(entry.alt)}" />
        </label>
        <label class="block">
          <span class="label">Source label</span>
          <input type="text" data-field="source-label" class="input" value="${escapeHtml(entry.source?.label ?? '')}" placeholder="Optional" />
        </label>
        <label class="block">
          <span class="label">Source URL</span>
          <input type="url" data-field="source-url" class="input" value="${escapeHtml(entry.source?.url ?? '')}" placeholder="Optional" />
        </label>
      </div>
      <div class="image-edit-form-actions mt-4 flex flex-wrap gap-2">
        <button type="button" class="btn-secondary" data-action="insert-embed">${iconLabel('plus', 'Insert into content')}</button>
        ${
          embedCount > 0
            ? `<button type="button" class="btn-secondary" data-action="remove-embeds">${iconLabel('trash', 'Remove embeds')}</button>`
            : ''
        }
        <button type="button" class="btn-secondary" data-action="delete-upload">${iconLabel('trash', 'Delete from uploads')}</button>
      </div>
    </div>
  `;
}
