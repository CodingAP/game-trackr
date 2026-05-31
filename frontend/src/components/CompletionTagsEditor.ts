import { buildTagProgressMarker } from '../markdown/completionProgress.js';
import { renderCollapsiblePanel, wireCollapsiblePanels } from './CollapsiblePanel.js';
import { extractCheckboxes, formatCheckboxPathLabel } from '../markdown/checkboxes.js';
import type { CheckboxItem } from '../markdown/checkboxes.js';
import type { CompletionTag, CompletionTagsData } from '../types/index.js';
import type { MarkdownEditorHandle } from '../types/markdownEditor.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderPickerOptions(
  tag: CompletionTag,
  checkboxes: CheckboxItem[],
  query: string,
): string {
  const normalizedQuery = query.trim().toLowerCase();
  const options = checkboxes
    .filter((item) => !tag.checkboxIds.includes(item.id))
    .filter(
      (item) =>
        !normalizedQuery ||
        formatCheckboxPathLabel(item, checkboxes).toLowerCase().includes(normalizedQuery),
    );

  if (options.length === 0) {
    return `<p class="completion-picker-empty">${normalizedQuery ? 'No matching checkboxes' : 'All checkboxes are assigned to this tag'}</p>`;
  }

  return options
    .map(
      (item) => `
        <button
          type="button"
          class="completion-picker-option"
          data-action="add-checkbox"
          data-tag-id="${tag.id}"
          data-checkbox-id="${item.id}"
        >
          ${escapeHtml(formatCheckboxPathLabel(item, checkboxes))}
        </button>
      `,
    )
    .join('');
}

function renderCheckboxPicker(
  tag: CompletionTag,
  checkboxes: CheckboxItem[],
  query: string,
): string {
  const assigned = checkboxes.filter((item) => tag.checkboxIds.includes(item.id));
  const chips = assigned
    .map(
      (item) => `
        <span class="completion-chip">
          <span>${escapeHtml(formatCheckboxPathLabel(item, checkboxes))}</span>
          <button
            type="button"
            class="completion-chip-remove"
            data-action="remove-checkbox"
            data-tag-id="${tag.id}"
            data-checkbox-id="${item.id}"
            aria-label="Remove ${escapeHtml(formatCheckboxPathLabel(item, checkboxes))}"
          >
            ×
          </button>
        </span>
      `,
    )
    .join('');

  return `
    <div class="completion-picker" data-tag-id="${tag.id}">
      <span class="label">Checkboxes</span>
      ${
        chips
          ? `<div class="completion-picker-chips">${chips}</div>`
          : '<p class="completion-picker-empty">No checkboxes assigned yet.</p>'
      }
      <div class="completion-picker-control">
        <input
          type="search"
          class="input completion-picker-search"
          data-tag-id="${tag.id}"
          value="${escapeHtml(query)}"
          placeholder="Search checkboxes to add..."
          autocomplete="off"
          aria-expanded="false"
          aria-controls="completion-picker-menu-${tag.id}"
        />
        <div
          id="completion-picker-menu-${tag.id}"
          class="completion-picker-menu"
          role="listbox"
          hidden
        >
          ${renderPickerOptions(tag, checkboxes, query)}
        </div>
      </div>
    </div>
  `;
}

export function mountCompletionTagsEditor(
  host: HTMLElement,
  editor: MarkdownEditorHandle,
  initial: CompletionTagsData,
): { getData: () => CompletionTagsData; refresh: () => void; cleanup: () => void } {
  let tags: CompletionTag[] = structuredClone(initial.tags).map((tag) => ({
    ...tag,
    showInSummary: tag.showInSummary ?? false,
  }));
  const pickerQueries = new Map<string, string>();
  const collapsedTags = new Set<string>();

  const savePickerQueries = () => {
    host.querySelectorAll('.completion-picker-search').forEach((input) => {
      const tagId = (input as HTMLElement).dataset.tagId;
      if (tagId) pickerQueries.set(tagId, (input as HTMLInputElement).value);
    });
  };

  const closeAllPickerMenus = () => {
    host.querySelectorAll('.completion-picker-menu').forEach((menu) => {
      (menu as HTMLElement).hidden = true;
    });
    host.querySelectorAll('.completion-picker-search').forEach((input) => {
      input.setAttribute('aria-expanded', 'false');
    });
  };

  const scheduleRender = () => {
    queueMicrotask(() => render());
  };

  const addCheckboxToTag = (tagId: string, checkboxId: string) => {
    const tag = tags.find((entry) => entry.id === tagId);
    if (!tag || tag.checkboxIds.includes(checkboxId)) return;

    tag.checkboxIds.push(checkboxId);
    pickerQueries.set(tagId, '');
    scheduleRender();
  };

  const removeCheckboxFromTag = (tagId: string, checkboxId: string) => {
    const tag = tags.find((entry) => entry.id === tagId);
    if (!tag) return;
    tag.checkboxIds = tag.checkboxIds.filter((id) => id !== checkboxId);
    scheduleRender();
  };

  const updatePickerMenu = (tagId: string) => {
    const tag = tags.find((entry) => entry.id === tagId);
    const input = host.querySelector(`.completion-picker-search[data-tag-id="${tagId}"]`) as HTMLInputElement | null;
    const menu = host.querySelector(`#completion-picker-menu-${tagId}`) as HTMLElement | null;
    if (!tag || !input || !menu) return;

    const checkboxes = extractCheckboxes(editor.getValue());
    const query = input.value;
    pickerQueries.set(tagId, query);

    menu.innerHTML = renderPickerOptions(tag, checkboxes, query);
    menu.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  const render = () => {
    savePickerQueries();
    const checkboxes = extractCheckboxes(editor.getValue());

    if (checkboxes.length === 0) {
      host.innerHTML = `
        <p class="text-muted text-sm">Add checkboxes to the content tab first, then assign them to completion tags here.</p>
        <p class="hint mt-2">Use <code class="text-xs">[[tag-progress:Tag Name]]</code> in the content to embed a progress bar for a tag.</p>
        <div class="mt-4">
          <button type="button" class="btn-secondary" data-action="add-tag">Add tag</button>
        </div>
      `;
      wireStaticActions();
      return;
    }

    host.innerHTML = `
      <p class="text-muted text-sm mb-2">
        Group checkboxes into larger tasks. A checkbox can belong to multiple tags.
      </p>
      <p class="hint mb-4">
        Embed a tag progress bar in content with <code class="text-xs">[[tag-progress:Tag Name]]</code>.
        Toggle "Show in summary" to display a tag in the progress section above the journal.
      </p>
      <div class="space-y-4">
        ${
          tags.length === 0
            ? '<p class="text-faint text-sm">No completion tags yet.</p>'
            : tags
                .map((tag) => {
                  const marker = buildTagProgressMarker(tag);
                  const query = pickerQueries.get(tag.id) ?? '';
                  const tagTitle = tag.name.trim() || 'Untitled tag';

                  const tagBody = `
                      <div class="completion-tag-header mb-3">
                        <label class="block flex-1 min-w-[12rem]">
                          <span class="label">Tag name</span>
                          <input type="text" class="input" data-tag-name="${tag.id}" value="${escapeHtml(tag.name)}" placeholder="e.g. Complete World 1" />
                        </label>
                        <button type="button" class="btn-secondary completion-tag-remove" data-action="remove-tag" data-tag-id="${tag.id}">Remove tag</button>
                      </div>
                      <div class="flex flex-wrap items-center gap-4 mb-3">
                        <label class="settings-check">
                          <input type="checkbox" data-show-in-summary="${tag.id}" ${tag.showInSummary ? 'checked' : ''} />
                          <span>Show in summary</span>
                        </label>
                        <button type="button" class="btn-secondary text-xs" data-action="insert-progress" data-tag-id="${tag.id}">
                          Insert progress bar in content
                        </button>
                      </div>
                      <p class="hint mb-3">Marker: <code class="text-xs">${escapeHtml(marker)}</code></p>
                      ${renderCheckboxPicker(tag, checkboxes, query)}
                  `;

                  return renderCollapsiblePanel({
                    title: tagTitle,
                    className: 'completion-tag-card',
                    defaultOpen: !collapsedTags.has(tag.id),
                    attributes: { 'tag-id': tag.id },
                    content: tagBody,
                  });
                })
                .join('')
        }
      </div>
      <div class="mt-4">
        <button type="button" class="btn-secondary" data-action="add-tag">Add tag</button>
      </div>
    `;

    wireStaticActions();
  };

  const wireStaticActions = () => {
    host.querySelectorAll('[data-action="add-tag"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        tags.push({
          id: crypto.randomUUID(),
          name: '',
          checkboxIds: [],
          showInSummary: false,
        });
        scheduleRender();
      });
    });

    host.querySelectorAll('[data-action="remove-tag"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const tagId = (button as HTMLElement).dataset.tagId;
        tags = tags.filter((tag) => tag.id !== tagId);
        if (tagId) pickerQueries.delete(tagId);
        scheduleRender();
      });
    });

    host.querySelectorAll('[data-action="insert-progress"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const tagId = (button as HTMLElement).dataset.tagId;
        const tag = tags.find((entry) => entry.id === tagId);
        if (!tag) return;
        editor.insertLine(buildTagProgressMarker(tag));
      });
    });

    host.querySelectorAll('[data-tag-name]').forEach((input) => {
      input.addEventListener('input', () => {
        const tagId = (input as HTMLElement).dataset.tagName;
        const tag = tags.find((entry) => entry.id === tagId);
        if (tag) tag.name = (input as HTMLInputElement).value;
      });
    });

    host.querySelectorAll('[data-show-in-summary]').forEach((input) => {
      input.addEventListener('change', () => {
        const tagId = (input as HTMLElement).dataset.showInSummary;
        const tag = tags.find((entry) => entry.id === tagId);
        if (tag) tag.showInSummary = (input as HTMLInputElement).checked;
      });
    });
  };

  const onHostClick = (event: Event) => {
    const target = (event.target as Element).closest('[data-action]') as HTMLElement | null;
    if (!target) return;

    if (target.dataset.action === 'add-checkbox') {
      event.preventDefault();
      event.stopPropagation();
      addCheckboxToTag(target.dataset.tagId!, target.dataset.checkboxId!);
      return;
    }

    if (target.dataset.action === 'remove-checkbox') {
      event.preventDefault();
      event.stopPropagation();
      removeCheckboxFromTag(target.dataset.tagId!, target.dataset.checkboxId!);
    }
  };

  const onHostFocusIn = (event: Event) => {
    const input = (event.target as Element).closest('.completion-picker-search') as HTMLInputElement | null;
    if (input?.dataset.tagId) updatePickerMenu(input.dataset.tagId);
  };

  const onHostInput = (event: Event) => {
    const input = (event.target as Element).closest('.completion-picker-search') as HTMLInputElement | null;
    if (input?.dataset.tagId) updatePickerMenu(input.dataset.tagId);
  };

  const onHostKeyDown = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;
    const input = (keyboardEvent.target as Element).closest('.completion-picker-search') as HTMLInputElement | null;
    if (!input?.dataset.tagId) return;

    const tagId = input.dataset.tagId;

    if (keyboardEvent.key === 'Escape') {
      closeAllPickerMenus();
      input.blur();
      return;
    }

    if (keyboardEvent.key === 'Enter') {
      keyboardEvent.preventDefault();
      keyboardEvent.stopPropagation();
      const firstEnabled = host.querySelector(
        `#completion-picker-menu-${tagId} [data-action="add-checkbox"]`,
      ) as HTMLElement | null;
      if (firstEnabled) {
        addCheckboxToTag(tagId, firstEnabled.dataset.checkboxId!);
      }
    }
  };

  const onDocumentClick = (event: MouseEvent) => {
    if (!(event.target as Element).closest('.completion-picker')) {
      closeAllPickerMenus();
    }
  };

  const onContentChange = () => scheduleRender();
  const unsubscribe = editor.onChange(onContentChange);
  host.addEventListener('click', onHostClick);
  host.addEventListener('focusin', onHostFocusIn);
  host.addEventListener('input', onHostInput);
  host.addEventListener('keydown', onHostKeyDown);
  document.addEventListener('click', onDocumentClick);
  const cleanupCollapsible = wireCollapsiblePanels(host, {
    onToggle: (panel, expanded) => {
      const tagId = panel.dataset.tagId;
      if (!tagId) return;
      if (expanded) collapsedTags.delete(tagId);
      else collapsedTags.add(tagId);
    },
  });
  render();

  return {
    getData: () => ({
      tags: tags.map((tag) => ({
        ...tag,
        name: tag.name.trim(),
        checkboxIds: [...tag.checkboxIds],
        showInSummary: tag.showInSummary ?? false,
      })),
    }),
    refresh: render,
    cleanup: () => {
      cleanupCollapsible();
      unsubscribe();
      host.removeEventListener('click', onHostClick);
      host.removeEventListener('focusin', onHostFocusIn);
      host.removeEventListener('input', onHostInput);
      host.removeEventListener('keydown', onHostKeyDown);
      document.removeEventListener('click', onDocumentClick);
    },
  };
}
