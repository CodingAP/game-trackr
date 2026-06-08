import { renderCollapsiblePanel, wireCollapsiblePanels } from './CollapsiblePanel.js';
import { renderListSearchBar, wireListSearch } from './listSearch.js';
import { buildCheckboxMarker, slugifyCheckboxId } from '../markdown/managedCheckboxes.js';
import { icon, iconLabel } from './icons.js';
import type {
  CheckboxConnectionsData,
  CompletionTag,
  CompletionTagsData,
  ManagedCheckbox,
} from '../types/index.js';
import type { MarkdownEditorHandle } from '../types/markdownEditor.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderCheckboxPanelTitle(
  checkbox: ManagedCheckbox,
  checkboxes: ManagedCheckbox[],
  tags: CompletionTag[],
): string {
  const label = escapeHtml(checkbox.label.trim() || checkbox.id || 'Untitled checkbox');
  const parent = checkbox.parentId
    ? checkboxes.find((entry) => entry.id === checkbox.parentId)
    : null;
  const parentText = parent
    ? escapeHtml(parent.label.trim() || parent.id)
    : 'Top-level';
  const assignedTags = tags.filter((tag) => checkbox.tagIds.includes(tag.id));
  const tagText =
    assignedTags.length > 0
      ? assignedTags
          .map((tag) => escapeHtml(tag.name.trim() || 'Untitled tag'))
          .join(', ')
      : 'None';

  return `
    <span class="checkbox-panel-title">
      <span class="checkbox-panel-title-main">${parentText} -&gt; ${label}</span>
      <span class="checkbox-panel-title-tags">(Tags: ${tagText})</span>
    </span>
  `;
}

function buildCheckboxSearchText(
  checkbox: ManagedCheckbox,
  checkboxes: ManagedCheckbox[],
  tags: CompletionTag[],
): string {
  const parent = checkbox.parentId
    ? checkboxes.find((entry) => entry.id === checkbox.parentId)
    : null;
  const tagNames = tags
    .filter((tag) => checkbox.tagIds.includes(tag.id))
    .map((tag) => tag.name.trim() || tag.id);
  return [
    checkbox.id,
    checkbox.label,
    parent?.label,
    parent?.id,
    ...tagNames,
  ]
    .filter(Boolean)
    .join(' ');
}

function renderTagSection(checkbox: ManagedCheckbox, tags: CompletionTag[]): string {
  const assigned = tags.filter((tag) => checkbox.tagIds.includes(tag.id));
  const available = tags.filter((tag) => !checkbox.tagIds.includes(tag.id));

  return `
    <div class="checkbox-editor-tags mb-3">
      <span class="label">Completion tags</span>
      ${
        assigned.length > 0
          ? `
            <div class="checkbox-tags-chips">
              ${assigned
                .map(
                  (tag) => `
                    <span class="completion-chip completion-chip-compact">
                      <span>${escapeHtml(tag.name.trim() || 'Untitled tag')}</span>
                      <button
                        type="button"
                        class="completion-chip-remove"
                        data-action="remove-tag"
                        data-checkbox-id="${checkbox.id}"
                        data-tag-id="${tag.id}"
                        aria-label="Remove tag"
                      >${icon('close', 'ui-icon ui-icon-sm')}</button>
                    </span>
                  `,
                )
                .join('')}
            </div>
          `
          : '<p class="checkbox-tags-empty">No tags assigned.</p>'
      }
      ${
        available.length > 0
          ? `
            <select class="input checkbox-tag-select" data-action="add-tag" data-checkbox-id="${checkbox.id}">
              <option value="">Add tag...</option>
              ${available
                .map(
                  (tag) =>
                    `<option value="${tag.id}">${escapeHtml(tag.name.trim() || 'Untitled tag')}</option>`,
                )
                .join('')}
            </select>
          `
          : ''
      }
    </div>
  `;
}

export function mountCheckboxConnectionsEditor(
  host: HTMLElement,
  editor: MarkdownEditorHandle,
  initial: CheckboxConnectionsData,
  getTags: () => CompletionTagsData,
): {
  getData: () => CheckboxConnectionsData;
  addCheckbox: (checkbox: ManagedCheckbox) => boolean;
  refresh: () => void;
  cleanup: () => void;
} {
  let checkboxes: ManagedCheckbox[] = structuredClone(initial.checkboxes);
  const expandedCheckboxes = new Set<string>();
  const pendingIdValues = new Map<string, string>();
  let searchQuery = '';
  let cleanupSearch = () => {};

  const syncFromDom = () => {
    host.querySelectorAll('[data-checkbox-label]').forEach((input) => {
      const checkboxId = (input as HTMLElement).dataset.checkboxLabel;
      const checkbox = checkboxes.find((cb) => cb.id === checkboxId);
      if (checkbox) checkbox.label = (input as HTMLInputElement).value;
    });

    host.querySelectorAll('[data-checkbox-parent]').forEach((select) => {
      const checkboxId = (select as HTMLElement).dataset.checkboxParent;
      const checkbox = checkboxes.find((cb) => cb.id === checkboxId);
      if (!checkbox) return;
      checkbox.parentId = (select as HTMLSelectElement).value || null;
    });

    host.querySelectorAll('[data-checkbox-id-field]').forEach((input) => {
      const checkboxId = (input as HTMLElement).dataset.checkboxIdField;
      if (!checkboxId) return;
      pendingIdValues.set(checkboxId, (input as HTMLInputElement).value);
    });
  };

  const render = () => {
    syncFromDom();
    const tags = getTags().tags;

    host.innerHTML = `
      ${checkboxes.length > 0 ? renderListSearchBar({ id: 'checkbox-search', placeholder: 'Search checkboxes...' }) : ''}
      <div class="space-y-2">
        ${
          checkboxes.length === 0
            ? '<p class="text-faint text-sm">No checkboxes yet.</p>'
            : checkboxes
                .map((checkbox) => {
                  const parentOptions = checkboxes.filter((entry) => entry.id !== checkbox.id);
                  const title = checkbox.label.trim() || checkbox.id || 'Untitled checkbox';
                  const titleHtml = renderCheckboxPanelTitle(checkbox, checkboxes, tags);

                  const body = `
                    <div class="grid gap-3 sm:grid-cols-2 mb-3">
                      <label class="block">
                        <span class="label">Id</span>
                        <input
                          type="text"
                          class="input checkbox-editor-input checkbox-editor-id"
                          data-checkbox-id-field="${checkbox.id}"
                          value="${escapeHtml(pendingIdValues.get(checkbox.id) ?? checkbox.id)}"
                          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                        />
                      </label>
                      <label class="block">
                        <span class="label">Label</span>
                        <input
                          type="text"
                          class="input checkbox-editor-input"
                          data-checkbox-label="${checkbox.id}"
                          value="${escapeHtml(checkbox.label)}"
                        />
                      </label>
                      <label class="block sm:col-span-2">
                        <span class="label">Parent checkbox</span>
                        <select class="input checkbox-editor-input" data-checkbox-parent="${checkbox.id}">
                          <option value="">None (top-level)</option>
                          ${parentOptions
                            .map(
                              (entry) =>
                                `<option value="${entry.id}"${entry.id === checkbox.parentId ? ' selected' : ''}>${escapeHtml(entry.label || entry.id)}</option>`,
                            )
                            .join('')}
                        </select>
                      </label>
                    </div>
                    ${renderTagSection(checkbox, tags)}
                    <div class="flex flex-wrap gap-2 mb-2">
                      <button type="button" class="btn-secondary text-xs" data-action="insert-marker" data-checkbox-id="${checkbox.id}">
                        ${iconLabel('plus', 'Insert in content', 'ui-icon ui-icon-sm')}
                      </button>
                      <button type="button" class="btn-secondary text-xs" data-action="remove-checkbox" data-checkbox-id="${checkbox.id}">
                        ${iconLabel('trash', 'Remove', 'ui-icon ui-icon-sm')}
                      </button>
                    </div>
                  `;

                  return renderCollapsiblePanel({
                    title,
                    titleHtml,
                    className: 'checkbox-connection-card',
                    defaultOpen: expandedCheckboxes.has(checkbox.id),
                    attributes: {
                      'checkbox-id': checkbox.id,
                      'search-text': buildCheckboxSearchText(checkbox, checkboxes, tags),
                    },
                    content: body,
                  });
                })
                .join('')
        }
      </div>
      <div class="mt-4">
        <button type="button" class="btn-secondary" data-action="add-checkbox">${iconLabel('plus', 'Add checkbox')}</button>
      </div>
    `;

    wireStaticActions();

    cleanupSearch();
    const search = wireListSearch(host, {
      preserveQuery: () => searchQuery,
      onQueryChange: (query) => {
        searchQuery = query;
      },
    });
    cleanupSearch = search.cleanup;
  };

  const wireStaticActions = () => {
    host.querySelectorAll('[data-action="add-checkbox"]').forEach((button) => {
      button.addEventListener('click', () => {
        const existingIds = new Set(checkboxes.map((cb) => cb.id));
        const label = 'New checkbox';
        const id = slugifyCheckboxId(label, existingIds);
        checkboxes.push({
          id,
          label,
          parentId: null,
          tagIds: [],
        });
        render();
      });
    });

    host.querySelectorAll('[data-action="remove-checkbox"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const checkboxId = (button as HTMLElement).dataset.checkboxId;
        if (!checkboxId) return;
        expandedCheckboxes.delete(checkboxId);
        checkboxes = checkboxes
          .filter((cb) => cb.id !== checkboxId)
          .map((cb) => ({
            ...cb,
            parentId: cb.parentId === checkboxId ? null : cb.parentId,
          }));
        render();
      });
    });

    host.querySelectorAll('[data-action="insert-marker"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const checkboxId = (button as HTMLElement).dataset.checkboxId;
        const checkbox = checkboxes.find((cb) => cb.id === checkboxId);
        if (!checkbox) return;
        editor.insertLine(buildCheckboxMarker(checkbox.id, checkbox.label || 'Label'));
      });
    });

    host.querySelectorAll('[data-checkbox-id-field]').forEach((input) => {
      input.addEventListener('change', () => {
        const oldId = (input as HTMLElement).dataset.checkboxIdField;
        const newId = (input as HTMLInputElement).value.trim();
        const checkbox = checkboxes.find((cb) => cb.id === oldId);
        if (!checkbox || !newId || newId === oldId) return;
        if (checkboxes.some((cb) => cb.id === newId)) return;

        if (expandedCheckboxes.has(oldId)) {
          expandedCheckboxes.delete(oldId);
          expandedCheckboxes.add(newId);
        }
        pendingIdValues.delete(oldId);

        checkboxes.forEach((cb) => {
          if (cb.parentId === oldId) cb.parentId = newId;
        });
        checkbox.id = newId;
        render();
      });
    });

    host.querySelectorAll('[data-checkbox-label]').forEach((input) => {
      input.addEventListener('input', () => {
        const checkboxId = (input as HTMLElement).dataset.checkboxLabel;
        const checkbox = checkboxes.find((cb) => cb.id === checkboxId);
        if (checkbox) checkbox.label = (input as HTMLInputElement).value;
      });
      input.addEventListener('blur', () => render());
    });

    host.querySelectorAll('[data-checkbox-parent]').forEach((select) => {
      select.addEventListener('change', () => {
        const checkboxId = (select as HTMLElement).dataset.checkboxParent;
        const checkbox = checkboxes.find((cb) => cb.id === checkboxId);
        if (!checkbox) return;
        const value = (select as HTMLSelectElement).value;
        checkbox.parentId = value || null;
        render();
      });
    });

    host.querySelectorAll('[data-action="add-tag"]').forEach((select) => {
      select.addEventListener('change', () => {
        const checkboxId = (select as HTMLElement).dataset.checkboxId;
        const tagId = (select as HTMLSelectElement).value;
        const checkbox = checkboxes.find((cb) => cb.id === checkboxId);
        if (!checkbox || !tagId || checkbox.tagIds.includes(tagId)) return;
        checkbox.tagIds.push(tagId);
        render();
      });
    });

    host.querySelectorAll('[data-action="remove-tag"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const checkboxId = (button as HTMLElement).dataset.checkboxId;
        const tagId = (button as HTMLElement).dataset.tagId;
        const checkbox = checkboxes.find((cb) => cb.id === checkboxId);
        if (!checkbox || !tagId) return;
        checkbox.tagIds = checkbox.tagIds.filter((id) => id !== tagId);
        render();
      });
    });
  };

  const cleanupCollapsible = wireCollapsiblePanels(host, {
    onToggle: (panel, expanded) => {
      const checkboxId = panel.dataset.checkboxId;
      if (!checkboxId) return;
      if (expanded) expandedCheckboxes.add(checkboxId);
      else expandedCheckboxes.delete(checkboxId);
    },
  });

  render();

  return {
    getData: () => ({
      checkboxes: checkboxes.map((cb) => ({
        ...cb,
        id: cb.id.trim(),
        label: cb.label.trim(),
        parentId: cb.parentId,
        tagIds: [...cb.tagIds],
      })),
    }),
    addCheckbox: (checkbox: ManagedCheckbox) => {
      if (checkboxes.some((entry) => entry.id === checkbox.id)) return false;
      checkboxes.push({
        id: checkbox.id,
        label: checkbox.label,
        parentId: checkbox.parentId,
        tagIds: [...checkbox.tagIds],
      });
      render();
      return true;
    },
    refresh: render,
    cleanup: () => {
      cleanupSearch();
      cleanupCollapsible();
    },
  };
}
