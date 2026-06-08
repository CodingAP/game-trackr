import { AuthRequiredError, fetchGameImages, uploadGameImage, uploadGameImageFromUrl } from '../api/client.js';
import { buildImageSnippet } from '../markdown/images.js';
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
  const widthInput = form.querySelector('[data-field="width"]') as HTMLInputElement | null;
  const heightInput = form.querySelector('[data-field="height"]') as HTMLInputElement | null;
  const scaleInput = form.querySelector('[data-field="scale"]') as HTMLInputElement | null;
  const sourceLabelInput = form.querySelector('[data-field="source-label"]') as HTMLInputElement | null;
  const sourceUrlInput = form.querySelector('[data-field="source-url"]') as HTMLInputElement | null;

  const width = Number(widthInput?.value);
  const height = Number(heightInput?.value);
  const hasViewport = Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
  const sourceLabel = sourceLabelInput?.value.trim();
  const sourceUrl = sourceUrlInput?.value.trim();

  return {
    alt: altInput?.value.trim(),
    viewport: hasViewport
      ? { width, height, scaleToFit: scaleInput?.checked ?? false }
      : undefined,
    source: sourceLabel && sourceUrl ? { label: sourceLabel, url: sourceUrl } : undefined,
  };
}

function buildSnippetForImage(
  image: UploadedImage,
  options: ReturnType<typeof readUploadOptions>,
): string {
  return buildImageSnippet({
    alt: options.alt || image.filename,
    url: image.url,
    viewport: options.viewport,
    source: options.source,
  }).trim();
}

function renderImageGrid(images: UploadedImage[]): string {
  if (images.length === 0) {
    return '<p class="text-muted text-sm">No uploaded images yet. Upload one below.</p>';
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
              <img src="${escapeHtml(image.url)}" alt="" class="image-picker-thumb" />
              <span class="image-picker-label">${escapeHtml(image.filename)}</span>
            </button>
          `,
        )
        .join('')}
    </div>
  `;
}

export async function openImageInsertDialog(options: {
  slug: string;
  onInsert: (snippet: string) => void;
  onImagesChanged?: () => void;
}): Promise<void> {
  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay image-insert-overlay';
  overlay.innerHTML = `
    <div class="auth-dialog image-insert-dialog panel" role="dialog" aria-modal="true" aria-labelledby="image-insert-title">
      <div class="image-insert-header">
        <h2 id="image-insert-title" class="auth-dialog-title">Insert image</h2>
        <button type="button" class="image-insert-close" data-action="close" aria-label="Close">${icon('close', 'ui-icon ui-icon-md')}</button>
      </div>
      <div class="image-insert-body">
        <section class="image-insert-picker" aria-label="Choose uploaded image">
          <p class="label mb-2">Choose image</p>
          ${renderListSearchBar({ id: 'image-insert-search', placeholder: 'Search images...', className: 'mb-3' })}
          <div id="image-picker-list" class="image-picker-list">
            <p class="text-muted text-sm">Loading images...</p>
          </div>
        </section>
        <section class="image-insert-upload" aria-label="Upload new image">
          <p class="label mb-2">Upload new image</p>
          <div class="image-import-url mb-3">
            <span class="label">Import from URL</span>
            <div class="flex flex-wrap gap-2 mt-1">
              <input
                type="url"
                data-field="import-url"
                class="input min-w-[12rem] flex-1"
                placeholder="https://example.com/image.png"
                autocomplete="off"
              />
              <button type="button" class="btn-secondary" data-action="import-url">${iconLabel('link', 'Import')}</button>
            </div>
            <p class="hint mt-1">Downloads the image to your journal after verifying it is a real image file.</p>
          </div>
          <form id="image-upload-form" class="space-y-3">
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="block sm:col-span-2">
                <span class="label">Alt text</span>
                <input type="text" data-field="alt" class="input" placeholder="Optional — defaults to filename" />
              </label>
              <label class="block">
                <span class="label">Viewport width (px)</span>
                <input type="number" data-field="width" class="input" min="1" step="1" placeholder="Optional" />
              </label>
              <label class="block">
                <span class="label">Viewport height (px)</span>
                <input type="number" data-field="height" class="input" min="1" step="1" placeholder="Optional" />
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
            <label class="settings-check">
              <input type="checkbox" data-field="scale" />
              <span>Scale to fit viewport</span>
            </label>
            <div class="flex flex-wrap items-center gap-3">
              <input type="file" data-field="file" accept="image/*" class="input file-input" />
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
  const fileInput = overlay.querySelector('[data-field="file"]') as HTMLInputElement;
  const importUrlInput = overlay.querySelector('[data-field="import-url"]') as HTMLInputElement;
  let images: UploadedImage[] = [];
  const listSearch = wireListSearch(dialog);

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
        const filename = (button as HTMLElement).dataset.imageFilename ?? 'image';
        if (!url) return;

        const image = images.find((entry) => entry.url === url) ?? {
          url,
          filename,
        };
        insertSnippet(buildSnippetForImage(image, readUploadOptions(form)));
      });
    });
  };

  const loadImages = async () => {
    try {
      images = await fetchGameImages(options.slug);
      renderList();
    } catch (error) {
      listHost.innerHTML = `<p class="text-sm text-red-400">${escapeHtml(error instanceof Error ? error.message : 'Failed to load images')}</p>`;
    }
  };

  overlay.querySelector('[data-action="close"]')?.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  const handleImportFromUrl = async () => {
    const remoteUrl = importUrlInput.value.trim();
    if (!remoteUrl) {
      statusEl.textContent = 'Enter an image URL to import.';
      importUrlInput.focus();
      return;
    }

    statusEl.textContent = 'Downloading image...';

    try {
      const uploaded = await uploadGameImageFromUrl(options.slug, remoteUrl);
      const uploadOptions = readUploadOptions(form);
      const snippet = buildSnippetForImage(uploaded, {
        ...uploadOptions,
        alt: uploadOptions.alt || uploaded.filename,
        source: uploadOptions.source ?? { label: 'Source', url: remoteUrl },
      });
      await loadImages();
      options.onImagesChanged?.();
      insertSnippet(snippet);
    } catch (error) {
      if (error instanceof AuthRequiredError && (await requireAuth())) {
        await handleImportFromUrl();
        return;
      }
      statusEl.textContent = error instanceof Error ? error.message : 'Import failed';
    }
  };

  overlay.querySelector('[data-action="import-url"]')?.addEventListener('click', () => {
    void handleImportFromUrl();
  });

  importUrlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleImportFromUrl();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = fileInput.files?.[0];
    if (!file) {
      statusEl.textContent = 'Choose an image file to upload.';
      fileInput.focus();
      return;
    }

    statusEl.textContent = 'Uploading...';

    try {
      const uploaded = await uploadGameImage(options.slug, file);
      const snippet = buildSnippetForImage(uploaded, {
        ...readUploadOptions(form),
        alt: readUploadOptions(form).alt || file.name,
      });
      await loadImages();
      options.onImagesChanged?.();
      insertSnippet(snippet);
    } catch (error) {
      if (error instanceof AuthRequiredError && (await requireAuth())) {
        form.requestSubmit();
        return;
      }
      statusEl.textContent = error instanceof Error ? error.message : 'Upload failed';
    }
  });

  document.addEventListener('keydown', onKeyDown);
  document.body.appendChild(overlay);
  await loadImages();
  importUrlInput.focus();
}

export function openImageInsertDialogOrWarn(options: {
  slug?: string;
  onInsert: (snippet: string) => void;
  onImagesChanged?: () => void;
}): void {
  if (!options.slug) {
    window.alert('Save the game first before adding images.');
    return;
  }

  void openImageInsertDialog({
    slug: options.slug,
    onInsert: options.onInsert,
    onImagesChanged: options.onImagesChanged,
  });
}
