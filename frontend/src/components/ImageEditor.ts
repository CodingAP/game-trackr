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
import { buildImageSnippet, importImageSourceFromUrl } from '../markdown/images.js';
import { defaultMediaAlt } from '../markdown/media.js';
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
import {
  readMediaOptions,
  renderImageAddForm,
  renderImageEditPanel,
  renderImageTable,
} from './imageMediaUi.js';
import { renderListSearchBar, wireListSearch } from './listSearch.js';
import { readListScroll, restoreListScroll } from '../utils/scrollList.js';

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
  let selectedUrl: string | null = null;
  const formDrafts = new Map<string, ImageFormDraft>();
  const handlers: Array<{ element: Element; handler: (event: Event) => void }> = [];

  container.innerHTML = `
    ${
      slug
        ? ''
        : '<p class="text-muted text-sm mb-4">Save the game before uploading media.</p>'
    }
    <div class="image-library-layout">
      <section class="image-insert-picker" aria-label="Media library">
        <p class="label mb-2">Media library</p>
        ${renderListSearchBar({ id: 'image-search', placeholder: 'Search media...', className: 'mb-3' })}
        <div data-image-table-host class="image-picker-list"></div>
      </section>
      <section class="image-insert-upload" aria-label="Add new media">
        <p class="label mb-2">Add new media</p>
        ${slug ? renderImageAddForm({ formId: 'image-add-form', uploadMultiple: true, uploadButtonLabel: 'Upload' }) : '<p class="text-muted text-sm">Save the game before uploading media.</p>'}
      </section>
      <div data-image-detail-host class="image-library-detail-row"></div>
    </div>
  `;

  const tableHost = container.querySelector('[data-image-table-host]') as HTMLElement;
  const detailHost = container.querySelector('[data-image-detail-host]') as HTMLElement;
  const addForm = container.querySelector('#image-add-form') as HTMLFormElement | null;
  const uploadStatus = container.querySelector('[data-role="upload-status"]') as HTMLElement | null;
  const importUrlInput = container.querySelector('[data-field="import-url"]') as HTMLInputElement | null;
  const listSearch = wireListSearch(container, {
    itemSelector: '[data-search-text]',
  });

  const clearHandlers = () => {
    handlers.forEach(({ element, handler }) => {
      element.removeEventListener('click', handler);
    });
    handlers.length = 0;
  };

  const captureFormDraftsFromDom = () => {
    detailHost.querySelectorAll('[data-image-url]').forEach((card) => {
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
    if (!active) return false;
    return active.matches('[data-image-url] [data-field], #image-add-form [data-field]');
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
    journalContent.setAllContents(
      propagateImageMetadataInPages(journalContent.getAllContents(), url, {
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

  const onDetailInput = (event: Event) => {
    const target = event.target as HTMLElement;
    if (!target.matches('[data-field]')) return;

    const card = target.closest('[data-image-url]') as HTMLElement | null;
    if (!card) return;

    const url = card.dataset.imageUrl;
    if (url) formDrafts.set(url, captureImageFormDraft(card));
    scheduleCommit(card);
  };

  const onDetailFocusOut = (event: Event) => {
    const focusEvent = event as FocusEvent;
    const target = focusEvent.target as HTMLElement;
    if (!target.matches('[data-field]')) return;

    const related = focusEvent.relatedTarget as HTMLElement | null;
    if (related?.matches('[data-field]') && detailHost.contains(related)) return;

    const card = target.closest('[data-image-url]') as HTMLElement | null;
    if (card) flushCommit(card);
    scheduleRender();
  };

  detailHost.addEventListener('input', onDetailInput);
  detailHost.addEventListener('focusout', onDetailFocusOut);

  const wireImageDimensions = (root: HTMLElement) => {
    root.querySelectorAll('.image-picker-table-thumb, .image-edit-preview').forEach((thumb) => {
      const card = thumb.closest('[data-image-url]') as HTMLElement | null;
      const dimensionsEl = card?.querySelector('[data-role="image-dimensions"]') as HTMLElement | null;
      if (!dimensionsEl) return;

      if (thumb instanceof HTMLVideoElement) {
        const update = () => {
          dimensionsEl.textContent =
            thumb.videoWidth > 0 && thumb.videoHeight > 0
              ? `${thumb.videoWidth} × ${thumb.videoHeight} px`
              : 'Dimensions unavailable';
        };
        thumb.addEventListener('loadedmetadata', update, { once: true });
        thumb.addEventListener(
          'error',
          () => {
            dimensionsEl.textContent = 'Dimensions unavailable';
          },
          { once: true },
        );
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
      img.addEventListener(
        'error',
        () => {
          dimensionsEl.textContent = 'Dimensions unavailable';
        },
        { once: true },
      );
    });
  };

  const render = () => {
    captureFormDraftsFromDom();
    clearHandlers();

    const allContents = journalContent.getAllContents();
    imageLibrary = mergeLibraryWithUploads(uploadedImages, imageLibrary, allContents);
    const entries = imageLibrary.images.map(applyDraftToEntry);

    if (selectedUrl && !entries.some((entry) => entry.url === selectedUrl)) {
      selectedUrl = null;
    }

    const listScrollTop = readListScroll(tableHost);

    tableHost.innerHTML = renderImageTable(uploadedImages, imageLibrary, {
      emptyMessage: 'No uploaded media yet. Add one on the right.',
      rowAction: 'select-image',
      selectedUrl,
    });

    if (selectedUrl) {
      const entry = entries.find((item) => item.url === selectedUrl);
      if (entry) {
        detailHost.innerHTML = renderImageEditPanel(
          entry,
          countDocumentImagesByUrl(allContents, entry.url),
        );
        wireImageDimensions(detailHost);
      } else {
        detailHost.innerHTML = '';
      }
    } else {
      detailHost.innerHTML = '';
    }

    tableHost.querySelectorAll('[data-action="select-image"]').forEach((row) => {
      const element = row as HTMLElement;
      const handler = () => {
        const url = element.dataset.imageUrl;
        if (!url) return;
        selectedUrl = selectedUrl === url ? null : url;
        render();
      };
      element.addEventListener('click', handler);
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handler();
        }
      });
      handlers.push({ element, handler });
    });

    detailHost.querySelectorAll('[data-action]').forEach((button) => {
      const handler = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();

        const card = (event.currentTarget as HTMLElement).closest('[data-image-url]') as HTMLElement;
        const url = card?.dataset.imageUrl;
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
    restoreListScroll(tableHost, listScrollTop);
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

    if (uploadStatus) uploadStatus.textContent = 'Deleting media...';

    try {
      await deleteGameImage(slug, filename);

      if (embedCount > 0) {
        journalContent.setAllContents(
          removeAllDocumentImagesByUrl(journalContent.getAllContents(), url),
        );
      }

      imageLibrary = removeLibraryEntry(imageLibrary, url);
      formDrafts.delete(url);
      if (selectedUrl === url) selectedUrl = null;
      if (uploadStatus) uploadStatus.textContent = `Deleted ${filename}.`;
      await refreshUploaded();
    } catch (error) {
      if (error instanceof AuthRequiredError && (await requireAuth())) {
        await handleDeleteUpload(url, filename, embedCount);
        return;
      }
      if (uploadStatus) {
        uploadStatus.textContent = error instanceof Error ? error.message : 'Delete failed';
      }
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

  const handleUpload = async () => {
    if (!addForm || !uploadStatus) return;

    const fileInput = addForm.querySelector('[data-field="file"]') as HTMLInputElement;
    const files = fileInput.files;
    if (!files || files.length === 0) {
      uploadStatus.textContent = 'Choose one or more media files to upload.';
      fileInput.focus();
      return;
    }

    const mediaOptions = readMediaOptions(addForm);
    uploadStatus.textContent = `Uploading ${files.length} file${files.length === 1 ? '' : 's'}...`;

    try {
      for (const file of files) {
        const uploaded = await uploadGameImage(slug, file);
        imageLibrary = upsertLibraryEntry(imageLibrary, {
          url: uploaded.url,
          filename: uploaded.filename,
          alt: mediaOptions.alt || defaultMediaAlt(uploaded.filename),
          source: mediaOptions.source,
        });
      }
      fileInput.value = '';
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

  const handleImportFromUrl = async () => {
    if (!addForm || !uploadStatus || !importUrlInput) return;

    const remoteUrl = importUrlInput.value.trim();
    if (!remoteUrl) {
      uploadStatus.textContent = 'Enter a media URL to import.';
      importUrlInput.focus();
      return;
    }

    uploadStatus.textContent = 'Downloading media...';

    try {
      const uploaded = await uploadGameImageFromUrl(slug, remoteUrl);
      const mediaOptions = readMediaOptions(addForm);
      imageLibrary = upsertLibraryEntry(imageLibrary, {
        url: uploaded.url,
        filename: uploaded.filename,
        alt: mediaOptions.alt || defaultMediaAlt(uploaded.filename),
        source: mediaOptions.source ?? importImageSourceFromUrl(remoteUrl),
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

  addForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleUpload();
  });

  container.querySelector('[data-action="import-url"]')?.addEventListener('click', () => {
    void handleImportFromUrl();
  });

  importUrlInput?.addEventListener('keydown', (event) => {
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
      detailHost.removeEventListener('input', onDetailInput);
      detailHost.removeEventListener('focusout', onDetailFocusOut);
      listSearch.cleanup();
      unsubscribe();
      clearHandlers();
    },
    refreshUploaded,
  };
}
