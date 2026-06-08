import { AuthRequiredError, fetchGameImages, uploadGameImage, uploadGameImageFromUrl } from '../api/client.js';
import {
  findDocumentImageByUrl,
  readImageFormOptions,
  upsertDocumentImage,
  type DocumentImage,
} from '../markdown/imageDocument.js';
import { buildImageSnippet } from '../markdown/images.js';
import type { UploadedImage } from '../types/index.js';
import type { MarkdownEditorHandle } from '../types/markdownEditor.js';
import type { ImageSourceLink, ParsedViewport } from '../markdown/images.js';
import { requireAuth } from './AuthPrompt.js';
import { renderCollapsiblePanel, wireCollapsiblePanels } from './CollapsiblePanel.js';
import { renderListSearchBar, wireListSearch } from './listSearch.js';
import { iconLabel } from './icons.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

interface EditableImage extends UploadedImage {
  alt: string;
  viewport?: ParsedViewport;
  source?: ImageSourceLink;
  documentRef?: DocumentImage;
}

interface ImageFormDraft {
  alt: string;
  width: string;
  height: string;
  sourceLabel: string;
  sourceUrl: string;
  scale: boolean;
}

function captureImageFormDraft(card: HTMLElement): ImageFormDraft {
  return {
    alt: (card.querySelector('[data-field="alt"]') as HTMLInputElement | null)?.value ?? '',
    width: (card.querySelector('[data-field="width"]') as HTMLInputElement | null)?.value ?? '',
    height: (card.querySelector('[data-field="height"]') as HTMLInputElement | null)?.value ?? '',
    sourceLabel:
      (card.querySelector('[data-field="source-label"]') as HTMLInputElement | null)?.value ?? '',
    sourceUrl:
      (card.querySelector('[data-field="source-url"]') as HTMLInputElement | null)?.value ?? '',
    scale: (card.querySelector('[data-field="scale"]') as HTMLInputElement | null)?.checked ?? false,
  };
}

function applyImageFormDraft(image: EditableImage, draft: ImageFormDraft): EditableImage {
  const width = Number(draft.width);
  const height = Number(draft.height);
  const hasViewport = Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
  const sourceLabel = draft.sourceLabel.trim();
  const sourceUrl = draft.sourceUrl.trim();

  return {
    ...image,
    alt: draft.alt.trim() || image.filename,
    viewport: hasViewport ? { width, height, scaleToFit: draft.scale } : undefined,
    source: sourceLabel && sourceUrl ? { label: sourceLabel, url: sourceUrl } : undefined,
  };
}

function mergeUploadedWithDocument(
  uploaded: UploadedImage[],
  content: string,
): EditableImage[] {
  return uploaded.map((image) => {
    const documentRef = findDocumentImageByUrl(content, image.url);
    return {
      ...image,
      alt: documentRef?.alt ?? image.filename,
      viewport: documentRef?.viewport,
      source: documentRef?.source,
      documentRef,
    };
  });
}

function renderImageCard(image: EditableImage, defaultOpen: boolean): string {
  const inDocument = Boolean(image.documentRef);
  const statusClass = inDocument ? 'image-status-in-doc' : 'image-status-stored';
  const statusLabel = inDocument ? 'In document' : 'Uploaded only';
  const title = image.alt.trim() || image.filename;
  const titleHtml = `
    <span class="image-edit-card-title-wrap">
      <img src="${escapeHtml(image.url)}" alt="" class="image-edit-thumb" />
      <span class="image-edit-card-title-text">${escapeHtml(title)}</span>
      <span class="image-status-badge ${statusClass}">${statusLabel}</span>
    </span>
  `;

  const body = `
    <div class="min-w-0 space-y-3">
      <p class="text-xs text-faint truncate">${escapeHtml(image.url)}</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block sm:col-span-2">
            <span class="label">Alt text</span>
            <input type="text" data-field="alt" class="input" value="${escapeHtml(image.alt)}" />
          </label>
          <label class="block">
            <span class="label">Viewport width (px)</span>
            <input type="number" data-field="width" class="input" min="1" step="1" value="${image.viewport?.width ?? ''}" placeholder="Optional" />
          </label>
          <label class="block">
            <span class="label">Viewport height (px)</span>
            <input type="number" data-field="height" class="input" min="1" step="1" value="${image.viewport?.height ?? ''}" placeholder="Optional" />
          </label>
          <label class="block">
            <span class="label">Source label</span>
            <input type="text" data-field="source-label" class="input" value="${escapeHtml(image.source?.label ?? '')}" placeholder="Optional" />
          </label>
          <label class="block">
            <span class="label">Source URL</span>
            <input type="url" data-field="source-url" class="input" value="${escapeHtml(image.source?.url ?? '')}" placeholder="Optional" />
          </label>
        </div>
        <label class="settings-check">
          <input type="checkbox" data-field="scale" ${image.viewport?.scaleToFit ? 'checked' : ''} />
          <span>Scale to fit viewport</span>
        </label>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn-primary" data-action="update">
            ${iconLabel(inDocument ? 'save' : 'plus', inDocument ? 'Update in document' : 'Insert into document')}
          </button>
          ${
            inDocument
              ? `<button type="button" class="btn-secondary" data-action="remove-from-doc">${iconLabel('trash', 'Remove from document')}</button>`
              : ''
          }
        </div>
    </div>
  `;

  return renderCollapsiblePanel({
    title,
    titleHtml,
    className: 'image-edit-card',
    defaultOpen,
    attributes: {
      'image-url': image.url,
      'search-text': `${title} ${image.filename} ${image.url} ${statusLabel}`,
    },
    content: body,
  });
}

export function mountImageEditor(
  container: HTMLElement,
  editor: MarkdownEditorHandle,
  slug: string,
): { cleanup: () => void; refreshUploaded: () => Promise<void> } {
  let uploadedImages: UploadedImage[] = [];
  const expandedImages = new Set<string>();
  const formDrafts = new Map<string, ImageFormDraft>();
  const handlers: Array<{ element: Element; handler: (event: Event) => void }> = [];

  container.innerHTML = `
    <div id="image-upload-panel" class="image-upload-section panel mb-4">
      <p class="label mb-2">Upload images</p>
      <div class="image-import-url mb-3">
        <span class="label">Import from URL</span>
        <div class="flex flex-wrap gap-2 mt-1">
          <input
            type="url"
            id="image-import-url-input"
            class="input min-w-[12rem] flex-1"
            placeholder="https://example.com/image.png"
            autocomplete="off"
          />
          <button type="button" class="btn-secondary" data-action="import-url">${iconLabel('link', 'Import')}</button>
        </div>
        <p class="hint mt-1">Downloads the image to your journal after verifying it is a real image file.</p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <input
          type="file"
          id="image-upload-input"
          class="input file-input"
          accept="image/*"
          multiple
        />
        <button type="button" class="btn-primary" data-action="upload-images">${iconLabel('upload', 'Upload')}</button>
      </div>
      <p id="image-upload-status" class="text-sm text-muted mt-2" aria-live="polite"></p>
    </div>
    ${renderListSearchBar({ id: 'image-search', placeholder: 'Search images...', className: 'mb-2' })}
    <div data-image-list class="space-y-2"></div>
  `;

  const listHost = container.querySelector('[data-image-list]') as HTMLElement;
  const uploadInput = container.querySelector('#image-upload-input') as HTMLInputElement;
  const importUrlInput = container.querySelector('#image-import-url-input') as HTMLInputElement;
  const uploadStatus = container.querySelector('#image-upload-status') as HTMLElement;
  const uploadButton = container.querySelector('[data-action="upload-images"]') as HTMLButtonElement;
  const listSearch = wireListSearch(container, {
    itemSelector: '[data-image-url]',
  });

  const clearHandlers = () => {
    handlers.forEach(({ element, handler }) => {
      element.removeEventListener('click', handler);
    });
    handlers.length = 0;
  };

  const captureFormDraftsFromDom = () => {
    listHost.querySelectorAll('[data-image-url]').forEach((card) => {
      const url = (card as HTMLElement).dataset.imageUrl;
      if (!url) return;
      formDrafts.set(url, captureImageFormDraft(card as HTMLElement));
    });
  };

  const scheduleRender = () => {
    queueMicrotask(() => render());
  };

  const render = () => {
    captureFormDraftsFromDom();
    clearHandlers();

    const images = mergeUploadedWithDocument(uploadedImages, editor.getValue()).map((image) => {
      const draft = formDrafts.get(image.url);
      return draft ? applyImageFormDraft(image, draft) : image;
    });

    if (images.length === 0) {
      listHost.innerHTML = '<p class="text-muted text-sm">No uploaded images yet.</p>';
      listSearch.apply();
      return;
    }

    listHost.innerHTML = images
      .map((image) => renderImageCard(image, expandedImages.has(image.url)))
      .join('');

    listHost.querySelectorAll('[data-action]').forEach((button) => {
      const handler = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();

        const card = (event.currentTarget as HTMLElement).closest('[data-image-url]') as HTMLElement;
        const url = card.dataset.imageUrl;
        if (!url) return;

        const action = (event.currentTarget as HTMLElement).dataset.action;
        const content = editor.getValue();
        const documentRef = findDocumentImageByUrl(content, url);

        if (action === 'remove-from-doc') {
          if (!documentRef) {
            scheduleRender();
            return;
          }
          editor.applyChange({ from: documentRef.start, to: documentRef.end, insert: '' });
          scheduleRender();
          return;
        }

        const options = readImageFormOptions(card, url);
        const snippet = buildImageSnippet(options).trim();
        if (documentRef) {
          editor.applyChange({ from: documentRef.start, to: documentRef.end, insert: snippet });
        } else {
          editor.setValue(upsertDocumentImage(content, options));
        }
        formDrafts.delete(url);
        scheduleRender();
      };

      button.addEventListener('click', handler);
      handlers.push({ element: button, handler });
    });

    listSearch.apply();
  };

  const refreshUploaded = async () => {
    uploadedImages = await fetchGameImages(slug);
    scheduleRender();
  };

  const onContentChange = () => scheduleRender();
  const unsubscribe = editor.onChange(onContentChange);
  const cleanupCollapsible = wireCollapsiblePanels(listHost, {
    onToggle: (panel, expanded) => {
      const url = panel.dataset.imageUrl;
      if (!url) return;
      if (expanded) expandedImages.add(url);
      else expandedImages.delete(url);
    },
  });

  const handleUpload = async () => {
    const files = uploadInput.files;
    if (!files || files.length === 0) {
      uploadStatus.textContent = 'Choose one or more image files to upload.';
      return;
    }

    uploadStatus.textContent = `Uploading ${files.length} image${files.length === 1 ? '' : 's'}...`;

    try {
      for (const file of files) {
        await uploadGameImage(slug, file);
      }
      uploadInput.value = '';
      uploadStatus.textContent =
        files.length === 1 ? 'Uploaded 1 image.' : `Uploaded ${files.length} images.`;
      await refreshUploaded();
    } catch (error) {
      if (error instanceof AuthRequiredError && (await requireAuth())) {
        await handleUpload();
        return;
      }
      uploadStatus.textContent = error instanceof Error ? error.message : 'Upload failed';
    }
  };

  uploadButton.addEventListener('click', () => {
    void handleUpload();
  });

  const handleImportFromUrl = async () => {
    const remoteUrl = importUrlInput.value.trim();
    if (!remoteUrl) {
      uploadStatus.textContent = 'Enter an image URL to import.';
      importUrlInput.focus();
      return;
    }

    uploadStatus.textContent = 'Downloading image...';

    try {
      await uploadGameImageFromUrl(slug, remoteUrl);
      importUrlInput.value = '';
      uploadStatus.textContent = 'Image imported from URL.';
      await refreshUploaded();
    } catch (error) {
      if (error instanceof AuthRequiredError && (await requireAuth())) {
        await handleImportFromUrl();
        return;
      }
      uploadStatus.textContent = error instanceof Error ? error.message : 'Import failed';
    }
  };

  container.querySelector('[data-action="import-url"]')?.addEventListener('click', () => {
    void handleImportFromUrl();
  });

  importUrlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleImportFromUrl();
    }
  });

  void refreshUploaded();

  return {
    cleanup: () => {
      listSearch.cleanup();
      cleanupCollapsible();
      unsubscribe();
      clearHandlers();
    },
    refreshUploaded,
  };
}
