import { fetchGameImages } from '../api/client.js';
import { renderCollapsiblePanel, wireCollapsiblePanels } from './CollapsiblePanel.js';
import {
  findDocumentImageByUrl,
  readImageFormOptions,
  removeDocumentImage,
  upsertDocumentImage,
  type DocumentImage,
} from '../markdown/imageDocument.js';
import type { UploadedImage } from '../types/index.js';
import type { MarkdownEditorHandle } from '../types/markdownEditor.js';
import type { ImageSourceLink, ParsedViewport } from '../markdown/images.js';

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

  const body = `
    <div class="flex flex-wrap gap-4">
      <img src="${escapeHtml(image.url)}" alt="" class="image-edit-preview" />
      <div class="min-w-0 flex-1 space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <p class="text-xs text-faint truncate min-w-0 flex-1">${escapeHtml(image.url)}</p>
          <span class="image-status-badge ${statusClass}">${statusLabel}</span>
        </div>
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
            ${inDocument ? 'Update in document' : 'Insert into document'}
          </button>
          ${
            inDocument
              ? '<button type="button" class="btn-secondary" data-action="remove-from-doc">Remove from document</button>'
              : ''
          }
        </div>
      </div>
    </div>
  `;

  return renderCollapsiblePanel({
    title,
    className: 'image-edit-card',
    defaultOpen,
    attributes: { 'image-url': image.url },
    content: body,
  });
}

export function mountImageEditor(
  listHost: HTMLElement,
  editor: MarkdownEditorHandle,
  slug: string,
): { cleanup: () => void; refreshUploaded: () => Promise<void> } {
  let uploadedImages: UploadedImage[] = [];
  const collapsedImages = new Set<string>();
  const handlers: Array<{ element: Element; handler: (event: Event) => void }> = [];

  const clearHandlers = () => {
    handlers.forEach(({ element, handler }) => {
      element.removeEventListener('click', handler);
    });
    handlers.length = 0;
  };

  const scheduleRender = () => {
    queueMicrotask(() => render());
  };

  const render = () => {
    clearHandlers();

    const images = mergeUploadedWithDocument(uploadedImages, editor.getValue());

    if (images.length === 0) {
      listHost.innerHTML = '<p class="text-muted text-sm">No uploaded images yet.</p>';
      return;
    }

    listHost.innerHTML = images
      .map((image) => renderImageCard(image, !collapsedImages.has(image.url)))
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
          editor.setValue(removeDocumentImage(content, documentRef));
          scheduleRender();
          return;
        }

        const options = readImageFormOptions(card, url);
        editor.setValue(upsertDocumentImage(content, options));
        scheduleRender();
      };

      button.addEventListener('click', handler);
      handlers.push({ element: button, handler });
    });
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
      if (expanded) collapsedImages.delete(url);
      else collapsedImages.add(url);
    },
  });

  void refreshUploaded();

  return {
    cleanup: () => {
      cleanupCollapsible();
      unsubscribe();
      clearHandlers();
    },
    refreshUploaded,
  };
}
