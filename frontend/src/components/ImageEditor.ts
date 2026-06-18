import {
  AuthRequiredError,
  deleteGameImage,
  fetchGameImages,
  uploadGameImageFromUrl,
} from '../api/client.js';
import {
  countDocumentImagesByUrl,
  propagateImageMetadataInPages,
  removeAllDocumentImagesByUrl,
} from '../markdown/imageDocument.js';
import { importImageSourceFromUrl } from '../markdown/images.js';
import { parseBulkImageImport } from '../markdown/imageBulkImport.js';
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
import { openImageBulkImportDialog } from './ImageBulkImportDialog.js';
import { icon } from './icons.js';
import {
  renderImageAddForm,
  renderImageEditPanel,
  renderImageTable,
  wireImageAddForm,
} from './imageMediaUi.js';
import { renderEditorSplitLayout, resolveEditorUrlSelection, wireEditorItemTable, wireEditorItemTableRemove } from './editorLibraryUi.js';
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

function resolveBulkImageSource(
  importUrl: string,
  sourceLabel: string,
  sourceUrl: string,
): ImageSourceLink | undefined {
  const label = sourceLabel.trim();
  const source = sourceUrl.trim();
  if (label && source) return { label, url: source };
  if (source) return importImageSourceFromUrl(source);
  return importImageSourceFromUrl(importUrl);
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
  options: { onMediaChanged?: () => void } = {},
): {
  cleanup: () => void;
  refreshUploaded: () => Promise<void>;
  getData: () => ImageLibraryData;
} {
  let uploadedImages: UploadedImage[] = [];
  let imageLibrary = structuredClone(initialLibrary);
  let selectedUrl: string | null = null;
  let showAddPanel = false;
  const formDrafts = new Map<string, ImageFormDraft>();
  const handlers: Array<{ element: Element; handler: (event: Event) => void }> = [];

  container.innerHTML = `
    ${
      slug
        ? ''
        : '<p class="text-muted text-sm mb-4">Save the game before uploading media.</p>'
    }
    ${renderEditorSplitLayout({
      listTitle: 'Media library',
      listLabel: 'Media library',
      detailLabel: 'Media details',
      addAction: 'add-media',
      addLabel: 'Add media',
      listHeaderExtraHtml: slug
        ? `
          <button
            type="button"
            class="editor-split-add"
            data-action="bulk-import-images"
            aria-label="Bulk import media URLs"
          >
            ${icon('import', 'ui-icon ui-icon-sm')}
          </button>
        `
        : '',
      searchHtml: renderListSearchBar({
        id: 'image-search',
        placeholder: 'Search media...',
        className: 'mb-3',
      }),
    })}
  `;

  const tableHost = container.querySelector('[data-item-table-host]') as HTMLElement;
  const detailHost = container.querySelector('[data-item-detail-host]') as HTMLElement;
  detailHost.innerHTML = `
    <div data-image-add-panel class="image-library-detail panel hidden">
      ${
        slug
          ? renderImageAddForm({
              formId: 'image-tab-add-form',
              uploadMultiple: true,
              uploadButtonLabel: 'Upload',
            })
          : '<p class="text-muted text-sm">Save the game before uploading media.</p>'
      }
    </div>
    <div data-image-edit-host class="min-w-0"></div>
    <p data-image-detail-placeholder class="editor-split-detail-empty text-muted text-sm hidden"></p>
  `;

  const addPanel = detailHost.querySelector('[data-image-add-panel]') as HTMLElement;
  const editHost = detailHost.querySelector('[data-image-edit-host]') as HTMLElement;
  const detailPlaceholder = detailHost.querySelector('[data-image-detail-placeholder]') as HTMLElement;

  const listSearch = wireListSearch(container, {
    itemSelector: '[data-search-text]',
  });

  const syncLibraryFromUploads = () => {
    imageLibrary = mergeLibraryWithUploads(
      uploadedImages,
      imageLibrary,
      journalContent.getAllContents(),
    );
  };

  const upsertUploadedImage = (image: UploadedImage) => {
    if (uploadedImages.some((entry) => entry.url === image.url)) {
      uploadedImages = uploadedImages.map((entry) =>
        entry.url === image.url ? image : entry,
      );
      return;
    }
    uploadedImages = [...uploadedImages, image];
  };

  const scrollSelectedRowIntoView = () => {
    requestAnimationFrame(() => {
      tableHost.querySelector<HTMLElement>('tr.is-selected')?.scrollIntoView({ block: 'nearest' });
    });
  };

  const finishMediaAdd = (uploaded: UploadedImage) => {
    showAddPanel = false;
    selectedUrl = uploaded.url;
    listSearch.setQuery('');
    syncLibraryFromUploads();
    render();
    scrollSelectedRowIntoView();
    options.onMediaChanged?.();
  };

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
    if (!(active instanceof HTMLElement)) return false;
    if (active.closest('[data-image-add-form]')) return true;
    return active.matches('[data-image-url] [data-field]');
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
    if (target.closest('[data-image-add-form]')) return;

    const related = focusEvent.relatedTarget as HTMLElement | null;
    if (related && detailHost.contains(related)) return;

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
    syncLibraryFromUploads();
    const entries = imageLibrary.images.map(applyDraftToEntry);

    if (!showAddPanel) {
      selectedUrl = resolveEditorUrlSelection(entries, selectedUrl);
    }

    const listScrollTop = readListScroll(tableHost);

    tableHost.innerHTML = renderImageTable(uploadedImages, imageLibrary, {
      emptyMessage: 'No uploaded media yet. Click + to add one.',
      rowAction: 'select-image',
      selectedUrl: showAddPanel ? undefined : selectedUrl,
      showRemove: true,
    });

    if (showAddPanel) {
      addPanel.classList.remove('hidden');
      editHost.innerHTML = '';
      editHost.classList.add('hidden');
      detailPlaceholder.classList.add('hidden');
    } else if (selectedUrl) {
      const entry = entries.find((item) => item.url === selectedUrl);
      if (entry) {
        addPanel.classList.add('hidden');
        editHost.classList.remove('hidden');
        editHost.innerHTML = renderImageEditPanel(
          entry,
          countDocumentImagesByUrl(allContents, entry.url),
        );
        wireImageDimensions(editHost);
        detailPlaceholder.classList.add('hidden');
      } else {
        addPanel.classList.add('hidden');
        editHost.innerHTML = '';
        editHost.classList.add('hidden');
        detailPlaceholder.textContent = 'Select media from the list.';
        detailPlaceholder.classList.remove('hidden');
      }
    } else {
      addPanel.classList.add('hidden');
      editHost.innerHTML = '';
      editHost.classList.add('hidden');
      detailPlaceholder.textContent = 'No uploaded media yet. Click + to add one.';
      detailPlaceholder.classList.remove('hidden');
    }

    wireEditorItemTable(tableHost, {
      rowSelector: '[data-action="select-image"]',
      readKey: (row) => row.dataset.imageUrl,
      isSelected: (url) => url === selectedUrl,
      onSelect: (url) => {
        showAddPanel = false;
        selectedUrl = url;
        render();
      },
    });

    wireEditorItemTableRemove(tableHost, {
      buttonSelector: '[data-action="delete-upload"]',
      readKey: (button) => button.closest('tr')?.dataset.imageUrl,
      onRemove: (url) => {
        const image = uploadedImages.find((item) => item.url === url);
        if (!image) return;
        void handleDeleteUpload(
          url,
          image.filename,
          countDocumentImagesByUrl(journalContent.getAllContents(), url),
        );
      },
    });

    editHost.querySelectorAll('[data-image-url] [data-action]').forEach((button) => {
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
        }
      };

      button.addEventListener('click', handler);
      handlers.push({ element: button, handler });
    });

    listSearch.apply();
    restoreListScroll(tableHost, listScrollTop);
  };

  container.querySelector('[data-action="add-media"]')?.addEventListener('click', () => {
    showAddPanel = true;
    selectedUrl = null;
    render();
  });

  const handleDeleteUpload = async (url: string, filename: string, embedCount: number) => {
    const uploadStatus = addPanel.querySelector('[data-role="upload-status"]') as HTMLElement | null;
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
      showAddPanel = false;
      if (uploadStatus) uploadStatus.textContent = `Deleted ${filename}.`;
      await refreshUploaded();
      options.onMediaChanged?.();
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
      imageLibrary = { images: [] };
      selectedUrl = null;
      showAddPanel = true;
      render();
      return;
    }

    try {
      uploadedImages = await fetchGameImages(slug);
    } catch {
      // Keep the in-memory list when refresh fails so recent uploads still appear.
    }

    syncLibraryFromUploads();
    selectedUrl = resolveEditorUrlSelection(imageLibrary.images, selectedUrl);

    if (uploadedImages.length === 0) {
      showAddPanel = true;
    }

    render();
  };

  const onContentChange = () => scheduleRender();
  const unsubscribe = editor.onChange(onContentChange);

  let cleanupAddForm = () => {};
  if (slug) {
    const addFormRoot = addPanel.querySelector('[data-image-add-form]') as HTMLElement | null;
    const uploadStatus = addPanel.querySelector('[data-role="upload-status"]') as HTMLElement | null;
    if (addFormRoot && uploadStatus) {
      cleanupAddForm = wireImageAddForm({
        root: addFormRoot,
        statusEl: uploadStatus,
        slug,
        allowMultiple: true,
        onUpload: async ({ uploads, mediaOptions, remoteUrl }) => {
          for (const uploaded of uploads) {
            upsertUploadedImage(uploaded);
            imageLibrary = upsertLibraryEntry(imageLibrary, {
              url: uploaded.url,
              filename: uploaded.filename,
              alt: mediaOptions.alt || defaultMediaAlt(uploaded.filename),
              source:
                mediaOptions.source ??
                (remoteUrl ? importImageSourceFromUrl(remoteUrl) : undefined),
            });
          }

          const lastUploaded = uploads[uploads.length - 1];
          uploadStatus.textContent = remoteUrl
            ? 'Media imported from URL.'
            : uploads.length === 1
              ? 'Uploaded 1 file.'
              : `Uploaded ${uploads.length} files.`;
          finishMediaAdd(lastUploaded);
          await refreshUploaded();
        },
      });
    }
  }

  void refreshUploaded();

  const bulkImportImages = async (text: string): Promise<{ added: number; errors: string[] }> => {
    if (!slug) {
      return { added: 0, errors: ['Save the game before importing media.'] };
    }

    const parsed = parseBulkImageImport(text);
    const errors = parsed.errors.map(
      (error) => `Line ${error.lineNumber}: ${error.message}`,
    );
    let added = 0;
    let lastUploaded: UploadedImage | null = null;

    for (const row of parsed.rows) {
      try {
        const uploaded = await uploadGameImageFromUrl(slug, row.url);
        upsertUploadedImage(uploaded);
        imageLibrary = upsertLibraryEntry(imageLibrary, {
          url: uploaded.url,
          filename: uploaded.filename,
          alt: row.altText.trim() || defaultMediaAlt(uploaded.filename),
          source: resolveBulkImageSource(row.url, row.sourceLabel, row.sourceUrl),
        });
        added += 1;
        lastUploaded = uploaded;
      } catch (error) {
        if (error instanceof AuthRequiredError && (await requireAuth())) {
          try {
            const uploaded = await uploadGameImageFromUrl(slug, row.url);
            upsertUploadedImage(uploaded);
            imageLibrary = upsertLibraryEntry(imageLibrary, {
              url: uploaded.url,
              filename: uploaded.filename,
              alt: row.altText.trim() || defaultMediaAlt(uploaded.filename),
              source: resolveBulkImageSource(row.url, row.sourceLabel, row.sourceUrl),
            });
            added += 1;
            lastUploaded = uploaded;
            continue;
          } catch (retryError) {
            errors.push(
              `Line ${row.lineNumber}: ${retryError instanceof Error ? retryError.message : 'Import failed.'}`,
            );
            continue;
          }
        }
        errors.push(
          `Line ${row.lineNumber}: ${error instanceof Error ? error.message : 'Import failed.'}`,
        );
      }
    }

    if (added > 0) {
      showAddPanel = false;
      selectedUrl = lastUploaded?.url ?? selectedUrl;
      await refreshUploaded();
      if (lastUploaded) scrollSelectedRowIntoView();
      options.onMediaChanged?.();
    }

    return { added, errors };
  };

  container.querySelector('[data-action="bulk-import-images"]')?.addEventListener('click', () => {
    openImageBulkImportDialog({
      onImport: bulkImportImages,
    });
  });

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
      cleanupAddForm();
      listSearch.cleanup();
      unsubscribe();
      clearHandlers();
    },
    refreshUploaded,
  };
}
