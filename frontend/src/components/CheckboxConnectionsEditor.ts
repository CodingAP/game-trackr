import { renderEditorItemTable, renderEditorSplitLayout, resolveEditorSelection, wireEditorItemTable, wireEditorItemTableRemove } from './editorLibraryUi.js';
import { renderListSearchBar, wireListSearch } from './listSearch.js';
import { readListScroll, restoreListScroll } from '../utils/scrollList.js';
import {
  inferCheckboxParentsFromJournal,
  slugifyCheckboxId,
} from '../markdown/managedCheckboxes.js';
import { parseBulkCheckboxImport } from '../markdown/checkboxBulkImport.js';
import { findProgressBarByName } from '../markdown/progressBars.js';
import { openCheckboxBulkImportDialog } from './CheckboxBulkImportDialog.js';
import { icon, iconLabel } from './icons.js';
import type {
  CheckboxConnectionsData,
  ProgressBar,
  ProgressBarsData,
  FullJournalData,
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

function buildCheckboxSearchText(
  checkbox: ManagedCheckbox,
  checkboxes: ManagedCheckbox[],
  progressBars: ProgressBar[],
): string {
  const parent = checkbox.parentId
    ? checkboxes.find((entry) => entry.id === checkbox.parentId)
    : null;
  const barNames = progressBars
    .filter((bar) => checkbox.tagIds.includes(bar.id))
    .map((bar) => bar.name.trim() || bar.id);
  return [
    checkbox.id,
    checkbox.label,
    parent?.label,
    parent?.id,
    ...barNames,
  ]
    .filter(Boolean)
    .join(' ');
}

function renderCheckboxTablePrimary(
  checkbox: ManagedCheckbox,
  checkboxes: ManagedCheckbox[],
): string {
  const label = checkbox.label.trim() || checkbox.id || 'Untitled checkbox';
  const parent = checkbox.parentId
    ? checkboxes.find((entry) => entry.id === checkbox.parentId)
    : null;
  const parentText = parent ? parent.label.trim() || parent.id : 'Top-level';
  return `${parentText} → ${label}`;
}

function renderProgressBarSection(checkbox: ManagedCheckbox, progressBars: ProgressBar[]): string {
  const assigned = progressBars.filter((bar) => checkbox.tagIds.includes(bar.id));
  const available = progressBars.filter((bar) => !checkbox.tagIds.includes(bar.id));

  return `
    <div class="checkbox-editor-tags mb-3">
      <span class="label">Progress bars</span>
      ${
        assigned.length > 0
          ? `
            <div class="checkbox-tags-chips mt-1">
              ${assigned
                .map(
                  (tag) => `
                    <span class="completion-chip completion-chip-compact">
                      <span>${escapeHtml(tag.name.trim() || 'Untitled progress bar')}</span>
                      <button
                        type="button"
                        class="completion-chip-remove"
                        data-action="remove-tag"
                        data-checkbox-id="${checkbox.id}"
                        data-tag-id="${tag.id}"
                        aria-label="Remove progress bar"
                      >${icon('close', 'ui-icon ui-icon-sm')}</button>
                    </span>
                  `,
                )
                .join('')}
            </div>
          `
          : '<p class="checkbox-tags-empty">No progress bars assigned.</p>'
      }
      ${
        available.length > 0
          ? `
            <select class="input mt-1" data-action="add-tag" data-checkbox-id="${checkbox.id}">
              <option value="">Add progress bar...</option>
              ${available
                .map(
                  (tag) =>
                    `<option value="${tag.id}">${escapeHtml(tag.name.trim() || 'Untitled progress bar')}</option>`,
                )
                .join('')}
            </select>
          `
          : ''
      }
    </div>
  `;
}

function renderCheckboxDetailPanel(
  checkbox: ManagedCheckbox,
  checkboxes: ManagedCheckbox[],
  progressBars: ProgressBar[],
): string {
  const parentOptions = checkboxes.filter((entry) => entry.id !== checkbox.id);
  const title = checkbox.label.trim() || checkbox.id || 'Untitled checkbox';

  return `
    <div class="image-library-detail panel" data-item-detail data-checkbox-id="${escapeHtml(checkbox.id)}">
      <div class="mb-3">
        <p class="label mb-1">Selected checkbox</p>
        <p class="text-sm font-medium text-strong">${escapeHtml(title)}</p>
      </div>
      <label class="block mb-3">
        <span class="label">Label</span>
        <input
          type="text"
          class="input"
          data-checkbox-label="${escapeHtml(checkbox.id)}"
          value="${escapeHtml(checkbox.label)}"
        />
      </label>
      <p class="hint mb-3">Marker id: <code>[[cb:${escapeHtml(checkbox.id)}]]</code> (updates when you change the label)</p>
      <label class="block mb-3">
        <span class="label">Parent checkbox</span>
        <select class="input" data-checkbox-parent="${escapeHtml(checkbox.id)}">
            <option value="">None (top-level)</option>
            ${parentOptions
              .map(
                (entry) =>
                  `<option value="${entry.id}"${entry.id === checkbox.parentId ? ' selected' : ''}>${escapeHtml(entry.label || entry.id)}</option>`,
              )
              .join('')}
          </select>
      </label>
      ${
        checkbox.parentId === null
          ? `
            <label class="settings-check mb-3">
              <input
                type="checkbox"
                data-checkbox-completion="${escapeHtml(checkbox.id)}"
                ${checkbox.excludeFromCompletion ? '' : 'checked'}
              />
              <span>Count toward overall completion</span>
            </label>
            <p class="hint mb-3">Uncheck to keep this checkbox out of the overall completion total.</p>
          `
          : ''
      }
      ${renderProgressBarSection(checkbox, progressBars)}
    </div>
  `;
}

interface CheckboxConnectionsEditorOptions {
  getJournalContents?: () => {
    pages: FullJournalData['pages'];
    contents: FullJournalData['contents'];
  };
  onParentsChanged?: () => void;
  onEnsureProgressBar?: (name: string) => ProgressBar | null;
  onCheckboxesChanged?: () => void;
}

export function mountCheckboxConnectionsEditor(
  host: HTMLElement,
  editor: MarkdownEditorHandle,
  initial: CheckboxConnectionsData,
  getProgressBars: () => ProgressBarsData,
  options: CheckboxConnectionsEditorOptions = {},
): {
  getData: () => CheckboxConnectionsData;
  addCheckbox: (checkbox: ManagedCheckbox) => boolean;
  upsertCheckboxes: (incoming: ManagedCheckbox[]) => boolean;
  removeCheckbox: (id: string) => boolean;
  updateCheckbox: (
    id: string,
    updates: { id?: string; label?: string },
  ) => string | false;
  renameProgressBarReference: (oldId: string, newId: string) => void;
  syncParentsFromMarkdown: () => boolean;
  refresh: () => void;
  cleanup: () => void;
} {
  let checkboxes: ManagedCheckbox[] = structuredClone(initial.checkboxes);
  let selectedId: string | null = resolveEditorSelection(checkboxes, null);
  let showAddPanel = checkboxes.length === 0;
  let searchQuery = '';
  let cleanupSearch = () => {};
  let syncTimer: ReturnType<typeof setTimeout> | null = null;

  host.innerHTML = renderEditorSplitLayout({
    listTitle: 'Checkboxes',
    listLabel: 'Checkboxes',
    detailLabel: 'Checkbox details',
    addAction: 'add-checkbox',
    addLabel: 'Add checkbox',
    listHeaderExtraHtml: `
      <button
        type="button"
        class="editor-split-add"
        data-action="bulk-add-checkboxes"
        aria-label="Bulk add checkboxes"
      >
        ${icon('import', 'ui-icon ui-icon-sm')}
      </button>
    `,
    searchHtml: renderListSearchBar({
      id: 'checkbox-search',
      placeholder: 'Search checkboxes...',
      className: 'mb-3',
    }),
  });

  const tableHost = host.querySelector('[data-item-table-host]') as HTMLElement;
  const detailHost = host.querySelector('[data-item-detail-host]') as HTMLElement;
  detailHost.innerHTML = `
    <div data-checkbox-add-panel class="image-library-detail panel${showAddPanel ? '' : ' hidden'}">
      <p class="label mb-3">Add checkbox</p>
      <label class="block mb-3">
        <span class="label">Label</span>
        <input
          type="text"
          data-field="new-checkbox-label"
          class="input"
          placeholder="e.g. Defeat the boss"
        />
      </label>
      <p class="hint mb-3">The marker id is generated from the label.</p>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-primary" data-action="confirm-add-checkbox">${iconLabel('plus', 'Add checkbox')}</button>
        <button type="button" class="btn-secondary" data-action="cancel-add-checkbox">${iconLabel('close', 'Cancel')}</button>
      </div>
    </div>
    <div data-checkbox-edit-host class="min-w-0"></div>
    <p data-checkbox-detail-placeholder class="editor-split-detail-empty text-muted text-sm hidden">
      No checkboxes yet. Click + to add one.
    </p>
  `;

  const addPanel = detailHost.querySelector('[data-checkbox-add-panel]') as HTMLElement;
  const editHost = detailHost.querySelector('[data-checkbox-edit-host]') as HTMLElement;
  const detailPlaceholder = detailHost.querySelector(
    '[data-checkbox-detail-placeholder]',
  ) as HTMLElement;
  const newLabelInput = addPanel.querySelector(
    '[data-field="new-checkbox-label"]',
  ) as HTMLInputElement;

  const syncParentsFromMarkdown = (): boolean => {
    const sources = options.getJournalContents?.();
    if (!sources) return false;

    const parents = inferCheckboxParentsFromJournal(sources.pages, sources.contents);
    let changed = false;

    for (const checkbox of checkboxes) {
      if (!parents.has(checkbox.id)) continue;
      const nextParent = parents.get(checkbox.id) ?? null;
      if (checkbox.parentId === nextParent) continue;
      checkbox.parentId = nextParent;
      changed = true;
    }

    if (changed) {
      render();
      options.onParentsChanged?.();
    }

    return changed;
  };

  const scheduleSyncParents = () => {
    if (!options.getJournalContents) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      syncParentsFromMarkdown();
    }, 200);
  };

  const cleanupChangeListener = editor.onChange(scheduleSyncParents);

  const syncFromDom = () => {
    editHost.querySelectorAll('[data-checkbox-label]').forEach((input) => {
      const checkboxId = (input as HTMLElement).dataset.checkboxLabel;
      const checkbox = checkboxes.find((cb) => cb.id === checkboxId);
      if (checkbox) checkbox.label = (input as HTMLInputElement).value;
    });

    editHost.querySelectorAll('[data-checkbox-parent]').forEach((select) => {
      const checkboxId = (select as HTMLElement).dataset.checkboxParent;
      const checkbox = checkboxes.find((cb) => cb.id === checkboxId);
      if (!checkbox) return;
      checkbox.parentId = (select as HTMLSelectElement).value || null;
    });
  };

  const isEditingDetail = (): boolean => {
    const active = document.activeElement;
    if (!active || !detailHost.contains(active)) return false;
    if (active instanceof HTMLSelectElement) return false;
    return active.matches('input:not([type="checkbox"]), textarea');
  };

  const scrollSelectedRowIntoView = () => {
    requestAnimationFrame(() => {
      tableHost.querySelector<HTMLElement>('tr.is-selected')?.scrollIntoView({ block: 'nearest' });
    });
  };

  const render = () => {
    if (isEditingDetail()) return;

    syncFromDom();
    const progressBars = getProgressBars().tags;

    if (!showAddPanel) {
      selectedId = resolveEditorSelection(checkboxes, selectedId);
    }

    const listScrollTop = readListScroll(tableHost);

    tableHost.innerHTML = renderEditorItemTable(
      checkboxes.map((checkbox) => ({
        id: checkbox.id,
        primary: renderCheckboxTablePrimary(checkbox, checkboxes),
        searchText: buildCheckboxSearchText(checkbox, checkboxes, progressBars),
      })),
      {
        emptyMessage: 'No checkboxes yet. Click + to add one.',
        selectedId: showAddPanel ? null : selectedId,
        rowAction: 'select-checkbox',
        primaryHeader: 'Checkbox',
        removeAction: 'remove-checkbox',
      },
    );

    if (showAddPanel) {
      addPanel.classList.remove('hidden');
      editHost.innerHTML = '';
      editHost.classList.add('hidden');
      detailPlaceholder.classList.add('hidden');
    } else if (selectedId) {
      const checkbox = checkboxes.find((cb) => cb.id === selectedId);
      if (checkbox) {
        addPanel.classList.add('hidden');
        editHost.classList.remove('hidden');
        editHost.innerHTML = renderCheckboxDetailPanel(checkbox, checkboxes, progressBars);
        detailPlaceholder.classList.add('hidden');
      } else {
        addPanel.classList.add('hidden');
        editHost.innerHTML = '';
        editHost.classList.add('hidden');
        detailPlaceholder.textContent = 'Select a checkbox from the list.';
        detailPlaceholder.classList.remove('hidden');
      }
    } else {
      addPanel.classList.add('hidden');
      editHost.innerHTML = '';
      editHost.classList.add('hidden');
      detailPlaceholder.textContent = 'No checkboxes yet. Click + to add one.';
      detailPlaceholder.classList.remove('hidden');
    }

    wireStaticActions();

    cleanupSearch();
    const search = wireListSearch(host, {
      preserveQuery: () => searchQuery,
      onQueryChange: (query) => {
        searchQuery = query;
      },
      itemSelector: '[data-search-text]',
    });
    cleanupSearch = search.cleanup;
    options.onCheckboxesChanged?.();
    restoreListScroll(tableHost, listScrollTop);
  };

  const wireStaticActions = () => {
    wireEditorItemTable(tableHost, {
      rowSelector: '[data-action="select-checkbox"]',
      readKey: (row) => row.dataset.itemId,
      isSelected: (id) => !showAddPanel && id === selectedId,
      onSelect: (id) => {
        showAddPanel = false;
        selectedId = id;
        render();
      },
    });

    wireEditorItemTableRemove(tableHost, {
      buttonSelector: '[data-action="remove-checkbox"]',
      readKey: (button) => button.dataset.itemId,
      onRemove: (checkboxId) => {
        if (selectedId === checkboxId) selectedId = null;
        checkboxes = checkboxes
          .filter((cb) => cb.id !== checkboxId)
          .map((cb) => ({
            ...cb,
            parentId: cb.parentId === checkboxId ? null : cb.parentId,
          }));
        selectedId = resolveEditorSelection(checkboxes, selectedId);
        if (checkboxes.length === 0) showAddPanel = true;
        render();
      },
    });

    editHost.querySelectorAll('[data-checkbox-label]').forEach((input) => {
      input.addEventListener('input', () => {
        const checkboxId = (input as HTMLElement).dataset.checkboxLabel;
        const checkbox = checkboxes.find((cb) => cb.id === checkboxId);
        if (checkbox) checkbox.label = (input as HTMLInputElement).value;
      });
      input.addEventListener('blur', () => {
        const checkboxId = (input as HTMLElement).dataset.checkboxLabel;
        if (!checkboxId) return;
        commitCheckboxUpdate(checkboxId, { label: (input as HTMLInputElement).value.trim() });
      });
    });

    editHost.querySelectorAll('[data-checkbox-parent]').forEach((select) => {
      select.addEventListener('change', () => {
        const checkboxId = (select as HTMLElement).dataset.checkboxParent;
        const checkbox = checkboxes.find((cb) => cb.id === checkboxId);
        if (!checkbox) return;
        const value = (select as HTMLSelectElement).value;
        checkbox.parentId = value || null;
        render();
      });
    });

    editHost.querySelectorAll('[data-checkbox-completion]').forEach((input) => {
      input.addEventListener('change', () => {
        const checkboxId = (input as HTMLElement).dataset.checkboxCompletion;
        const checkbox = checkboxes.find((cb) => cb.id === checkboxId);
        if (!checkbox) return;
        checkbox.excludeFromCompletion = !(input as HTMLInputElement).checked;
        options.onCheckboxesChanged?.();
      });
    });

    editHost.querySelectorAll('[data-action="add-tag"]').forEach((select) => {
      select.addEventListener('change', () => {
        const checkboxId = (select as HTMLElement).dataset.checkboxId;
        const tagId = (select as HTMLSelectElement).value;
        const checkbox = checkboxes.find((cb) => cb.id === checkboxId);
        if (!checkbox || !tagId || checkbox.tagIds.includes(tagId)) return;
        checkbox.tagIds.push(tagId);
        render();
      });
    });

    editHost.querySelectorAll('[data-action="remove-tag"]').forEach((button) => {
      button.addEventListener('click', () => {
        const checkboxId = (button as HTMLElement).dataset.checkboxId;
        const tagId = (button as HTMLElement).dataset.tagId;
        const checkbox = checkboxes.find((cb) => cb.id === checkboxId);
        if (!checkbox || !tagId) return;
        checkbox.tagIds = checkbox.tagIds.filter((id) => id !== tagId);
        render();
      });
    });
  };

  const findCheckboxByLabel = (label: string): ManagedCheckbox | undefined => {
    const normalized = label.trim().toLowerCase();
    if (!normalized) return undefined;
    return checkboxes.find((entry) => entry.label.trim().toLowerCase() === normalized);
  };

  const ensureProgressBar = (name: string): ProgressBar | null => {
    const trimmed = name.trim();
    if (!trimmed) return null;

    const existing = findProgressBarByName(getProgressBars().tags, trimmed);
    if (existing) return existing;

    return options.onEnsureProgressBar?.(trimmed) ?? null;
  };

  const bulkImportCheckboxes = (text: string): { added: number; errors: string[] } => {
    const parsed = parseBulkCheckboxImport(text);
    const errors = parsed.errors.map(
      (error) => `Line ${error.lineNumber}: ${error.message}`,
    );
    let added = 0;

    for (const row of parsed.rows) {
      let parentId: string | null = null;
      if (row.parentLabel) {
        const parent = findCheckboxByLabel(row.parentLabel);
        if (!parent) {
          errors.push(`Line ${row.lineNumber}: Parent "${row.parentLabel}" was not found.`);
          continue;
        }
        parentId = parent.id;
      }

      const tagIds: string[] = [];
      for (const progressBarName of row.progressBarNames) {
        const bar = ensureProgressBar(progressBarName);
        if (!bar) {
          errors.push(
            `Line ${row.lineNumber}: Could not create progress bar "${progressBarName}".`,
          );
          continue;
        }
        if (!tagIds.includes(bar.id)) tagIds.push(bar.id);
      }

      const id = slugifyCheckboxId(row.label, new Set(checkboxes.map((entry) => entry.id)));
      checkboxes.push({
        id,
        label: row.label,
        parentId,
        tagIds,
      });
      added += 1;
    }

    if (added > 0) {
      selectedId = checkboxes[checkboxes.length - 1]?.id ?? selectedId;
      showAddPanel = false;
      render();
    }

    return { added, errors };
  };

  const confirmAddCheckbox = () => {
    const label = newLabelInput.value.trim();
    if (!label) {
      newLabelInput.focus();
      return;
    }

    const id = slugifyCheckboxId(label, new Set(checkboxes.map((cb) => cb.id)));
    checkboxes.push({
      id,
      label,
      parentId: null,
      tagIds: [],
    });
    selectedId = id;
    showAddPanel = false;
    newLabelInput.value = '';
    render();
    scrollSelectedRowIntoView();
  };

  host.querySelector('[data-action="add-checkbox"]')?.addEventListener('click', () => {
    showAddPanel = true;
    render();
    newLabelInput.focus();
  });

  addPanel.querySelector('[data-action="confirm-add-checkbox"]')?.addEventListener('click', confirmAddCheckbox);
  addPanel.querySelector('[data-action="cancel-add-checkbox"]')?.addEventListener('click', () => {
    showAddPanel = false;
    newLabelInput.value = '';
    render();
  });
  newLabelInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      confirmAddCheckbox();
    }
  });

  host.querySelector('[data-action="bulk-add-checkboxes"]')?.addEventListener('click', () => {
    openCheckboxBulkImportDialog({
      onImport: bulkImportCheckboxes,
    });
  });

  const renameCheckboxId = (checkbox: ManagedCheckbox, nextId: string) => {
    const oldId = checkbox.id;
    if (selectedId === oldId) selectedId = nextId;
    checkboxes.forEach((entry) => {
      if (entry.parentId === oldId) entry.parentId = nextId;
    });
    checkbox.id = nextId;
  };

  const commitCheckboxUpdate = (
    id: string,
    updates: { id?: string; label?: string },
  ): string | false => {
    const checkbox = checkboxes.find((entry) => entry.id === id);
    if (!checkbox) return false;

    if (updates.label !== undefined) {
      checkbox.label = updates.label.trim();
    }

    const explicitId = updates.id?.trim();
    const labelForId = checkbox.label.trim();
    const derivedId = labelForId
      ? slugifyCheckboxId(
          labelForId,
          new Set(checkboxes.filter((entry) => entry.id !== checkbox.id).map((entry) => entry.id)),
        )
      : checkbox.id;
    const nextId = explicitId && explicitId !== checkbox.id ? explicitId : derivedId;

    if (nextId !== checkbox.id) {
      if (checkboxes.some((entry) => entry.id === nextId)) return false;
      renameCheckboxId(checkbox, nextId);
    }

    render();
    return checkbox.id;
  };

  render();
  syncParentsFromMarkdown();

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
        excludeFromCompletion: checkbox.excludeFromCompletion,
      });
      selectedId = checkbox.id;
      showAddPanel = false;
      render();
      return true;
    },
    upsertCheckboxes: (incoming: ManagedCheckbox[]) => {
      let changed = false;

      for (const next of incoming) {
        const existing = checkboxes.find((entry) => entry.id === next.id);
        if (existing) {
          if (next.label && existing.label !== next.label) {
            existing.label = next.label;
            changed = true;
          }
          for (const tagId of next.tagIds) {
            if (!existing.tagIds.includes(tagId)) {
              existing.tagIds.push(tagId);
              changed = true;
            }
          }
          continue;
        }

        checkboxes.push({
          id: next.id,
          label: next.label,
          parentId: next.parentId,
          tagIds: [...next.tagIds],
          excludeFromCompletion: next.excludeFromCompletion,
        });
        changed = true;
      }

      if (changed) {
        showAddPanel = false;
        render();
      }
      return changed;
    },
    removeCheckbox: (id: string) => {
      if (!checkboxes.some((entry) => entry.id === id)) return false;
      if (selectedId === id) selectedId = null;
      checkboxes = checkboxes
        .filter((entry) => entry.id !== id)
        .map((entry) => ({
          ...entry,
          parentId: entry.parentId === id ? null : entry.parentId,
        }));
      selectedId = resolveEditorSelection(checkboxes, selectedId);
      if (checkboxes.length === 0) showAddPanel = true;
      render();
      return true;
    },
    updateCheckbox: commitCheckboxUpdate,
    renameProgressBarReference: (oldId: string, newId: string) => {
      let changed = false;
      for (const checkbox of checkboxes) {
        if (!checkbox.tagIds.includes(oldId)) continue;
        checkbox.tagIds = checkbox.tagIds.map((tagId) => (tagId === oldId ? newId : tagId));
        changed = true;
      }
      if (changed) render();
    },
    syncParentsFromMarkdown,
    refresh: render,
    cleanup: () => {
      if (syncTimer) clearTimeout(syncTimer);
      cleanupChangeListener();
      cleanupSearch();
    },
  };
}
