import { defaultMediaAlt, isVideoUrl } from '../markdown/media.js';
import { getLibraryEntry, type ImageLibraryData } from '../markdown/imageLibrary.js';
import type { ImageLibraryEntry, UploadedImage } from '../types/index.js';
import { icon, iconLabel } from './icons.js';
import { AuthRequiredError, uploadGameImage, uploadGameImageFromUrl } from '../api/client.js';
import { requireAuth } from './AuthPrompt.js';

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
    showRemove?: boolean;
    removeAction?: string;
  } = {},
): string {
  const emptyMessage = options.emptyMessage ?? 'No uploaded media yet. Add one on the right.';
  const rowAction = options.rowAction ?? 'pick-image';
  const showRemove = options.showRemove ?? false;
  const removeAction = options.removeAction ?? 'delete-upload';

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
            ${showRemove ? '<th scope="col" class="image-picker-table-actions" aria-label="Actions"></th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${images
            .map((image) => {
              const altText = resolveMediaAltText(image, library);
              const selected = options.selectedUrl === image.url;
              const rovingTabIndex = options.selectedUrl !== undefined;
              const tabIndex = rovingTabIndex ? (selected ? '0' : '-1') : '0';
              return `
                <tr
                  tabindex="${tabIndex}"
                  role="button"
                  class="${selected ? 'is-selected' : ''}"
                  data-action="${escapeHtml(rowAction)}"
                  data-image-url="${escapeHtml(image.url)}"
                  data-image-filename="${escapeHtml(image.filename)}"
                  data-search-text="${escapeHtml(`${altText} ${image.filename} ${image.url}`)}"
                  title="${escapeHtml(altText)}"
                  aria-selected="${selected ? 'true' : 'false'}"
                >
                  <td class="image-picker-table-preview">
                    ${renderMediaThumb(image.url, 'image-picker-table-thumb')}
                  </td>
                  <td class="image-picker-table-name">${escapeHtml(altText)}</td>
                  ${
                    showRemove
                      ? `
                        <td class="image-picker-table-actions">
                          <button
                            type="button"
                            class="editor-item-table-remove"
                            data-item-remove
                            data-action="${escapeHtml(removeAction)}"
                            aria-label="Delete ${escapeHtml(altText)}"
                            tabindex="${selected ? '0' : '-1'}"
                          >
                            ${icon('trash', 'ui-icon ui-icon-sm')}
                          </button>
                        </td>
                      `
                      : ''
                  }
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
    <div id="${escapeHtml(formId)}" class="media-add-form" data-image-add-form>
      <div class="media-add-sources mb-4">
        <label class="block mb-3">
          <span class="label">Import from URL</span>
          <div class="media-add-input-row">
            <input
              type="url"
              data-field="import-url"
              class="input"
              placeholder="https://example.com/file.png"
              autocomplete="off"
            />
            <button type="button" class="btn-secondary" data-action="import-url">${iconLabel('link', 'Import')}</button>
          </div>
        </label>
        <p class="media-add-or" aria-hidden="true"><span>or</span></p>
        <label class="block mb-3">
          <span class="label">Upload file</span>
          <div class="media-add-input-row">
            <input type="file" data-field="file" accept="image/*,video/webm,video/mp4"${uploadMultiple} class="input file-input" />
            <button type="button" class="btn-primary" data-action="upload-files">${iconLabel('upload', uploadButtonLabel)}</button>
          </div>
        </label>
      </div>
      <div class="media-add-metadata">
        <p class="label mb-3">Optional metadata</p>
        <label class="block mb-3">
          <span class="label">Alt text</span>
          <input type="text" data-field="alt" class="input" placeholder="Optional — defaults to filename" />
        </label>
        <label class="block mb-3">
          <span class="label">Source label</span>
          <input type="text" data-field="source-label" class="input" placeholder="Optional" />
        </label>
        <label class="block mb-3">
          <span class="label">Source URL</span>
          <input type="url" data-field="source-url" class="input" placeholder="Optional — defaults to import URL" />
        </label>
      </div>
      <p data-role="upload-status" class="text-sm text-muted"></p>
    </div>
  `;
}

export interface ImageAddFormUploadResult {
  uploads: UploadedImage[];
  mediaOptions: ReturnType<typeof readMediaOptions>;
  remoteUrl?: string;
}

export function wireImageAddForm(options: {
  root: HTMLElement;
  statusEl: HTMLElement;
  slug: string;
  allowMultiple?: boolean;
  onUpload: (result: ImageAddFormUploadResult) => void | Promise<void>;
}): () => void {
  const importUrlInput = options.root.querySelector('[data-field="import-url"]') as HTMLInputElement | null;
  const importButton = options.root.querySelector('[data-action="import-url"]');
  const uploadButton = options.root.querySelector('[data-action="upload-files"]');
  const fileInput = options.root.querySelector('[data-field="file"]') as HTMLInputElement;

  const handleImport = async () => {
    const remoteUrl = importUrlInput?.value.trim() ?? '';
    if (!remoteUrl) {
      options.statusEl.textContent = 'Enter a media URL to import.';
      importUrlInput?.focus();
      return;
    }

    options.statusEl.textContent = 'Downloading media...';

    try {
      const uploaded = await uploadGameImageFromUrl(options.slug, remoteUrl);
      const mediaOptions = readMediaOptions(options.root);
      await options.onUpload({
        uploads: [uploaded],
        mediaOptions,
        remoteUrl,
      });
      if (importUrlInput) importUrlInput.value = '';
    } catch (error) {
      if (error instanceof AuthRequiredError && (await requireAuth())) {
        await handleImport();
        return;
      }
      options.statusEl.textContent = error instanceof Error ? error.message : 'Import failed';
    }
  };

  const handleUpload = async () => {
    const files = options.allowMultiple
      ? [...(fileInput.files ?? [])]
      : fileInput.files?.[0]
        ? [fileInput.files[0]]
        : [];

    if (files.length === 0) {
      options.statusEl.textContent = options.allowMultiple
        ? 'Choose one or more media files to upload.'
        : 'Choose a media file to upload.';
      fileInput.focus();
      return;
    }

    options.statusEl.textContent =
      files.length === 1 ? 'Uploading...' : `Uploading ${files.length} files...`;

    try {
      const uploads: UploadedImage[] = [];
      for (const file of files) {
        uploads.push(await uploadGameImage(options.slug, file));
      }
      const mediaOptions = readMediaOptions(options.root);
      await options.onUpload({ uploads, mediaOptions });
      fileInput.value = '';
    } catch (error) {
      if (error instanceof AuthRequiredError && (await requireAuth())) {
        await handleUpload();
        return;
      }
      options.statusEl.textContent = error instanceof Error ? error.message : 'Upload failed';
    }
  };

  const onImportClick = () => {
    void handleImport();
  };

  const onUploadClick = () => {
    void handleUpload();
  };

  const onImportKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void handleImport();
  };

  const onRootKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-field="import-url"]')) return;
    event.preventDefault();
  };

  uploadButton?.addEventListener('click', onUploadClick);
  importButton?.addEventListener('click', onImportClick);
  importUrlInput?.addEventListener('keydown', onImportKeydown);
  options.root.addEventListener('keydown', onRootKeydown);

  return () => {
    uploadButton?.removeEventListener('click', onUploadClick);
    importButton?.removeEventListener('click', onImportClick);
    importUrlInput?.removeEventListener('keydown', onImportKeydown);
    options.root.removeEventListener('keydown', onRootKeydown);
  };
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
      <label class="block mb-3">
        <span class="label">Alt text</span>
        <input type="text" data-field="alt" class="input" value="${escapeHtml(entry.alt)}" />
      </label>
      <label class="block mb-3">
        <span class="label">Source label</span>
        <input type="text" data-field="source-label" class="input" value="${escapeHtml(entry.source?.label ?? '')}" placeholder="Optional" />
      </label>
      <label class="block mb-3">
        <span class="label">Source URL</span>
        <input type="url" data-field="source-url" class="input" value="${escapeHtml(entry.source?.url ?? '')}" placeholder="Optional" />
      </label>
      ${
        embedCount > 0
          ? `
            <div class="image-edit-form-actions mt-4 flex flex-wrap gap-2">
              <button type="button" class="btn-secondary" data-action="remove-embeds">${iconLabel('trash', 'Remove embeds')}</button>
            </div>
          `
          : ''
      }
    </div>
  `;
}
