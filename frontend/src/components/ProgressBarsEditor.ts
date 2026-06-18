import { slugifyProgressBarId } from '../markdown/completionProgress.js';
import { createProgressBarFromName } from '../markdown/progressBars.js';
import {
  renderEditorItemTable,
  renderEditorSplitLayout,
  resolveEditorSelection,
  wireEditorItemTable,
  wireEditorItemTableRemove,
} from './editorLibraryUi.js';
import { renderListSearchBar, wireListSearch } from './listSearch.js';
import { readListScroll, restoreListScroll } from '../utils/scrollList.js';
import { iconLabel } from './icons.js';
import type { ProgressBar, ProgressBarsData } from '../types/index.js';

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
        <span class="label">Progress bar name</span>
        <input type="text" class="input" data-progress-bar-name="${bar.id}" value="${escapeHtml(bar.name)}" placeholder="e.g. Complete World 1" />
      </label>
      <p class="hint mb-3">Embed id: <code>[[pb:${escapeHtml(bar.id)}]]</code></p>
      <label class="settings-check mb-3">
        <input type="checkbox" data-show-in-summary="${bar.id}" ${bar.showInSummary ? 'checked' : ''} />
        <span>Show in summary</span>
      </label>
      <p class="hint mb-4">The embed id updates automatically when you rename this progress bar.</p>
    </div>
  `;
}

export function mountProgressBarsEditor(
  host: HTMLElement,
  initial: ProgressBarsData,
  options: {
    onProgressBarsChanged?: () => void;
  } = {},
): {
  getData: () => ProgressBarsData;
  addProgressBar: (name: string) => ProgressBar;
  registerProgressBar: (bar: ProgressBar) => void;
  updateProgressBar: (id: string, updates: { name?: string; id?: string }) => string | false;
  cleanup: () => void;
} {
  let bars: ProgressBar[] = structuredClone(initial.tags).map((bar) => ({
    id: bar.id,
    name: bar.name,
    showInSummary: bar.showInSummary ?? false,
  }));
  let selectedId: string | null = resolveEditorSelection(bars, null);
  let showAddPanel = bars.length === 0;
  let searchQuery = '';
  let cleanupSearch = () => {};

  host.innerHTML = renderEditorSplitLayout({
    listTitle: 'Progress bars',
    listLabel: 'Progress bars',
    detailLabel: 'Progress bar details',
    addAction: 'add-progress-bar',
    addLabel: 'Add progress bar',
    searchHtml: renderListSearchBar({
      id: 'progress-bar-search',
      placeholder: 'Search progress bars...',
      className: 'mb-3',
    }),
  });

  const tableHost = host.querySelector('[data-item-table-host]') as HTMLElement;
  const detailHost = host.querySelector('[data-item-detail-host]') as HTMLElement;
  detailHost.innerHTML = `
    <div data-progress-bar-add-panel class="image-library-detail panel${showAddPanel ? '' : ' hidden'}">
      <p class="label mb-3">Add progress bar</p>
      <label class="block mb-3">
        <span class="label">Progress bar name</span>
        <input
          type="text"
          data-field="new-progress-bar-name"
          class="input"
          placeholder="e.g. Complete World 1"
        />
      </label>
      <p class="hint mb-3">The embed id is generated from the name.</p>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-primary" data-action="confirm-add-progress-bar">${iconLabel('plus', 'Add progress bar')}</button>
        <button type="button" class="btn-secondary" data-action="cancel-add-progress-bar">${iconLabel('close', 'Cancel')}</button>
      </div>
    </div>
    <div data-progress-bar-edit-host class="min-w-0"></div>
    <p data-progress-bar-detail-placeholder class="editor-split-detail-empty text-muted text-sm hidden">
      No progress bars yet. Click + to add one.
    </p>
  `;

  const addPanel = detailHost.querySelector('[data-progress-bar-add-panel]') as HTMLElement;
  const editHost = detailHost.querySelector('[data-progress-bar-edit-host]') as HTMLElement;
  const detailPlaceholder = detailHost.querySelector(
    '[data-progress-bar-detail-placeholder]',
  ) as HTMLElement;
  const newNameInput = addPanel.querySelector(
    '[data-field="new-progress-bar-name"]',
  ) as HTMLInputElement;

  const syncFromDom = () => {
    editHost.querySelectorAll('[data-progress-bar-name]').forEach((input) => {
      const barId = (input as HTMLElement).dataset.progressBarName;
      const bar = bars.find((entry) => entry.id === barId);
      if (bar) bar.name = (input as HTMLInputElement).value;
    });

    editHost.querySelectorAll('[data-show-in-summary]').forEach((input) => {
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

  const scrollSelectedRowIntoView = () => {
    requestAnimationFrame(() => {
      tableHost.querySelector<HTMLElement>('tr.is-selected')?.scrollIntoView({ block: 'nearest' });
    });
  };

  const render = () => {
    if (isEditingDetail()) return;

    syncFromDom();
    if (!showAddPanel) {
      selectedId = resolveEditorSelection(bars, selectedId);
    }

    const listScrollTop = readListScroll(tableHost);

    tableHost.innerHTML = renderEditorItemTable(
      bars.map((bar) => ({
        id: bar.id,
        primary: bar.name.trim() || 'Untitled progress bar',
        searchText: `${bar.name} ${bar.id}`,
      })),
      {
        emptyMessage: 'No progress bars yet. Click + to add one.',
        selectedId: showAddPanel ? null : selectedId,
        rowAction: 'select-progress-bar',
        primaryHeader: 'Name',
        removeAction: 'remove-progress-bar',
      },
    );

    if (showAddPanel) {
      addPanel.classList.remove('hidden');
      editHost.innerHTML = '';
      editHost.classList.add('hidden');
      detailPlaceholder.classList.add('hidden');
    } else if (selectedId) {
      const bar = bars.find((entry) => entry.id === selectedId);
      if (bar) {
        addPanel.classList.add('hidden');
        editHost.classList.remove('hidden');
        editHost.innerHTML = renderProgressBarDetailPanel(bar);
        detailPlaceholder.classList.add('hidden');
      } else {
        addPanel.classList.add('hidden');
        editHost.innerHTML = '';
        editHost.classList.add('hidden');
        detailPlaceholder.textContent = 'Select a progress bar from the list.';
        detailPlaceholder.classList.remove('hidden');
      }
    } else {
      addPanel.classList.add('hidden');
      editHost.innerHTML = '';
      editHost.classList.add('hidden');
      detailPlaceholder.textContent = 'No progress bars yet. Click + to add one.';
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
    options.onProgressBarsChanged?.();
    restoreListScroll(tableHost, listScrollTop);
  };

  const wireStaticActions = () => {
    wireEditorItemTable(tableHost, {
      rowSelector: '[data-action="select-progress-bar"]',
      readKey: (row) => row.dataset.itemId,
      isSelected: (id) => !showAddPanel && id === selectedId,
      onSelect: (id) => {
        showAddPanel = false;
        selectedId = id;
        render();
      },
    });

    wireEditorItemTableRemove(tableHost, {
      buttonSelector: '[data-action="remove-progress-bar"]',
      readKey: (button) => button.dataset.itemId,
      onRemove: (barId) => {
        bars = bars.filter((bar) => bar.id !== barId);
        selectedId = resolveEditorSelection(bars, selectedId);
        if (bars.length === 0) showAddPanel = true;
        render();
      },
    });

    editHost.querySelectorAll('[data-progress-bar-name]').forEach((input) => {
      input.addEventListener('input', () => {
        const barId = (input as HTMLElement).dataset.progressBarName;
        const bar = bars.find((entry) => entry.id === barId);
        if (bar) bar.name = (input as HTMLInputElement).value;
      });
      input.addEventListener('blur', () => {
        const barId = (input as HTMLElement).dataset.progressBarName;
        if (!barId) return;
        commitProgressBarUpdate(barId, { name: (input as HTMLInputElement).value.trim() });
      });
    });

    editHost.querySelectorAll('[data-show-in-summary]').forEach((input) => {
      input.addEventListener('change', () => {
        const barId = (input as HTMLElement).dataset.showInSummary;
        const bar = bars.find((entry) => entry.id === barId);
        if (bar) bar.showInSummary = (input as HTMLInputElement).checked;
      });
    });
  };

  const commitProgressBarUpdate = (
    id: string,
    updates: { name?: string; id?: string },
  ): string | false => {
    const bar = bars.find((entry) => entry.id === id);
    if (!bar) return false;

    if (updates.name !== undefined) {
      bar.name = updates.name.trim();
    }

    const explicitId = updates.id?.trim();
    const nameForId = bar.name.trim();
    const derivedId = nameForId
      ? slugifyProgressBarId(
          nameForId,
          new Set(bars.filter((entry) => entry.id !== bar.id).map((entry) => entry.id)),
        )
      : bar.id;
    const nextId = explicitId && explicitId !== bar.id ? explicitId : derivedId;

    if (nextId !== bar.id) {
      if (bars.some((entry) => entry.id === nextId)) return false;
      if (selectedId === bar.id) selectedId = nextId;
      bar.id = nextId;
    }

    render();
    return bar.id;
  };

  const confirmAddProgressBar = () => {
    const name = newNameInput.value.trim();
    if (!name) {
      newNameInput.focus();
      return;
    }

    const bar = createProgressBarFromName(name, bars);
    bars.push(bar);
    selectedId = bar.id;
    showAddPanel = false;
    newNameInput.value = '';
    render();
    scrollSelectedRowIntoView();
  };

  host.querySelector('[data-action="add-progress-bar"]')?.addEventListener('click', () => {
    showAddPanel = true;
    render();
    newNameInput.focus();
  });

  addPanel.querySelector('[data-action="confirm-add-progress-bar"]')?.addEventListener('click', confirmAddProgressBar);
  addPanel.querySelector('[data-action="cancel-add-progress-bar"]')?.addEventListener('click', () => {
    showAddPanel = false;
    newNameInput.value = '';
    render();
  });
  newNameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      confirmAddProgressBar();
    }
  });

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
      showAddPanel = false;
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
      showAddPanel = false;
      render();
    },
    updateProgressBar: commitProgressBarUpdate,
    cleanup: () => {
      cleanupSearch();
    },
  };
}
