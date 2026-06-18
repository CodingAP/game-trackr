import { fetchGameImages } from '../api/client.js';
import { buildImageSnippet, importImageSourceFromUrl } from '../markdown/images.js';
import { getLibraryEntry, type ImageLibraryData } from '../markdown/imageLibrary.js';
import type { UploadedImage } from '../types/index.js';
import { renderHelpButton, wireEditorTabHelp } from './editorTabHelp.js';
import {
  readMediaOptions,
  renderImageAddForm,
  renderImageTable,
  wireImageAddForm,
} from './imageMediaUi.js';
import { renderListSearchBar, wireListSearch } from './listSearch.js';
import { icon } from './icons.js';

const IMAGE_INSERT_HELP = `
  <p><strong>Adding media</strong> — Import a URL or upload a file on the right. Optional metadata fields apply to either method.</p>
  <p><strong>Optional metadata</strong> — Alt text defaults to the filename; source URL defaults to the import URL when importing.</p>
  <p><strong>Choosing media</strong> — Click a row in the table to insert an uploaded file using the alt text and source fields on the right.</p>
  <p><strong>Viewport</strong> — Set viewport per embed after inserting by clicking the media badge in the editor.</p>
`;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function buildSnippetForImage(
  image: UploadedImage,
  options: ReturnType<typeof readMediaOptions>,
  library?: ImageLibraryData,
  fallbackSource?: ReturnType<typeof importImageSourceFromUrl>,
): string {
  const libraryEntry = library ? getLibraryEntry(library, image.url) : undefined;
  return buildImageSnippet({
    alt: libraryEntry?.alt ?? options.alt ?? image.filename,
    url: image.url,
    source: libraryEntry?.source ?? options.source ?? fallbackSource,
  }).trim();
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
        <div class="image-insert-title-row">
          <h2 id="image-insert-title" class="auth-dialog-title">Insert media</h2>
          ${renderHelpButton(IMAGE_INSERT_HELP, 'Help for insert media')}
        </div>
        <button type="button" class="image-insert-close" data-action="close" aria-label="Close">${icon('close', 'ui-icon ui-icon-md')}</button>
      </div>
      <div class="image-insert-body">
        <section class="image-insert-picker" aria-label="Choose uploaded media">
          <p class="label mb-2">Choose media</p>
          ${renderListSearchBar({ id: 'image-insert-search', placeholder: 'Search media...', className: 'mb-3' })}
          <div id="image-picker-list" class="image-picker-list">
            <p class="text-muted text-sm px-3 py-4">Loading media...</p>
          </div>
        </section>
        <section class="image-insert-upload" aria-label="Add new media">
          ${renderImageAddForm({ formId: 'image-add-form' })}
        </section>
      </div>
    </div>
  `;

  const listHost = overlay.querySelector('#image-picker-list') as HTMLElement;
  const form = overlay.querySelector('[data-image-add-form]') as HTMLElement;
  const statusEl = overlay.querySelector('[data-role="upload-status"]') as HTMLElement;
  const importUrlInput = overlay.querySelector('[data-field="import-url"]') as HTMLInputElement;

  let images: UploadedImage[] = [];

  const close = () => {
    cleanupAddForm();
    listSearch.cleanup();
    cleanupHelp();
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

  const pickImage = (url: string, filename: string) => {
    const image = images.find((entry) => entry.url === url) ?? {
      url,
      filename,
    };
    insertSnippet(buildSnippetForImage(image, readMediaOptions(form), options.getImageLibrary?.()));
  };

  const renderList = () => {
    listHost.innerHTML = renderImageTable(images, options.getImageLibrary?.());
    listSearch.apply();

    listHost.querySelectorAll('[data-action="pick-image"]').forEach((row) => {
      const element = row as HTMLElement;
      const onPick = () => {
        const url = element.dataset.imageUrl;
        const filename = element.dataset.imageFilename ?? 'media';
        if (!url) return;
        pickImage(url, filename);
      };

      element.addEventListener('click', onPick);
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onPick();
        }
      });
    });
  };

  const loadImages = async () => {
    try {
      images = await fetchGameImages(options.slug);
      renderList();
    } catch (error) {
      listHost.innerHTML = `<p class="text-sm text-red-400 px-3 py-4">${escapeHtml(error instanceof Error ? error.message : 'Failed to load media')}</p>`;
    }
  };

  const cleanupAddForm = wireImageAddForm({
    root: form,
    statusEl,
    slug: options.slug,
    onUpload: async ({ uploads, mediaOptions, remoteUrl }) => {
      const uploaded = uploads[0];
      const snippet = buildSnippetForImage(
        uploaded,
        mediaOptions,
        options.getImageLibrary?.(),
        remoteUrl && !mediaOptions.source ? importImageSourceFromUrl(remoteUrl) : undefined,
      );
      insertSnippet(snippet);
      await loadImages();
      options.onImagesChanged?.();
    },
  });

  overlay.querySelectorAll('[data-action="close"]').forEach((button) => {
    button.addEventListener('click', close);
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  const listSearch = wireListSearch(overlay, {
    itemSelector: '[data-search-text]',
  });
  const cleanupHelp = wireEditorTabHelp(overlay);

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
