import { AuthRequiredError, fetchGameImages, uploadGameImage, uploadGameImageFromUrl } from '../api/client.js';
import { buildImageSnippet, importImageSourceFromUrl } from '../markdown/images.js';
import { isVideoUrl } from '../markdown/media.js';
import { getLibraryEntry, type ImageLibraryData } from '../markdown/imageLibrary.js';
import type { UploadedImage } from '../types/index.js';
import { requireAuth } from './AuthPrompt.js';
import { renderListSearchBar, wireListSearch } from './listSearch.js';
import { icon, iconLabel } from './icons.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function readUploadOptions(form: HTMLElement) {
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

function buildSnippetForImage(
  image: UploadedImage,
  options: ReturnType<typeof readUploadOptions>,
  library?: ImageLibraryData,
): string {
  const libraryEntry = library ? getLibraryEntry(library, image.url) : undefined;
  return buildImageSnippet({
    alt: libraryEntry?.alt ?? options.alt ?? image.filename,
    url: image.url,
    source: libraryEntry?.source ?? options.source,
  }).trim();
}

function renderMediaThumb(url: string, className: string): string {
  if (isVideoUrl(url)) {
    return `<video src="${escapeHtml(url)}" class="${className}" muted playsinline preload="metadata"></video>`;
  }
  return `<img src="${escapeHtml(url)}" alt="" class="${className}" />`;
}

function renderImageGrid(images: UploadedImage[]): string {
  if (images.length === 0) {
    return '<p class="text-muted text-sm">No uploaded media yet. Upload one below.</p>';
  }

  return `
    <div class="image-picker-grid">
      ${images
        .map(
          (image) => `
            <button
              type="button"
              class="image-picker-item"
              data-action="pick-image"
              data-image-url="${escapeHtml(image.url)}"
              data-image-filename="${escapeHtml(image.filename)}"
              data-search-text="${escapeHtml(`${image.filename} ${image.url}`)}"
              title="${escapeHtml(image.filename)}"
            >
              ${renderMediaThumb(image.url, 'image-picker-thumb')}
              <span class="image-picker-label">${escapeHtml(image.filename)}</span>
            </button>
          `,
        )
        .join('')}
    </div>
  `;
}

async function openImageInsertDialog(options: {
  slug: string;
  getImageLibrary?: () => ImageLibraryData;
  onInsert: (snippet: string) => void;
  onImagesChanged?: () => void;
}): Promise<void> {
  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay image-insert-overlay';
  overlay.innerHTML = `
    <div class="auth-dialog image-insert-dialog panel" role="dialog" aria-modal="true" aria-labelledby="image-insert-title">
      <div class="image-insert-header">
        <h2 id="image-insert-title" class="auth-dialog-title">Insert media</h2>
        <button type="button" class="image-insert-close" data-action="close" aria-label="Close">${icon('close', 'ui-icon ui-icon-md')}</button>
      </div>
      <div class="image-insert-body">
        <section class="image-insert-picker" aria-label="Choose uploaded media">
          <p class="label mb-2">Choose media</p>
          ${renderListSearchBar({ id: 'image-insert-search', placeholder: 'Search media...', className: 'mb-3' })}
          <div id="image-picker-list" class="image-picker-list">
            <p class="text-muted text-sm">Loading media...</p>
          </div>
        </section>
        <section class="image-insert-upload" aria-label="Upload new media">
          <p class="label mb-2">Upload new media</p>
          <div class="image-import-url mb-3">
            <span class="label">Import from URL</span>
            <div class="flex flex-wrap gap-2 mt-1">
              <input
                type="url"
                data-field="import-url"
                class="input min-w-[12rem] flex-1"
                placeholder="https://example.com/file.png"
                autocomplete="off"
              />
              <button type="button" class="btn-secondary" data-action="import-url">${iconLabel('link', 'Import')}</button>
            </div>
            <label class="block mt-2">
              <span class="label">Alt text</span>
              <input
                type="text"
                data-field="import-alt"
                class="input"
                placeholder="Optional — defaults to filename"
              />
            </label>
            <p class="hint mt-1">Downloads the file to your journal after verifying it is a supported image or video.</p>
          </div>
          <p class="hint mb-3">Set viewport per embed after inserting by clicking the media badge in the editor.</p>
          <form id="image-upload-form" class="space-y-3">
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
            <div class="flex flex-wrap items-center gap-3">
              <input type="file" data-field="file" accept="image/*,video/webm,video/mp4" class="input file-input" />
              <button type="submit" class="btn-primary">${iconLabel('upload', 'Upload and insert')}</button>
            </div>
            <p id="image-upload-status" class="text-sm text-muted"></p>
          </form>
        </section>
      </div>
    </div>
  `;

  const dialog = overlay.querySelector('.image-insert-dialog') as HTMLElement;
  const listHost = overlay.querySelector('#image-picker-list') as HTMLElement;
  const form = overlay.querySelector('#image-upload-form') as HTMLFormElement;
  const statusEl = overlay.querySelector('#image-upload-status') as HTMLElement;
  const importUrlInput = overlay.querySelector('[data-field="import-url"]') as HTMLInputElement;
  const importAltInput = overlay.querySelector('[data-field="import-alt"]') as HTMLInputElement;

  let images: UploadedImage[] = [];

  const close = () => {
    listSearch.cleanup();
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };

  const insertSnippet = (snippet: string) => {
    const prefix = snippet.startsWith('\n') ? '' : '\n';
    options.onInsert(`${prefix}${snippet}${snippet.endsWith('\n') ? '' : '\n'}`);
    close();
  };

  const renderList = () => {
    listHost.innerHTML = renderImageGrid(images);
    listSearch.apply();

    listHost.querySelectorAll('[data-action="pick-image"]').forEach((button) => {
      button.addEventListener('click', () => {
        const url = (button as HTMLElement).dataset.imageUrl;
        const filename = (button as HTMLElement).dataset.imageFilename ?? 'media';
        if (!url) return;

        const image = images.find((entry) => entry.url === url) ?? {
          url,
          filename,
        };
        insertSnippet(
          buildSnippetForImage(image, readUploadOptions(form), options.getImageLibrary?.()),
        );
      });
    });
  };

  const loadImages = async () => {
    try {
      images = await fetchGameImages(options.slug);
      renderList();
    } catch (error) {
      listHost.innerHTML = `<p class="text-sm text-red-400">${escapeHtml(error instanceof Error ? error.message : 'Failed to load media')}</p>`;
    }
  };

  overlay.querySelectorAll('[data-action="close"]').forEach((button) => {
    button.addEventListener('click', close);
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  overlay.querySelector('[data-action="import-url"]')?.addEventListener('click', async () => {
    const remoteUrl = importUrlInput?.value.trim();
    if (!remoteUrl) {
      statusEl.textContent = 'Enter a media URL to import.';
      importUrlInput?.focus();
      return;
    }

    statusEl.textContent = 'Downloading media...';

    try {
      const uploaded = await uploadGameImageFromUrl(options.slug, remoteUrl);
      const source = importImageSourceFromUrl(remoteUrl);
      const alt = importAltInput?.value.trim() || uploaded.filename;
      const snippet = buildSnippetForImage(uploaded, {
        alt,
        source,
      }, options.getImageLibrary?.());
      insertSnippet(snippet);
      await loadImages();
      options.onImagesChanged?.();
    } catch (error) {
      if (error instanceof AuthRequiredError && (await requireAuth())) {
        overlay.querySelector('[data-action="import-url"]')?.dispatchEvent(new Event('click'));
        return;
      }
      statusEl.textContent = error instanceof Error ? error.message : 'Import failed';
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fileInput = form.querySelector('[data-field="file"]') as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) {
      statusEl.textContent = 'Choose a media file to upload.';
      fileInput.focus();
      return;
    }

    statusEl.textContent = 'Uploading...';

    try {
      const uploaded = await uploadGameImage(options.slug, file);
      const snippet = buildSnippetForImage(uploaded, readUploadOptions(form), options.getImageLibrary?.());
      insertSnippet(snippet);
      await loadImages();
      options.onImagesChanged?.();
    } catch (error) {
      if (error instanceof AuthRequiredError && (await requireAuth())) {
        form.dispatchEvent(new Event('submit'));
        return;
      }
      statusEl.textContent = error instanceof Error ? error.message : 'Upload failed';
    }
  });

  const listSearch = wireListSearch(overlay, {
    itemSelector: '[data-search-text]',
  });

  document.addEventListener('keydown', onKeyDown);
  document.body.appendChild(overlay);
  importUrlInput?.focus();

  await loadImages();
}

export function openImageInsertDialogOrWarn(options: {
  slug: string | undefined;
  getImageLibrary?: () => ImageLibraryData;
  onInsert: (snippet: string) => void;
  onImagesChanged?: () => void;
}): void {
  if (!options.slug) {
    window.alert('Save the game first before adding media.');
    return;
  }

  void openImageInsertDialog({
    slug: options.slug,
    getImageLibrary: options.getImageLibrary,
    onInsert: options.onInsert,
    onImagesChanged: options.onImagesChanged,
  });
}
