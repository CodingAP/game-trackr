import { buildProgressBarMarker, slugifyProgressBarId } from '../markdown/completionProgress.js';
import { createProgressBarFromName } from '../markdown/progressBars.js';
import { SLUG_ID_PATTERN } from '../markdown/managedCheckboxes.js';
import { renderEditorItemTable } from './editorLibraryUi.js';
import { renderListSearchBar, wireListSearch } from './listSearch.js';
import { icon, iconLabel } from './icons.js';
import type { ProgressBar, ProgressBarsData } from '../types/index.js';
import type { MarkdownEditorHandle } from '../types/markdownEditor.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderProgressBarDetailPanel(bar: ProgressBar): string {
  return `
    <div class="image-library-detail panel" data-item-detail data-progress-bar-id="${escapeHtml(bar.id)}">
      <div class="mb-3">
        <p class="label mb-1">Selected progress bar</p>
        <p class="text-sm font-medium text-strong">${escapeHtml(bar.name.trim() || 'Untitled progress bar')}</p>
      </div>
      <label class="block mb-3">
        <span class="label">Progress bar id</span>
        <input
          type="text"
          class="input"
          data-progress-bar-id-input="${bar.id}"
          value="${escapeHtml(bar.id)}"
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
        />
      </label>
      <label class="block mb-3">
        <span class="label">Progress bar name</span>
        <input type="text" class="input" data-progress-bar-name="${bar.id}" value="${escapeHtml(bar.name)}" placeholder="e.g. Complete World 1" />
      </label>
      <label class="settings-check mb-3">
        <input type="checkbox" data-show-in-summary="${bar.id}" ${bar.showInSummary ? 'checked' : ''} />
        <span>Show in summary</span>
      </label>
      <p class="hint mb-4">Embeds use <code>[[pb:${escapeHtml(bar.id)}]]</code>. Renaming the label does not break existing embeds.</p>
      <div class="image-edit-form-actions flex flex-wrap gap-2">
        <button type="button" class="btn-secondary" data-action="insert-progress" data-progress-bar-id="${bar.id}">${iconLabel('progress', 'Insert into content')}</button>
        <button type="button" class="btn-secondary" data-action="remove-progress-bar" data-progress-bar-id="${bar.id}">${iconLabel('trash', 'Remove progress bar')}</button>
      </div>
    </div>
  `;
}

export function mountProgressBarsEditor(
  host: HTMLElement,
  editor: MarkdownEditorHandle,
  initial: ProgressBarsData,
  options: {
    onProgressBarIdChange?: (oldId: string, newId: string) => void;
    onProgressBarsChanged?: () => void;
  } = {},
): {
  getData: () => ProgressBarsData;
  addProgressBar: (name: string) => ProgressBar;
  registerProgressBar: (bar: ProgressBar) => void;
  updateProgressBar: (id: string, updates: { name?: string; id?: string }) => void;
  cleanup: () => void;
} {
  let bars: ProgressBar[] = structuredClone(initial.tags).map((bar) => ({
    id: bar.id,
    name: bar.name,
    showInSummary: bar.showInSummary ?? false,
  }));
  let selectedId: string | null = null;
  let searchQuery = '';
  let cleanupSearch = () => {};
  let newBarDraft = { name: '', id: '' };
  let newBarIdTouched = false;

  const existingIds = () => new Set(bars.map((bar) => bar.id));

  host.innerHTML = `
    <div class="image-library-layout">
      <section class="image-insert-picker" aria-label="Progress bars">
        <p class="label mb-2">Progress bars</p>
        ${renderListSearchBar({ id: 'progress-bar-search', placeholder: 'Search progress bars...', className: 'mb-3' })}
        <div data-item-table-host class="image-picker-list"></div>
      </section>
      <section class="image-insert-upload" aria-label="Add progress bar">
        <p class="label mb-2">Add progress bar</p>
        <div data-add-form-host class="space-y-4"></div>
      </section>
      <div data-item-detail-host class="image-library-detail-row"></div>
    </div>
  `;

  const tableHost = host.querySelector('[data-item-table-host]') as HTMLElement;
  const detailHost = host.querySelector('[data-item-detail-host]') as HTMLElement;
  const addFormHost = host.querySelector('[data-add-form-host]') as HTMLElement;

  const captureNewBarDraft = () => {
    const nameInput = addFormHost.querySelector('[data-new-progress-name]') as HTMLInputElement | null;
    const idInput = addFormHost.querySelector('[data-new-progress-id]') as HTMLInputElement | null;
    if (nameInput) newBarDraft.name = nameInput.value;
    if (idInput) newBarDraft.id = idInput.value;
  };

  const renderAddForm = () => {
    addFormHost.innerHTML = `
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">
          <span class="label">Progress bar name</span>
          <input
            type="text"
            class="input"
            data-new-progress-name
            value="${escapeHtml(newBarDraft.name)}"
            placeholder="e.g. Complete World 1"
          />
        </label>
        <label class="block">
          <span class="label">Progress bar id</span>
          <input
            type="text"
            class="input"
            data-new-progress-id
            value="${escapeHtml(newBarDraft.id)}"
            placeholder="e.g. complete-world-1"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          />
          <p class="hint mt-1">Lowercase letters, numbers, and hyphens only.</p>
        </label>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-primary" data-action="add-progress-bar">${iconLabel('plus', 'Add progress bar')}</button>
      </div>
      <p data-role="add-progress-error" class="text-sm text-red-400 hidden"></p>
    `;
  };

  const syncFromDom = () => {
    detailHost.querySelectorAll('[data-progress-bar-name]').forEach((input) => {
      const barId = (input as HTMLElement).dataset.progressBarName;
      const bar = bars.find((entry) => entry.id === barId);
      if (bar) bar.name = (input as HTMLInputElement).value;
    });

    detailHost.querySelectorAll('[data-progress-bar-id-input]').forEach((input) => {
      const barId = (input as HTMLElement).dataset.progressBarIdInput;
      const bar = bars.find((entry) => entry.id === barId);
      if (bar) bar.id = (input as HTMLInputElement).value;
    });

    detailHost.querySelectorAll('[data-show-in-summary]').forEach((input) => {
      const barId = (input as HTMLElement).dataset.showInSummary;
      const bar = bars.find((entry) => entry.id === barId);
      if (bar) bar.showInSummary = (input as HTMLInputElement).checked;
    });
  };

  const isEditingDetail = (): boolean => {
    const active = document.activeElement;
    if (!active || !detailHost.contains(active)) return false;
    return active.matches('input, select, textarea');
  };

  const render = () => {
    if (isEditingDetail()) return;

    captureNewBarDraft();
    syncFromDom();

    if (selectedId && !bars.some((bar) => bar.id === selectedId)) {
      selectedId = null;
    }

    tableHost.innerHTML = renderEditorItemTable(
      bars.map((bar) => ({
        id: bar.id,
        primary: bar.name.trim() || 'Untitled progress bar',
        searchText: `${bar.name} ${bar.id}`,
      })),
      {
        emptyMessage: 'No progress bars yet. Add one on the right.',
        selectedId,
        rowAction: 'select-progress-bar',
        primaryHeader: 'Name',
      },
    );

    renderAddForm();

    if (selectedId) {
      const bar = bars.find((entry) => entry.id === selectedId);
      detailHost.innerHTML = bar ? renderProgressBarDetailPanel(bar) : '';
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
    options.onProgressBarsChanged?.();
  };

  const wireStaticActions = () => {
    const errorEl = addFormHost.querySelector('[data-role="add-progress-error"]') as HTMLElement | null;
    const nameInput = addFormHost.querySelector('[data-new-progress-name]') as HTMLInputElement | null;
    const idInput = addFormHost.querySelector('[data-new-progress-id]') as HTMLInputElement | null;

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

    const maybeSuggestNewBarId = () => {
      if (!nameInput || !idInput || newBarIdTouched || idInput.value.trim()) return;
      const name = nameInput.value.trim();
      if (!name) return;
      idInput.value = slugifyProgressBarId(name, existingIds());
      newBarDraft.id = idInput.value;
    };

    nameInput?.addEventListener('input', () => {
      newBarDraft.name = nameInput.value;
      clearAddError();
    });
    nameInput?.addEventListener('blur', maybeSuggestNewBarId);

    idInput?.addEventListener('input', () => {
      newBarIdTouched = true;
      newBarDraft.id = idInput.value;
      clearAddError();
    });

    addFormHost.querySelector('[data-action="add-progress-bar"]')?.addEventListener('click', () => {
      clearAddError();

      const name = nameInput?.value.trim() ?? '';
      const id = idInput?.value.trim() ?? '';
      if (!name || !id) {
        showAddError('Enter a progress bar name and id.');
        return;
      }
      if (!SLUG_ID_PATTERN.test(id)) {
        showAddError('Progress bar id must use lowercase letters, numbers, and hyphens.');
        idInput?.focus();
        return;
      }
      if (bars.some((bar) => bar.id === id)) {
        showAddError('A progress bar with that id already exists.');
        idInput?.focus();
        return;
      }

      bars.push({ id, name, showInSummary: false });
      selectedId = id;
      newBarDraft = { name: '', id: '' };
      newBarIdTouched = false;
      render();
    });

    tableHost.querySelectorAll('[data-action="select-progress-bar"]').forEach((row) => {
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

    detailHost.querySelectorAll('[data-action="remove-progress-bar"]').forEach((button) => {
      button.addEventListener('click', () => {
        const barId = (button as HTMLElement).dataset.progressBarId;
        bars = bars.filter((bar) => bar.id !== barId);
        if (selectedId === barId) selectedId = null;
        render();
      });
    });

    detailHost.querySelectorAll('[data-action="insert-progress"]').forEach((button) => {
      button.addEventListener('click', () => {
        const barId = (button as HTMLElement).dataset.progressBarId;
        const bar = bars.find((entry) => entry.id === barId);
        if (!bar) return;
        editor.insertLine(buildProgressBarMarker(bar));
      });
    });

    detailHost.querySelectorAll('[data-progress-bar-name]').forEach((input) => {
      input.addEventListener('input', () => {
        const barId = (input as HTMLElement).dataset.progressBarName;
        const bar = bars.find((entry) => entry.id === barId);
        if (bar) bar.name = (input as HTMLInputElement).value;
      });
      input.addEventListener('blur', () => {
        const barId = (input as HTMLElement).dataset.progressBarName;
        const bar = bars.find((entry) => entry.id === barId);
        const idInputEl = detailHost.querySelector(
          `[data-progress-bar-id-input="${barId}"]`,
        ) as HTMLInputElement | null;
        if (!bar || !idInputEl || idInputEl.dataset.idTouched === 'true') {
          render();
          return;
        }
        const label = (input as HTMLInputElement).value.trim();
        if (!label || SLUG_ID_PATTERN.test(bar.id)) {
          render();
          return;
        }
        const nextId = slugifyProgressBarId(label, existingIds());
        if (nextId === bar.id) {
          render();
          return;
        }
        options.onProgressBarIdChange?.(bar.id, nextId);
        if (selectedId === bar.id) selectedId = nextId;
        bar.id = nextId;
        idInputEl.value = nextId;
        render();
      });
    });

    detailHost.querySelectorAll('[data-progress-bar-id-input]').forEach((input) => {
      input.addEventListener('input', () => {
        (input as HTMLElement).dataset.idTouched = 'true';
      });
      input.addEventListener('blur', () => {
        const oldId = (input as HTMLElement).dataset.progressBarIdInput;
        const bar = bars.find((entry) => entry.id === oldId);
        if (!bar) return;
        const nextId = (input as HTMLInputElement).value.trim();
        if (!nextId || nextId === oldId) {
          (input as HTMLInputElement).value = bar.id;
          return;
        }
        if (!SLUG_ID_PATTERN.test(nextId)) {
          (input as HTMLInputElement).value = bar.id;
          return;
        }
        if (bars.some((entry) => entry.id === nextId && entry !== bar)) {
          (input as HTMLInputElement).value = bar.id;
          return;
        }
        options.onProgressBarIdChange?.(oldId, nextId);
        bar.id = nextId;
        (input as HTMLElement).dataset.progressBarIdInput = nextId;
        if (selectedId === oldId) selectedId = nextId;
        render();
      });
    });

    detailHost.querySelectorAll('[data-show-in-summary]').forEach((input) => {
      input.addEventListener('change', () => {
        const barId = (input as HTMLElement).dataset.showInSummary;
        const bar = bars.find((entry) => entry.id === barId);
        if (bar) bar.showInSummary = (input as HTMLInputElement).checked;
      });
    });
  };

  render();

  return {
    getData: () => ({
      tags: bars.map((bar) => ({
        ...bar,
        name: bar.name.trim(),
        showInSummary: bar.showInSummary ?? false,
      })),
    }),
    addProgressBar: (name: string) => {
      const bar = createProgressBarFromName(name, bars);
      bars.push(bar);
      selectedId = bar.id;
      render();
      return bar;
    },
    registerProgressBar: (bar: ProgressBar) => {
      if (bars.some((entry) => entry.id === bar.id)) return;
      bars.push({
        id: bar.id,
        name: bar.name,
        showInSummary: bar.showInSummary ?? false,
      });
      selectedId = bar.id;
      render();
    },
    updateProgressBar: (id: string, updates: { name?: string; id?: string }) => {
      const bar = bars.find((entry) => entry.id === id);
      if (!bar) return;
      if (updates.id !== undefined && updates.id !== id) {
        bar.id = updates.id;
        if (selectedId === id) selectedId = updates.id;
      }
      if (updates.name !== undefined) {
        bar.name = updates.name;
      }
      render();
    },
    cleanup: () => {
      cleanupSearch();
    },
  };
}
