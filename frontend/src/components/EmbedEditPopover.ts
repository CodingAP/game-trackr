import { buildMapMarker, resolveMap } from '../markdown/gameMaps.js';
import { buildProgressBarMarker, resolveProgressBar } from '../markdown/completionProgress.js';
import { upsertProgressBarByName } from '../markdown/progressBars.js';
import {
  buildCheckboxLine,
  formatManagedCheckboxLabel,
  SLUG_ID_PATTERN,
  slugifyCheckboxId,
} from '../markdown/managedCheckboxes.js';
import {
  applyImageViewports,
  applyMediaViewports,
  buildImageSnippet,
  formatImageEmbedTitle,
  openImageInNewTab,
} from '../markdown/images.js';
import { isVideoUrl } from '../markdown/media.js';
import { getImageViewportSettings } from '../storage/settings.js';
import {
  readMediaNaturalAspectRatio,
  wireViewportAspectRatio,
} from '../utils/viewportAspectRatio.js';
import {
  parseImageEmbedRaw,
  readImageEmbedLayoutOptions,
} from '../markdown/imageDocument.js';
import { getLibraryEntry, type ImageLibraryData } from '../markdown/imageLibrary.js';
import type { EmbedApplyFn, EmbedEditTarget } from './markdownEmbedExtension.js';
import type { MarkdownEmbedContext } from './markdownEmbedExtension.js';
import type { ManagedCheckbox } from '../types/index.js';
import { renderListSearchBar, wireListSearch } from './listSearch.js';
import { readListScroll, restoreListScroll } from '../utils/scrollList.js';
import { icon, iconLabel } from './icons.js';

let mapPickerScrollTop = 0;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function positionPopover(popover: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const margin = 8;
  popover.style.position = 'fixed';
  popover.style.zIndex = '1200';
  popover.style.maxWidth = 'min(36rem, calc(100vw - 1.5rem))';

  const width = popover.offsetWidth || 360;
  let left = rect.left;
  if (left + width > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - width - margin);
  }
  popover.style.left = `${left}px`;

  const height = popover.offsetHeight || 320;
  const belowTop = rect.bottom + 6;
  const aboveTop = rect.top - height - 6;
  if (belowTop + height > window.innerHeight - margin && aboveTop >= margin) {
    popover.style.top = `${aboveTop}px`;
  } else {
    popover.style.top = `${belowTop}px`;
  }
}

function renderPickerList(
  items: Array<{ id: string; label: string; searchText: string; action: string }>,
  emptyMessage: string,
  selectedId?: string,
): string {
  if (items.length === 0) {
    return `<p class="text-muted text-sm">${escapeHtml(emptyMessage)}</p>`;
  }

  return `
    ${renderListSearchBar({ id: 'embed-edit-search', placeholder: 'Search...', className: 'mb-2' })}
    <div class="embed-edit-options">
      ${items
        .map(
          (item) => `
            <button
              type="button"
              class="embed-edit-option${item.id === selectedId ? ' is-selected' : ''}"
              data-action="${item.action}"
              data-item-id="${escapeHtml(item.id)}"
              data-search-text="${escapeHtml(item.searchText)}"
              aria-pressed="${item.id === selectedId ? 'true' : 'false'}"
            >
              ${escapeHtml(item.label)}
            </button>
          `,
        )
        .join('')}
    </div>
  `;
}

function renderEditCheckboxForm(target: EmbedEditTarget, context: MarkdownEmbedContext): string {
  const checkbox = context.checkboxes.find((entry) => entry.id === target.reference);
  const label = target.lineLabel ?? checkbox?.label ?? '';
  return `
    <div class="embed-edit-section">
      <p class="label mb-2">Edit this checkbox</p>
      <div class="embed-edit-form">
        <div class="embed-edit-form-fields embed-edit-form-fields-2">
          <label class="block min-w-0">
            <span class="label">Label</span>
            <input
              type="text"
              data-field="edit-checkbox-label"
              class="input"
              value="${escapeHtml(label)}"
              placeholder="e.g. Defeat the boss"
            />
          </label>
          <label class="block min-w-0">
            <span class="label">Checkbox id</span>
            <input
              type="text"
              data-field="edit-checkbox-id"
              class="input"
              value="${escapeHtml(target.reference)}"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            />
          </label>
        </div>
        <p class="hint">Lowercase letters, numbers, and hyphens only.</p>
        <p data-role="edit-checkbox-error" class="text-sm text-red-400 hidden"></p>
        <div class="embed-edit-form-actions">
          <button type="button" class="btn-primary" data-action="save-checkbox">${iconLabel('save', 'Apply')}</button>
        </div>
      </div>
    </div>
  `;
}

function renderProgressEditForm(reference: string): string {
  return `
    <div class="embed-edit-section space-y-3" data-progress-form>
      <label class="block">
        <span class="label">Progress bar name</span>
        <input
          type="text"
          data-field="progress-name"
          class="input"
          value="${escapeHtml(reference)}"
          placeholder="e.g. Complete World 1"
        />
      </label>
      <p class="hint">Changes apply when you leave the name field.</p>
    </div>
  `;
}

function renderImageMetadataForm(
  parsed: NonNullable<ReturnType<typeof parseImageEmbedRaw>>,
  library?: ImageLibraryData,
): string {
  const libraryEntry = library ? getLibraryEntry(library, parsed.url) : undefined;
  const displayAlt = libraryEntry?.alt ?? parsed.alt;
  const displaySource = libraryEntry?.source ?? parsed.source;
  const embedTitle = formatImageEmbedTitle({
    viewport: parsed.viewport,
    centered: parsed.centered,
  });
  const titleAttr = embedTitle ? ` title="${escapeHtml(embedTitle)}"` : '';
  const isVideo = isVideoUrl(parsed.url);
  const maintainAspectRatio =
    parsed.viewport?.maintainAspectRatio ?? getImageViewportSettings().maintainAspectRatio;
  const figureClass = isVideo
    ? `embed-edit-image-preview media-figure${parsed.centered ? ' media-figure-centered' : ''}`
    : `embed-edit-image-preview image-figure${parsed.centered ? ' image-figure-centered' : ''}`;
  const mediaPreview = isVideo
    ? `<video src="${escapeHtml(parsed.url)}" controls playsinline class="journal-image-clickable"${titleAttr}></video>`
    : `<img src="${escapeHtml(parsed.url)}" alt="${escapeHtml(displayAlt)}" class="journal-image-clickable"${titleAttr} />`;

  return `
    <div class="space-y-3" data-image-form>
      <input type="hidden" data-field="selected-url" value="${escapeHtml(parsed.url)}" />
      <figure
        class="${figureClass}"
        data-role="embed-image-preview"
        data-media-kind="${isVideo ? 'video' : 'image'}"
      >
        ${mediaPreview}
      </figure>
      <p class="text-sm">
        <span class="label">Alt text</span>
        <span class="text-strong" data-role="embed-image-alt">${escapeHtml(displayAlt)}</span>
      </p>
      ${
        displaySource
          ? `<p class="text-sm text-muted">Source: ${escapeHtml(displaySource.label)}</p>`
          : ''
      }
      <p class="hint">Edit alt text and source in the Media tab. Viewport is specific to this embed.</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">
          <span class="label">Viewport width (px)</span>
          <input type="number" data-field="width" class="input" min="1" step="1" value="${parsed.viewport?.width ?? ''}" placeholder="Optional" />
        </label>
        <label class="block">
          <span class="label">Viewport height (px)</span>
          <input type="number" data-field="height" class="input" min="1" step="1" value="${parsed.viewport?.height ?? ''}" placeholder="Optional" />
        </label>
      </div>
      <label class="settings-check">
        <input type="checkbox" data-field="scale" ${parsed.viewport?.scaleToFit ? 'checked' : ''} />
        <span>Scale to fit viewport</span>
      </label>
      <label class="settings-check">
        <input type="checkbox" data-field="maintain-aspect" ${maintainAspectRatio ? 'checked' : ''} />
        <span>Maintain aspect ratio</span>
      </label>
      <label class="settings-check">
        <input type="checkbox" data-field="center" ${parsed.centered ? 'checked' : ''} />
        <span>Center in journal</span>
      </label>
      <div class="flex flex-wrap gap-2 pt-1">
        <button type="button" class="btn-primary" data-action="apply-image">${iconLabel('save', 'Apply')}</button>
      </div>
    </div>
  `;
}

export function openEmbedEditPopover(options: {
  anchor: HTMLElement;
  target: EmbedEditTarget;
  context: MarkdownEmbedContext;
  imageLibrary?: ImageLibraryData;
  onApply: EmbedApplyFn;
  onRegisterCheckbox?: (checkbox: ManagedCheckbox) => void;
  onUpdateCheckbox?: (id: string, updates: { id?: string; label?: string }) => boolean;
  onRegisterProgressBar?: (bar: import('../types/index.js').ProgressBar) => void;
  onUpdateProgressBar?: (id: string, updates: { name: string }) => void;
  onContextChanged?: () => void;
}): () => void {
  const { anchor, target, context, onApply } = options;
  const popover = document.createElement('div');
  popover.className = 'embed-edit-popover panel';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-modal', 'true');

  let title = 'Edit embed';
  let body = '';

  if (target.kind === 'checkbox') {
    title = 'Edit checkbox';
    body = renderEditCheckboxForm(target, context);
  } else if (target.kind === 'progress') {
    title = 'Edit progress bar';
    const resolvedBar = resolveProgressBar(context.progressBars, target.reference);
    body = renderProgressEditForm(resolvedBar?.name ?? target.reference);
  } else if (target.kind === 'map') {
    title = 'Change map';
    const items = context.maps.map((map) => ({
      id: map.id,
      label: map.name.trim() || 'Untitled map',
      searchText: `${map.name} ${map.id}`,
      action: 'pick-map',
    }));
    const currentMap = resolveMap(context.maps, target.reference);
    body = renderPickerList(
      items,
      'No maps defined yet. Add them in the Maps tab.',
      currentMap?.id,
    );
  } else {
    title = 'Edit media';
    const parsed = parseImageEmbedRaw(target.raw) ?? {
      alt: 'image',
      url: target.reference,
    };
    body = renderImageMetadataForm(parsed, options.imageLibrary);
  }

  popover.innerHTML = `
    <div class="embed-edit-header">
      <h3 class="embed-edit-title">${escapeHtml(title)}</h3>
      <div class="embed-edit-header-actions">
        <button type="button" class="embed-edit-remove" data-action="remove" aria-label="Remove from page">
          ${icon('trash', 'ui-icon ui-icon-sm')}
        </button>
        <button type="button" class="embed-edit-close" data-action="close" aria-label="Close">${icon('close', 'ui-icon ui-icon-sm')}</button>
      </div>
    </div>
    <div class="embed-edit-body">${body}</div>
  `;

  document.body.appendChild(popover);
  positionPopover(popover, anchor);

  const listSearch = wireListSearch(popover, {
    itemSelector: '[data-search-text]',
  });
  let cleanupAspectRatio = () => {};
  let refreshAspectRatio = () => {};

  const close = () => {
    if (target.kind === 'progress') {
      applyProgressName();
    }
    if (target.kind === 'map') {
      mapPickerScrollTop = readListScroll(popover);
    }
    cleanupAspectRatio();
    listSearch.cleanup();
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('mousedown', onDocumentMouseDown);
    window.removeEventListener('resize', onReposition);
    popover.remove();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };

  const onDocumentMouseDown = (event: MouseEvent) => {
    const targetNode = event.target as Node;
    if (popover.contains(targetNode) || anchor.contains(targetNode)) return;
    close();
  };

  const onReposition = () => {
    positionPopover(popover, anchor);
  };

  const showCheckboxError = (message: string, role = 'checkbox-error') => {
    const errorEl = popover.querySelector(`[data-role="${role}"]`) as HTMLElement | null;
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  };

  const applyCheckboxLine = (id: string, label: string) => {
    const indent = target.lineIndent ?? '';
    const line = buildCheckboxLine(indent, id, label);
    if (target.lineFrom !== undefined && target.lineTo !== undefined) {
      onApply(line, { from: target.lineFrom, to: target.lineTo });
      return;
    }
    onApply(`[[cb:${id}]]`);
  };

  const wireCheckboxIdSuggestion = (
    labelField: string,
    idField: string,
    existingIds: Set<string>,
  ) => {
    const labelInput = popover.querySelector(`[data-field="${labelField}"]`) as HTMLInputElement | null;
    const idInput = popover.querySelector(`[data-field="${idField}"]`) as HTMLInputElement | null;
    if (!labelInput || !idInput) return;

    let idTouched = false;
    idInput.addEventListener('input', () => {
      idTouched = true;
    });
    labelInput.addEventListener('blur', () => {
      if (idTouched || idInput.value.trim()) return;
      const label = labelInput.value.trim();
      if (!label) return;
      idInput.value = slugifyCheckboxId(label, existingIds);
    });
  };

  popover.querySelector('[data-action="close"]')?.addEventListener('click', close);

  popover.querySelector('[data-action="remove"]')?.addEventListener('click', () => {
    const confirmed = window.confirm('Remove this embed from the page?');
    if (!confirmed) return;
    onApply('');
    close();
  });

  popover.querySelector('[data-action="save-checkbox"]')?.addEventListener('click', () => {
    const labelInput = popover.querySelector('[data-field="edit-checkbox-label"]') as HTMLInputElement | null;
    const idInput = popover.querySelector('[data-field="edit-checkbox-id"]') as HTMLInputElement | null;
    const label = labelInput?.value.trim() ?? '';
    const newId = idInput?.value.trim() ?? '';
    if (!label || !newId) return;

    if (!SLUG_ID_PATTERN.test(newId)) {
      showCheckboxError('Checkbox id must use lowercase letters, numbers, and hyphens.', 'edit-checkbox-error');
      idInput?.focus();
      return;
    }

    if (newId !== target.reference && context.checkboxes.some((checkbox) => checkbox.id === newId)) {
      showCheckboxError('That checkbox id is already in use.', 'edit-checkbox-error');
      idInput?.focus();
      return;
    }

    const existing = context.checkboxes.find((checkbox) => checkbox.id === target.reference);
    if (existing) {
      const updated = options.onUpdateCheckbox?.(target.reference, { id: newId, label });
      if (updated === false) {
        showCheckboxError('Could not update checkbox.', 'edit-checkbox-error');
        return;
      }
    } else {
      options.onRegisterCheckbox?.({
        id: newId,
        label,
        parentId: null,
        tagIds: [],
      });
    }

    applyCheckboxLine(newId, label);
    options.onContextChanged?.();
    close();
  });

  let linkedProgressBarId = resolveProgressBar(context.progressBars, target.reference)?.id ?? null;

  const applyProgressName = () => {
    if (target.kind !== 'progress') return;

    const nameInput = popover.querySelector('[data-field="progress-name"]') as HTMLInputElement | null;
    const trimmed = nameInput?.value.trim() ?? '';
    if (!trimmed) return;

    const bar = upsertProgressBarByName(trimmed, context.progressBars, linkedProgressBarId, {
      onRegister: (entry) => {
        linkedProgressBarId = entry.id;
        options.onRegisterProgressBar?.(entry);
      },
      onUpdate: options.onUpdateProgressBar,
    });
    if (!bar) return;

    linkedProgressBarId = bar.id;
    if (target.reference !== bar.id) {
      onApply(buildProgressBarMarker(bar));
    }

    options.onContextChanged?.();
  };

  popover.querySelector('[data-field="progress-name"]')?.addEventListener('blur', applyProgressName);

  popover.querySelectorAll('[data-action="pick-map"]').forEach((button) => {
    button.addEventListener('click', () => {
      const mapId = (button as HTMLElement).dataset.itemId;
      const map = context.maps.find((entry) => entry.id === mapId);
      if (!map) return;
      onApply(buildMapMarker(map));
      close();
    });
  });

  const applyImageForm = () => {
    const form = popover.querySelector('[data-image-form]') as HTMLElement | null;
    const urlInput = popover.querySelector('[data-field="selected-url"]') as HTMLInputElement | null;
    if (!form || !urlInput?.value) return;

    const url = urlInput.value;
    const libraryEntry = options.imageLibrary ? getLibraryEntry(options.imageLibrary, url) : undefined;
    const parsed = parseImageEmbedRaw(target.raw);
    const layout = readImageEmbedLayoutOptions(form);
    const snippet = buildImageSnippet({
      alt: libraryEntry?.alt ?? parsed?.alt ?? 'image',
      url,
      viewport: layout.viewport,
      centered: layout.centered,
      source: libraryEntry?.source ?? parsed?.source,
    }).trim();
    onApply(snippet);
    close();
  };

  popover.querySelector('[data-action="apply-image"]')?.addEventListener('click', applyImageForm);

  if (target.kind === 'image') {
    const preview = popover.querySelector('[data-role="embed-image-preview"]') as HTMLElement | null;
    const form = popover.querySelector('[data-image-form]') as HTMLElement | null;

    const aspectRatioControls = wireViewportAspectRatio(popover, {
      widthField: '[data-field="width"]',
      heightField: '[data-field="height"]',
      lockField: '[data-field="maintain-aspect"]',
      resolveAspectRatio: () => {
        const media = preview?.querySelector('img, video') as HTMLImageElement | HTMLVideoElement | null;
        return readMediaNaturalAspectRatio(media);
      },
    });
    cleanupAspectRatio = aspectRatioControls.cleanup;
    refreshAspectRatio = aspectRatioControls.refreshAspectRatio;

    const isVideoPreview = preview?.dataset.mediaKind === 'video';

    const refreshImagePreview = () => {
      if (!preview || !form) return;

      const layout = readImageEmbedLayoutOptions(form);
      const media = preview.querySelector('img, video') as HTMLImageElement | HTMLVideoElement | null;
      if (!media) return;

      const title = formatImageEmbedTitle({
        viewport: layout.viewport,
        centered: layout.centered,
      });
      if (title) {
        media.setAttribute('title', title);
      } else {
        media.removeAttribute('title');
      }

      if (isVideoPreview) {
        preview.classList.toggle('media-figure-centered', layout.centered);
        applyMediaViewports(preview, getImageViewportSettings());
      } else {
        preview.classList.toggle('image-figure-centered', layout.centered);
        applyImageViewports(preview, getImageViewportSettings());
      }
    };

    refreshImagePreview();

    preview?.querySelector('img, video')?.addEventListener('click', (event) => {
      event.preventDefault();
      const target = event.currentTarget as HTMLImageElement | HTMLVideoElement;
      const url = target instanceof HTMLVideoElement
        ? target.currentSrc || target.src
        : target.currentSrc || target.src;
      openImageInNewTab(url);
    });

    form?.querySelectorAll('[data-field="width"], [data-field="height"], [data-field="scale"], [data-field="center"], [data-field="maintain-aspect"]').forEach(
      (field) => {
        field.addEventListener('input', refreshImagePreview);
        field.addEventListener('change', refreshImagePreview);
      },
    );

    preview?.querySelector('img, video')?.addEventListener('load', () => {
      refreshAspectRatio();
      refreshImagePreview();
    });
    preview?.querySelector('video')?.addEventListener('loadedmetadata', () => {
      refreshAspectRatio();
      refreshImagePreview();
    });
  }

  wireCheckboxIdSuggestion(
    'edit-checkbox-label',
    'edit-checkbox-id',
    new Set(context.checkboxes.map((checkbox) => checkbox.id)),
  );

  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onReposition);
  requestAnimationFrame(() => {
    document.addEventListener('mousedown', onDocumentMouseDown);
    if (target.kind === 'map') {
      restoreListScroll(popover, mapPickerScrollTop);
    }
  });

  return close;
}
