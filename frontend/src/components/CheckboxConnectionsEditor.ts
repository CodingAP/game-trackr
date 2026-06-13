import { renderEditorItemTable } from './editorLibraryUi.js';
import { renderListSearchBar, wireListSearch } from './listSearch.js';
import {
  buildCheckboxMarker,
  inferCheckboxParentsFromJournal,
  SLUG_ID_PATTERN,
  slugifyCheckboxId,
} from '../markdown/managedCheckboxes.js';
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
            <div class="checkbox-tags-chips">
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
            <select class="input checkbox-tag-select" data-action="add-tag" data-checkbox-id="${checkbox.id}">
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

function renderNewCheckboxProgressSection(progressBars: ProgressBar[], tagIds: string[]): string {
  const assigned = progressBars.filter((bar) => tagIds.includes(bar.id));
  const available = progressBars.filter((bar) => !tagIds.includes(bar.id));

  return `
    <div class="checkbox-editor-tags">
      <span class="label">Progress bars</span>
      ${
        assigned.length > 0
          ? `
            <div class="checkbox-tags-chips">
              ${assigned
                .map(
                  (tag) => `
                    <span class="completion-chip completion-chip-compact">
                      <span>${escapeHtml(tag.name.trim() || 'Untitled progress bar')}</span>
                      <button
                        type="button"
                        class="completion-chip-remove"
                        data-action="remove-new-tag"
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
            <select class="input checkbox-tag-select" data-action="add-new-tag">
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
  pendingIdValue: string,
): string {
  const parentOptions = checkboxes.filter((entry) => entry.id !== checkbox.id);
  const title = checkbox.label.trim() || checkbox.id || 'Untitled checkbox';

  return `
    <div class="image-library-detail panel" data-item-detail data-checkbox-id="${escapeHtml(checkbox.id)}">
      <div class="mb-3">
        <p class="label mb-1">Selected checkbox</p>
        <p class="text-sm font-medium text-strong">${escapeHtml(title)}</p>
      </div>
      <div class="grid gap-3 sm:grid-cols-2 mb-3">
        <label class="block">
          <span class="label">Id</span>
          <input
            type="text"
            class="input checkbox-editor-input checkbox-editor-id"
            data-checkbox-id-field="${escapeHtml(checkbox.id)}"
            value="${escapeHtml(pendingIdValue)}"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          />
        </label>
        <label class="block">
          <span class="label">Label</span>
          <input
            type="text"
            class="input checkbox-editor-input"
            data-checkbox-label="${escapeHtml(checkbox.id)}"
            value="${escapeHtml(checkbox.label)}"
          />
        </label>
        <label class="block sm:col-span-2">
          <span class="label">Parent checkbox</span>
          <select class="input checkbox-editor-input" data-checkbox-parent="${escapeHtml(checkbox.id)}">
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
      ${renderProgressBarSection(checkbox, progressBars)}
      <div class="image-edit-form-actions flex flex-wrap gap-2">
        <button type="button" class="btn-secondary" data-action="insert-marker" data-checkbox-id="${escapeHtml(checkbox.id)}">${iconLabel('plus', 'Insert into content')}</button>
        <button type="button" class="btn-secondary" data-action="remove-checkbox" data-checkbox-id="${escapeHtml(checkbox.id)}">${iconLabel('trash', 'Remove checkbox')}</button>
      </div>
    </div>
  `;
}

interface CheckboxConnectionsEditorOptions {
  getJournalContents?: () => {
    pages: FullJournalData['pages'];
    contents: FullJournalData['contents'];
  };
  onParentsChanged?: () => void;
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
  updateCheckbox: (
    id: string,
    updates: { id?: string; label?: string },
  ) => boolean;
  syncParentsFromMarkdown: () => boolean;
  refresh: () => void;
  cleanup: () => void;
} {
  let checkboxes: ManagedCheckbox[] = structuredClone(initial.checkboxes);
  let selectedId: string | null = null;
  const pendingIdValues = new Map<string, string>();
  let searchQuery = '';
  let cleanupSearch = () => {};
  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  let newCheckboxDraft = { label: '', id: '', parentId: '', tagIds: [] as string[] };
  let newCheckboxIdTouched = false;

  host.innerHTML = `
    <div class="image-library-layout">
      <section class="image-insert-picker" aria-label="Checkboxes">
        <p class="label mb-2">Checkboxes</p>
        ${renderListSearchBar({ id: 'checkbox-search', placeholder: 'Search checkboxes...', className: 'mb-3' })}
        <div data-item-table-host class="image-picker-list"></div>
      </section>
      <section class="image-insert-upload" aria-label="Add checkbox">
        <p class="label mb-2">Add checkbox</p>
        <div data-add-form-host class="space-y-4"></div>
      </section>
      <div data-item-detail-host class="image-library-detail-row"></div>
    </div>
  `;

  const tableHost = host.querySelector('[data-item-table-host]') as HTMLElement;
  const detailHost = host.querySelector('[data-item-detail-host]') as HTMLElement;
  const addFormHost = host.querySelector('[data-add-form-host]') as HTMLElement;

  const captureNewCheckboxDraft = () => {
    const labelInput = addFormHost.querySelector('[data-new-checkbox-label]') as HTMLInputElement | null;
    const idInput = addFormHost.querySelector('[data-new-checkbox-id]') as HTMLInputElement | null;
    const parentSelect = addFormHost.querySelector('[data-new-checkbox-parent]') as HTMLSelectElement | null;
    if (labelInput) newCheckboxDraft.label = labelInput.value;
    if (idInput) newCheckboxDraft.id = idInput.value;
    if (parentSelect) newCheckboxDraft.parentId = parentSelect.value;
  };

  const renderAddForm = (parentOptions: ManagedCheckbox[], progressBars: ProgressBar[]) => {
    addFormHost.innerHTML = `
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">
          <span class="label">Label</span>
          <input
            type="text"
            class="input"
            data-new-checkbox-label
            value="${escapeHtml(newCheckboxDraft.label)}"
            placeholder="e.g. Defeat the boss"
          />
        </label>
        <label class="block">
          <span class="label">Checkbox id</span>
          <input
            type="text"
            class="input"
            data-new-checkbox-id
            value="${escapeHtml(newCheckboxDraft.id)}"
            placeholder="e.g. defeat-boss"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          />
          <p class="hint mt-1">Lowercase letters, numbers, and hyphens only.</p>
        </label>
        <label class="block sm:col-span-2">
          <span class="label">Parent checkbox</span>
          <select class="input" data-new-checkbox-parent>
            <option value=""${newCheckboxDraft.parentId ? '' : ' selected'}>None (top-level)</option>
            ${parentOptions
              .map(
                (entry) =>
                  `<option value="${entry.id}"${entry.id === newCheckboxDraft.parentId ? ' selected' : ''}>${escapeHtml(entry.label || entry.id)}</option>`,
              )
              .join('')}
          </select>
        </label>
      </div>
      ${renderNewCheckboxProgressSection(progressBars, newCheckboxDraft.tagIds)}
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-primary" data-action="add-checkbox">${iconLabel('plus', 'Add checkbox')}</button>
      </div>
      <p data-role="add-checkbox-error" class="text-sm text-red-400 hidden"></p>
    `;
  };

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
    detailHost.querySelectorAll('[data-checkbox-label]').forEach((input) => {
      const checkboxId = (input as HTMLElement).dataset.checkboxLabel;
      const checkbox = checkboxes.find((cb) => cb.id === checkboxId);
      if (checkbox) checkbox.label = (input as HTMLInputElement).value;
    });

    detailHost.querySelectorAll('[data-checkbox-parent]').forEach((select) => {
      const checkboxId = (select as HTMLElement).dataset.checkboxParent;
      const checkbox = checkboxes.find((cb) => cb.id === checkboxId);
      if (!checkbox) return;
      checkbox.parentId = (select as HTMLSelectElement).value || null;
    });

    detailHost.querySelectorAll('[data-checkbox-id-field]').forEach((input) => {
      const checkboxId = (input as HTMLElement).dataset.checkboxIdField;
      if (!checkboxId) return;
      pendingIdValues.set(checkboxId, (input as HTMLInputElement).value);
    });
  };

  const isEditingDetail = (): boolean => {
    const active = document.activeElement;
    if (!active || !detailHost.contains(active)) return false;
    if (active instanceof HTMLSelectElement) return false;
    return active.matches('input:not([type="checkbox"]), textarea');
  };

  const render = () => {
    if (isEditingDetail()) return;

    captureNewCheckboxDraft();
    syncFromDom();
    const progressBars = getProgressBars().tags;

    if (selectedId && !checkboxes.some((cb) => cb.id === selectedId)) {
      selectedId = null;
    }

    tableHost.innerHTML = renderEditorItemTable(
      checkboxes.map((checkbox) => ({
        id: checkbox.id,
        primary: renderCheckboxTablePrimary(checkbox, checkboxes),
        searchText: buildCheckboxSearchText(checkbox, checkboxes, progressBars),
      })),
      {
        emptyMessage: 'No checkboxes yet. Add one on the right.',
        selectedId,
        rowAction: 'select-checkbox',
        primaryHeader: 'Checkbox',
      },
    );

    renderAddForm(checkboxes, progressBars);

    if (selectedId) {
      const checkbox = checkboxes.find((cb) => cb.id === selectedId);
      detailHost.innerHTML = checkbox
        ? renderCheckboxDetailPanel(
            checkbox,
            checkboxes,
            progressBars,
            pendingIdValues.get(checkbox.id) ?? checkbox.id,
          )
        : '';
    } else {
      detailHost.innerHTML = '';
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
  };

  const wireStaticActions = () => {
    const errorEl = addFormHost.querySelector('[data-role="add-checkbox-error"]') as HTMLElement | null;
    const labelInput = addFormHost.querySelector('[data-new-checkbox-label]') as HTMLInputElement | null;
    const idInput = addFormHost.querySelector('[data-new-checkbox-id]') as HTMLInputElement | null;
    const parentSelect = addFormHost.querySelector('[data-new-checkbox-parent]') as HTMLSelectElement | null;

    const showAddError = (message: string) => {
      if (!errorEl) return;
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    };

    const clearAddError = () => {
      if (!errorEl) return;
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
    };

    const maybeSuggestNewCheckboxId = () => {
      if (!labelInput || !idInput || newCheckboxIdTouched || idInput.value.trim()) return;
      const label = labelInput.value.trim();
      if (!label) return;
      const existingIds = new Set(checkboxes.map((cb) => cb.id));
      idInput.value = slugifyCheckboxId(label, existingIds);
      newCheckboxDraft.id = idInput.value;
    };

    labelInput?.addEventListener('input', () => {
      newCheckboxDraft.label = labelInput.value;
      clearAddError();
    });
    labelInput?.addEventListener('blur', maybeSuggestNewCheckboxId);

    idInput?.addEventListener('input', () => {
      newCheckboxIdTouched = true;
      newCheckboxDraft.id = idInput.value;
      clearAddError();
    });

    parentSelect?.addEventListener('change', () => {
      newCheckboxDraft.parentId = parentSelect.value;
    });

    addFormHost.querySelector('[data-action="add-new-tag"]')?.addEventListener('change', (event) => {
      const select = event.currentTarget as HTMLSelectElement;
      const tagId = select.value;
      if (!tagId || newCheckboxDraft.tagIds.includes(tagId)) return;
      newCheckboxDraft.tagIds.push(tagId);
      render();
    });

    addFormHost.querySelectorAll('[data-action="remove-new-tag"]').forEach((button) => {
      button.addEventListener('click', () => {
        const tagId = (button as HTMLElement).dataset.tagId;
        if (!tagId) return;
        newCheckboxDraft.tagIds = newCheckboxDraft.tagIds.filter((id) => id !== tagId);
        render();
      });
    });

    addFormHost.querySelector('[data-action="add-checkbox"]')?.addEventListener('click', () => {
      clearAddError();

      const label = labelInput?.value.trim() ?? '';
      const id = idInput?.value.trim() ?? '';
      const parentId = parentSelect?.value || null;
      if (!label || !id) {
        showAddError('Enter a checkbox label and id.');
        return;
      }
      if (!SLUG_ID_PATTERN.test(id)) {
        showAddError('Checkbox id must use lowercase letters, numbers, and hyphens.');
        idInput?.focus();
        return;
      }
      if (checkboxes.some((cb) => cb.id === id)) {
        showAddError('A checkbox with that id already exists.');
        idInput?.focus();
        return;
      }

      checkboxes.push({
        id,
        label,
        parentId,
        tagIds: [...newCheckboxDraft.tagIds],
      });
      selectedId = id;
      newCheckboxDraft = { label: '', id: '', parentId: '', tagIds: [] };
      newCheckboxIdTouched = false;
      render();
    });

    tableHost.querySelectorAll('[data-action="select-checkbox"]').forEach((row) => {
      const element = row as HTMLElement;
      const handler = () => {
        const id = element.dataset.itemId;
        if (!id) return;
        selectedId = selectedId === id ? null : id;
        render();
      };
      element.addEventListener('click', handler);
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handler();
        }
      });
    });

    detailHost.querySelectorAll('[data-action="remove-checkbox"]').forEach((button) => {
      button.addEventListener('click', () => {
        const checkboxId = (button as HTMLElement).dataset.checkboxId;
        if (!checkboxId) return;
        if (selectedId === checkboxId) selectedId = null;
        pendingIdValues.delete(checkboxId);
        checkboxes = checkboxes
          .filter((cb) => cb.id !== checkboxId)
          .map((cb) => ({
            ...cb,
            parentId: cb.parentId === checkboxId ? null : cb.parentId,
          }));
        render();
      });
    });

    detailHost.querySelectorAll('[data-action="insert-marker"]').forEach((button) => {
      button.addEventListener('click', () => {
        const checkboxId = (button as HTMLElement).dataset.checkboxId;
        const checkbox = checkboxes.find((cb) => cb.id === checkboxId);
        if (!checkbox) return;
        editor.insertLine(buildCheckboxMarker(checkbox.id, checkbox.label || 'Label'));
      });
    });

    detailHost.querySelectorAll('[data-checkbox-id-field]').forEach((input) => {
      input.addEventListener('change', () => {
        const oldId = (input as HTMLElement).dataset.checkboxIdField;
        const newId = (input as HTMLInputElement).value.trim();
        const checkbox = checkboxes.find((cb) => cb.id === oldId);
        if (!checkbox || !newId || newId === oldId) return;
        if (checkboxes.some((cb) => cb.id === newId)) return;

        if (selectedId === oldId) selectedId = newId;
        pendingIdValues.delete(oldId);

        checkboxes.forEach((cb) => {
          if (cb.parentId === oldId) cb.parentId = newId;
        });
        checkbox.id = newId;
        render();
      });
    });

    detailHost.querySelectorAll('[data-checkbox-label]').forEach((input) => {
      input.addEventListener('input', () => {
        const checkboxId = (input as HTMLElement).dataset.checkboxLabel;
        const checkbox = checkboxes.find((cb) => cb.id === checkboxId);
        if (checkbox) checkbox.label = (input as HTMLInputElement).value;
      });
      input.addEventListener('blur', () => render());
    });

    detailHost.querySelectorAll('[data-checkbox-parent]').forEach((select) => {
      select.addEventListener('change', () => {
        const checkboxId = (select as HTMLElement).dataset.checkboxParent;
        const checkbox = checkboxes.find((cb) => cb.id === checkboxId);
        if (!checkbox) return;
        const value = (select as HTMLSelectElement).value;
        checkbox.parentId = value || null;
        render();
      });
    });

    detailHost.querySelectorAll('[data-action="add-tag"]').forEach((select) => {
      select.addEventListener('change', () => {
        const checkboxId = (select as HTMLElement).dataset.checkboxId;
        const tagId = (select as HTMLSelectElement).value;
        const checkbox = checkboxes.find((cb) => cb.id === checkboxId);
        if (!checkbox || !tagId || checkbox.tagIds.includes(tagId)) return;
        checkbox.tagIds.push(tagId);
        render();
      });
    });

    detailHost.querySelectorAll('[data-action="remove-tag"]').forEach((button) => {
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
      });
      selectedId = checkbox.id;
      render();
      return true;
    },
    updateCheckbox: (id: string, updates: { id?: string; label?: string }) => {
      const checkbox = checkboxes.find((entry) => entry.id === id);
      if (!checkbox) return false;

      if (updates.label !== undefined) {
        checkbox.label = updates.label.trim();
      }

      const nextId = updates.id?.trim();
      if (nextId && nextId !== checkbox.id) {
        if (checkboxes.some((entry) => entry.id === nextId)) return false;

        const oldId = checkbox.id;
        if (selectedId === oldId) selectedId = nextId;
        pendingIdValues.delete(oldId);
        checkboxes.forEach((entry) => {
          if (entry.parentId === oldId) entry.parentId = nextId;
        });
        checkbox.id = nextId;
      }

      render();
      return true;
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
