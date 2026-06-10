import {
  AuthRequiredError,
  deleteGameImage,
  fetchGameImages,
  uploadGameImage,
  uploadGameImageFromUrl,
} from '../api/client.js';
import {
  countDocumentImagesByUrl,
  propagateImageMetadataInPages,
  removeAllDocumentImagesByUrl,
} from '../markdown/imageDocument.js';
import { buildImageSnippet } from '../markdown/images.js';
import { defaultMediaAlt, isVideoUrl } from '../markdown/media.js';
import {
  getLibraryEntry,
  mergeLibraryWithUploads,
  removeLibraryEntry,
  upsertLibraryEntry,
  type ImageLibraryData,
  type ImageLibraryEntry,
} from '../markdown/imageLibrary.js';
import type { UploadedImage } from '../types/index.js';
import type { MarkdownEditorHandle } from '../types/markdownEditor.js';
import type { ImageSourceLink } from '../markdown/images.js';
import { requireAuth } from './AuthPrompt.js';
import { renderCollapsiblePanel, wireCollapsiblePanels } from './CollapsiblePanel.js';
import { renderListSearchBar, wireListSearch } from './listSearch.js';
import { icon, iconLabel } from './icons.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

interface ImageFormDraft {
  alt: string;
  sourceLabel: string;
  sourceUrl: string;
}

function captureImageFormDraft(card: HTMLElement): ImageFormDraft {
  return {
    alt: (card.querySelector('[data-field="alt"]') as HTMLInputElement | null)?.value ?? '',
    sourceLabel:
      (card.querySelector('[data-field="source-label"]') as HTMLInputElement | null)?.value ?? '',
    sourceUrl:
      (card.querySelector('[data-field="source-url"]') as HTMLInputElement | null)?.value ?? '',
  };
}

function readImageLibraryForm(card: HTMLElement, entry: ImageLibraryEntry) {
  const draft = captureImageFormDraft(card);
  const sourceLabel = draft.sourceLabel.trim();
  const sourceUrl = draft.sourceUrl.trim();
  const source: ImageSourceLink | undefined =
    sourceLabel && sourceUrl ? { label: sourceLabel, url: sourceUrl } : undefined;

  return {
    ...entry,
    alt: draft.alt.trim() || defaultMediaAlt(entry.filename),
    source,
  };
}

function renderMediaThumb(url: string, className: string): string {
  if (isVideoUrl(url)) {
    return `<video src="${escapeHtml(url)}" class="${className}" muted playsinline preload="metadata"></video>`;
  }
  return `<img src="${escapeHtml(url)}" alt="" class="${className}" />`;
}

function renderImageCard(
  entry: ImageLibraryEntry,
  embedCount: number,
  defaultOpen: boolean,
): string {
  const statusClass = embedCount > 0 ? 'image-status-in-doc' : 'image-status-stored';
  const statusLabel =
    embedCount > 0
      ? `${embedCount} embed${embedCount === 1 ? '' : 's'} in content`
      : 'Not in content';
  const title = entry.alt.trim() || defaultMediaAlt(entry.filename);
  const titleHtml = `
    <span class="image-edit-card-title-wrap">
      ${renderMediaThumb(entry.url, 'image-edit-thumb')}
      <span class="image-edit-card-title-text">${escapeHtml(title)}</span>
      <span class="image-status-badge ${statusClass}">${statusLabel}</span>
    </span>
  `;

  const body = `
    <div class="min-w-0 space-y-3">
      <div class="image-edit-file-meta text-xs text-muted">
        <p class="image-edit-filename truncate font-medium text-strong">${escapeHtml(entry.filename)}</p>
        <p class="image-edit-dimensions" data-role="image-dimensions">…</p>
      </div>
      <p class="hint">Alt text and source are shared for this file. Set viewport per embed in the page editor.</p>
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
      <div class="image-edit-form-actions">
        <button type="button" class="btn-secondary" data-action="delete-upload">
          ${iconLabel('trash', 'Delete from uploads')}
        </button>
      </div>
    </div>
  `;

  const titleActions = `
    <button type="button" class="btn-secondary" data-action="insert-embed" aria-label="Insert into content">
      ${icon('plus', 'ui-icon ui-icon-sm')}
    </button>
    ${
      embedCount > 0
        ? `<button type="button" class="btn-secondary" data-action="remove-embeds" aria-label="Remove all embeds from content">${icon('trash', 'ui-icon ui-icon-sm')}</button>`
        : ''
    }
  `;

  return renderCollapsiblePanel({
    title,
    titleHtml,
    titleActions,
    className: 'image-edit-card',
    defaultOpen,
    attributes: {
      'image-url': entry.url,
      'search-text': `${title} ${entry.filename} ${entry.url} ${statusLabel}`,
    },
    content: body,
  });
}

export function mountImageEditor(
  container: HTMLElement,
  editor: MarkdownEditorHandle,
  slug: string,
  journalContent: {
    getAllContents: () => Record<string, string>;
    getActivePageId: () => string;
    setPageContent: (pageId: string, content: string) => void;
    setAllContents: (contents: Record<string, string>) => void;
  },
  initialLibrary: ImageLibraryData,
): {
  cleanup: () => void;
  refreshUploaded: () => Promise<void>;
  getData: () => ImageLibraryData;
} {
  let uploadedImages: UploadedImage[] = [];
  let imageLibrary = structuredClone(initialLibrary);
  const expandedImages = new Set<string>();
  const formDrafts = new Map<string, ImageFormDraft>();
  const handlers: Array<{ element: Element; handler: (event: Event) => void }> = [];

  container.innerHTML = `
    ${
      slug
        ? ''
        : '<p class="text-muted text-sm mb-4">Save the game before uploading media.</p>'
    }
    <div id="image-upload-panel" class="image-upload-section panel mb-4">
      <p class="label mb-2">Upload media</p>
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
        <p class="hint mt-1">Downloads the file to your journal after verifying it is a supported image or video.</p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <input
          type="file"
          id="image-upload-input"
          class="input file-input"
          accept="image/*,video/webm,video/mp4"
          multiple
        />
        <button type="button" class="btn-primary" data-action="upload-images">${iconLabel('upload', 'Upload')}</button>
      </div>
      <p id="image-upload-status" class="text-sm text-muted mt-2" aria-live="polite"></p>
    </div>
    ${renderListSearchBar({ id: 'image-search', placeholder: 'Search media...', className: 'mb-2' })}
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

  const applyDraftToEntry = (entry: ImageLibraryEntry): ImageLibraryEntry => {
    const draft = formDrafts.get(entry.url);
    if (!draft) return entry;

    const sourceLabel = draft.sourceLabel.trim();
    const sourceUrl = draft.sourceUrl.trim();
    return {
      ...entry,
      alt: draft.alt.trim() || defaultMediaAlt(entry.filename),
      source: sourceLabel && sourceUrl ? { label: sourceLabel, url: sourceUrl } : undefined,
    };
  };

  const isEditingImageField = (): boolean => {
    const active = document.activeElement;
    if (!active || !listHost.contains(active)) return false;
    return active.matches('[data-field]');
  };

  const scheduleRender = () => {
    queueMicrotask(() => {
      if (isEditingImageField()) return;
      render();
    });
  };

  const commitTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const commitImageEntry = (card: HTMLElement) => {
    const url = card.dataset.imageUrl;
    if (!url) return;

    const baseEntry = getLibraryEntry(imageLibrary, url);
    if (!baseEntry) return;

    const entry = readImageLibraryForm(card, baseEntry);
    imageLibrary = upsertLibraryEntry(imageLibrary, entry);
    const contents = journalContent.getAllContents();
    journalContent.setAllContents(
      propagateImageMetadataInPages(contents, url, {
        alt: entry.alt,
        source: entry.source,
      }),
    );
    formDrafts.delete(url);
  };

  const scheduleCommit = (card: HTMLElement) => {
    const url = card.dataset.imageUrl;
    if (!url) return;

    const existing = commitTimers.get(url);
    if (existing) clearTimeout(existing);

    commitTimers.set(
      url,
      setTimeout(() => {
        commitTimers.delete(url);
        commitImageEntry(card);
      }, 400),
    );
  };

  const flushCommit = (card: HTMLElement) => {
    const url = card.dataset.imageUrl;
    if (!url) return;

    const pending = commitTimers.get(url);
    if (!pending) return;

    clearTimeout(pending);
    commitTimers.delete(url);
    commitImageEntry(card);
  };

  const onListInput = (event: Event) => {
    const target = event.target as HTMLElement;
    if (!target.matches('[data-field]')) return;

    const card = target.closest('[data-image-url]') as HTMLElement | null;
    if (!card) return;

    const url = card.dataset.imageUrl;
    if (url) formDrafts.set(url, captureImageFormDraft(card));
    scheduleCommit(card);
  };

  const onListFocusOut = (event: Event) => {
    const focusEvent = event as FocusEvent;
    const target = focusEvent.target as HTMLElement;
    if (!target.matches('[data-field]')) return;

    const related = focusEvent.relatedTarget as HTMLElement | null;
    if (related?.matches('[data-field]') && listHost.contains(related)) return;

    const card = target.closest('[data-image-url]') as HTMLElement | null;
    if (card) flushCommit(card);
    scheduleRender();
  };

  listHost.addEventListener('input', onListInput);
  listHost.addEventListener('focusout', onListFocusOut);

  const wireImageDimensions = () => {
    listHost.querySelectorAll('.image-edit-thumb').forEach((thumb) => {
      const card = thumb.closest('[data-image-url]') as HTMLElement | null;
      const dimensionsEl = card?.querySelector('[data-role="image-dimensions"]') as HTMLElement | null;
      if (!card || !dimensionsEl) return;

      if (thumb instanceof HTMLVideoElement) {
        const update = () => {
          dimensionsEl.textContent =
            thumb.videoWidth > 0 && thumb.videoHeight > 0
              ? `${thumb.videoWidth} × ${thumb.videoHeight} px`
              : 'Dimensions unavailable';
        };
        thumb.addEventListener('loadedmetadata', update, { once: true });
        thumb.addEventListener('error', () => {
          dimensionsEl.textContent = 'Dimensions unavailable';
        }, { once: true });
        return;
      }

      const img = thumb as HTMLImageElement;
      const update = () => {
        dimensionsEl.textContent =
          img.naturalWidth > 0 && img.naturalHeight > 0
            ? `${img.naturalWidth} × ${img.naturalHeight} px`
            : 'Dimensions unavailable';
      };

      if (img.complete && img.naturalWidth > 0) {
        update();
        return;
      }

      img.addEventListener('load', update, { once: true });
      img.addEventListener('error', () => {
        dimensionsEl.textContent = 'Dimensions unavailable';
      }, { once: true });
    });
  };

  const render = () => {
    captureFormDraftsFromDom();
    clearHandlers();

    const allContents = journalContent.getAllContents();
    imageLibrary = mergeLibraryWithUploads(uploadedImages, imageLibrary, allContents);
    const entries = imageLibrary.images.map(applyDraftToEntry);

    if (entries.length === 0) {
      listHost.innerHTML = '<p class="text-muted text-sm">No uploaded media yet.</p>';
      listSearch.apply();
      return;
    }

    listHost.innerHTML = entries
      .map((entry) =>
        renderImageCard(
          entry,
          countDocumentImagesByUrl(allContents, entry.url),
          expandedImages.has(entry.url),
        ),
      )
      .join('');

    wireImageDimensions();

    listHost.querySelectorAll('[data-action]').forEach((button) => {
      const handler = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();

        const card = (event.currentTarget as HTMLElement).closest('[data-image-url]') as HTMLElement;
        const url = card.dataset.imageUrl;
        if (!url) return;

        const baseEntry = getLibraryEntry(imageLibrary, url);
        if (!baseEntry) return;

        const entry = readImageLibraryForm(card, baseEntry);
        const action = (event.currentTarget as HTMLElement).dataset.action;
        const contents = journalContent.getAllContents();

        if (action === 'remove-embeds') {
          const embedCount = countDocumentImagesByUrl(contents, url);
          const confirmed = window.confirm(
            `Remove all ${embedCount} embed${embedCount === 1 ? '' : 's'} of this file from every page?`,
          );
          if (!confirmed) return;

          journalContent.setAllContents(removeAllDocumentImagesByUrl(contents, url));
          scheduleRender();
          return;
        }

        if (action === 'insert-embed') {
          imageLibrary = upsertLibraryEntry(imageLibrary, entry);
          editor.insertLine(
            buildImageSnippet({
              alt: entry.alt,
              url: entry.url,
              source: entry.source,
            }).trim(),
          );
          formDrafts.delete(url);
          scheduleRender();
          return;
        }

        if (action === 'delete-upload') {
          void handleDeleteUpload(url, entry.filename, countDocumentImagesByUrl(contents, url));
        }
      };

      button.addEventListener('click', handler);
      handlers.push({ element: button, handler });
    });

    listSearch.apply();
  };

  const handleDeleteUpload = async (url: string, filename: string, embedCount: number) => {
    const embedMessage =
      embedCount > 0
        ? ` This will also remove ${embedCount} embed${embedCount === 1 ? '' : 's'} from your journal content.`
        : '';
    const confirmed = window.confirm(
      `Delete "${filename}" from uploads?${embedMessage} This cannot be undone.`,
    );
    if (!confirmed) return;

    uploadStatus.textContent = 'Deleting media...';

    try {
      await deleteGameImage(slug, filename);

      if (embedCount > 0) {
        journalContent.setAllContents(
          removeAllDocumentImagesByUrl(journalContent.getAllContents(), url),
        );
      }

      imageLibrary = removeLibraryEntry(imageLibrary, url);
      formDrafts.delete(url);
      expandedImages.delete(url);
      uploadStatus.textContent = `Deleted ${filename}.`;
      await refreshUploaded();
    } catch (error) {
      if (error instanceof AuthRequiredError && (await requireAuth())) {
        await handleDeleteUpload(url, filename, embedCount);
        return;
      }
      uploadStatus.textContent = error instanceof Error ? error.message : 'Delete failed';
    }
  };

  const refreshUploaded = async () => {
    if (!slug) {
      uploadedImages = [];
      scheduleRender();
      return;
    }

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
      uploadStatus.textContent = 'Choose one or more media files to upload.';
      return;
    }

    uploadStatus.textContent = `Uploading ${files.length} file${files.length === 1 ? '' : 's'}...`;

    try {
      for (const file of files) {
        const uploaded = await uploadGameImage(slug, file);
        imageLibrary = upsertLibraryEntry(imageLibrary, {
          url: uploaded.url,
          filename: uploaded.filename,
          alt: defaultMediaAlt(uploaded.filename),
        });
      }
      uploadInput.value = '';
      uploadStatus.textContent =
        files.length === 1 ? 'Uploaded 1 file.' : `Uploaded ${files.length} files.`;
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
      uploadStatus.textContent = 'Enter a media URL to import.';
      importUrlInput.focus();
      return;
    }

    uploadStatus.textContent = 'Downloading media...';

    try {
      const uploaded = await uploadGameImageFromUrl(slug, remoteUrl);
      imageLibrary = upsertLibraryEntry(imageLibrary, {
        url: uploaded.url,
        filename: uploaded.filename,
        alt: defaultMediaAlt(uploaded.filename),
      });
      importUrlInput.value = '';
      uploadStatus.textContent = 'Media imported from URL.';
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
    getData: () => {
      captureFormDraftsFromDom();
      return {
        images: imageLibrary.images.map((entry) => {
          const merged = applyDraftToEntry(entry);
          return {
            ...merged,
            alt: merged.alt.trim() || defaultMediaAlt(merged.filename),
          };
        }),
      };
    },
    cleanup: () => {
      for (const timer of commitTimers.values()) {
        clearTimeout(timer);
      }
      commitTimers.clear();
      listHost.removeEventListener('input', onListInput);
      listHost.removeEventListener('focusout', onListFocusOut);
      listSearch.cleanup();
      cleanupCollapsible();
      unsubscribe();
      clearHandlers();
    },
    refreshUploaded,
  };
}
