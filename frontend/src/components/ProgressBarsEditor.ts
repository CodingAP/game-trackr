import { buildProgressBarMarker, slugifyProgressBarId } from '../markdown/completionProgress.js';
import { createProgressBarFromName } from '../markdown/progressBars.js';
import { SLUG_ID_PATTERN } from '../markdown/managedCheckboxes.js';
import { renderCollapsiblePanel, wireCollapsiblePanels } from './CollapsiblePanel.js';
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
  const expandedBars = new Set<string>();
  let searchQuery = '';
  let cleanupSearch = () => {};

  const existingIds = () => new Set(bars.map((bar) => bar.id));

  const syncFromDom = () => {
    host.querySelectorAll('[data-progress-bar-name]').forEach((input) => {
      const barId = (input as HTMLElement).dataset.progressBarName;
      const bar = bars.find((entry) => entry.id === barId);
      if (bar) bar.name = (input as HTMLInputElement).value;
    });

    host.querySelectorAll('[data-progress-bar-id-input]').forEach((input) => {
      const barId = (input as HTMLElement).dataset.progressBarIdInput;
      const bar = bars.find((entry) => entry.id === barId);
      if (bar) bar.id = (input as HTMLInputElement).value;
    });

    host.querySelectorAll('[data-show-in-summary]').forEach((input) => {
      const barId = (input as HTMLElement).dataset.showInSummary;
      const bar = bars.find((entry) => entry.id === barId);
      if (bar) bar.showInSummary = (input as HTMLInputElement).checked;
    });
  };

  const render = () => {
    syncFromDom();
    host.innerHTML = `
      ${bars.length > 0 ? renderListSearchBar({ id: 'progress-bar-search', placeholder: 'Search progress bars...' }) : ''}
      <div class="space-y-2">
        ${
          bars.length === 0
            ? '<p class="text-faint text-sm">No progress bars yet.</p>'
            : bars
                .map((bar) => {
                  const barTitle = bar.name.trim() || 'Untitled progress bar';

                  const barBody = `
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
                      <p class="hint">Embeds use <code>[[pb:${escapeHtml(bar.id)}]]</code>. Renaming the label does not break existing embeds.</p>
                  `;

                  const titleActions = `
                    <button type="button" class="btn-secondary" data-action="insert-progress" data-progress-bar-id="${bar.id}" aria-label="Insert progress bar in content">
                      ${icon('progress', 'ui-icon ui-icon-sm')}
                    </button>
                    <button type="button" class="btn-secondary" data-action="remove-progress-bar" data-progress-bar-id="${bar.id}" aria-label="Remove progress bar">
                      ${icon('trash', 'ui-icon ui-icon-sm')}
                    </button>
                  `;

                  return renderCollapsiblePanel({
                    title: barTitle,
                    titleActions,
                    className: 'progress-bar-card',
                    defaultOpen: expandedBars.has(bar.id),
                    attributes: {
                      'progress-bar-id': bar.id,
                      'search-text': `${bar.name} ${bar.id}`,
                    },
                    content: barBody,
                  });
                })
                .join('')
        }
      </div>
      <div class="mt-4">
        <button type="button" class="btn-secondary" data-action="add-progress-bar">${iconLabel('progress', 'Add progress bar')}</button>
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
    options.onProgressBarsChanged?.();
  };

  const wireStaticActions = () => {
    host.querySelectorAll('[data-action="add-progress-bar"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        bars.push(createProgressBarFromName('', bars));
        render();
      });
    });

    host.querySelectorAll('[data-action="remove-progress-bar"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const barId = (button as HTMLElement).dataset.progressBarId;
        bars = bars.filter((bar) => bar.id !== barId);
        expandedBars.delete(barId ?? '');
        render();
      });
    });

    host.querySelectorAll('[data-action="insert-progress"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const barId = (button as HTMLElement).dataset.progressBarId;
        const bar = bars.find((entry) => entry.id === barId);
        if (!bar) return;
        editor.insertLine(buildProgressBarMarker(bar));
      });
    });

    host.querySelectorAll('[data-progress-bar-name]').forEach((input) => {
      input.addEventListener('input', () => {
        const barId = (input as HTMLElement).dataset.progressBarName;
        const bar = bars.find((entry) => entry.id === barId);
        if (bar) bar.name = (input as HTMLInputElement).value;
      });
      input.addEventListener('blur', () => {
        const barId = (input as HTMLElement).dataset.progressBarName;
        const bar = bars.find((entry) => entry.id === barId);
        const idInput = host.querySelector(
          `[data-progress-bar-id-input="${barId}"]`,
        ) as HTMLInputElement | null;
        if (!bar || !idInput || idInput.dataset.idTouched === 'true') return;
        const label = (input as HTMLInputElement).value.trim();
        if (!label || SLUG_ID_PATTERN.test(bar.id)) return;
        const nextId = slugifyProgressBarId(label, existingIds());
        if (nextId === bar.id) return;
        bar.id = nextId;
        idInput.value = nextId;
      });
    });

    host.querySelectorAll('[data-progress-bar-id-input]').forEach((input) => {
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
        expandedBars.delete(oldId);
        expandedBars.add(nextId);
        render();
      });
    });

    host.querySelectorAll('[data-show-in-summary]').forEach((input) => {
      input.addEventListener('change', () => {
        const barId = (input as HTMLElement).dataset.showInSummary;
        const bar = bars.find((entry) => entry.id === barId);
        if (bar) bar.showInSummary = (input as HTMLInputElement).checked;
      });
    });
  };

  const cleanupCollapsible = wireCollapsiblePanels(host, {
    onToggle: (panel, expanded) => {
      const barId = panel.dataset.progressBarId;
      if (!barId) return;
      if (expanded) expandedBars.add(barId);
      else expandedBars.delete(barId);
    },
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
      expandedBars.add(bar.id);
      render();
    },
    updateProgressBar: (id: string, updates: { name?: string; id?: string }) => {
      const bar = bars.find((entry) => entry.id === id);
      if (!bar) return;
      if (updates.id !== undefined && updates.id !== id) {
        bar.id = updates.id;
        expandedBars.delete(id);
        expandedBars.add(updates.id);
      }
      if (updates.name !== undefined) {
        bar.name = updates.name;
      }
      render();
    },
    cleanup: () => {
      cleanupSearch();
      cleanupCollapsible();
    },
  };
}
