import { icon } from './icons.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export interface EditorTableItem {
  id: string;
  primary: string;
  searchText: string;
}

export interface EditorSplitLayoutOptions {
  listTitle: string;
  listLabel: string;
  detailLabel: string;
  addAction: string;
  addLabel: string;
  searchHtml?: string;
  listHeaderExtraHtml?: string;
}

export function resolveEditorSelection(
  items: { id: string }[],
  selectedId: string | null,
): string | null {
  if (items.length === 0) return null;
  if (selectedId && items.some((item) => item.id === selectedId)) return selectedId;
  return items[0].id;
}

export function resolveEditorUrlSelection(
  items: { url: string }[],
  selectedUrl: string | null,
): string | null {
  if (items.length === 0) return null;
  if (selectedUrl && items.some((item) => item.url === selectedUrl)) return selectedUrl;
  return items[0].url;
}

export function renderEditorListHeader(
  title: string,
  addAction: string,
  addLabel: string,
  extraActionsHtml = '',
): string {
  return `
    <div class="editor-split-list-header">
      <span class="label">${escapeHtml(title)}</span>
      <div class="editor-split-list-actions">
        ${extraActionsHtml}
        <button
          type="button"
          class="editor-split-add"
          data-action="${escapeHtml(addAction)}"
          aria-label="${escapeHtml(addLabel)}"
        >
          ${icon('plus', 'ui-icon ui-icon-sm')}
        </button>
      </div>
    </div>
  `;
}

export function renderEditorSplitLayout(options: EditorSplitLayoutOptions): string {
  return `
    <div class="editor-split-layout">
      <section class="editor-split-list" aria-label="${escapeHtml(options.listLabel)}">
        ${options.searchHtml ?? ''}
        ${renderEditorListHeader(
          options.listTitle,
          options.addAction,
          options.addLabel,
          options.listHeaderExtraHtml,
        )}
        <div data-item-table-host class="image-picker-list"></div>
      </section>
      <section class="editor-split-detail" aria-label="${escapeHtml(options.detailLabel)}">
        <div data-item-detail-host class="editor-split-detail-body"></div>
      </section>
    </div>
  `;
}

export function renderEditorDetailPlaceholder(message: string): string {
  return `<p class="editor-split-detail-empty text-muted text-sm">${escapeHtml(message)}</p>`;
}

export function renderEditorItemTable(
  items: EditorTableItem[],
  options: {
    emptyMessage: string;
    selectedId?: string | null;
    rowAction?: string;
    primaryHeader: string;
    removeAction?: string;
  },
): string {
  if (items.length === 0) {
    return `<p class="text-muted text-sm px-3 py-4">${escapeHtml(options.emptyMessage)}</p>`;
  }

  const rowAction = options.rowAction ?? 'select-item';
  const removeAction = options.removeAction;

  return `
    <div class="image-picker-table-wrap">
      <table class="image-picker-table">
        <thead>
          <tr>
            <th scope="col">${escapeHtml(options.primaryHeader)}</th>
            ${removeAction ? '<th scope="col" class="image-picker-table-actions" aria-label="Actions"></th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${items
            .map((item) => {
              const selected = options.selectedId === item.id;
              return `
                <tr
                  tabindex="${selected ? '0' : '-1'}"
                  role="button"
                  class="${selected ? 'is-selected' : ''}"
                  data-action="${escapeHtml(rowAction)}"
                  data-item-id="${escapeHtml(item.id)}"
                  data-search-text="${escapeHtml(item.searchText)}"
                  title="${escapeHtml(item.primary)}"
                  aria-selected="${selected ? 'true' : 'false'}"
                >
                  <td class="image-picker-table-name">${escapeHtml(item.primary)}</td>
                  ${
                    removeAction
                      ? `
                        <td class="image-picker-table-actions">
                          <button
                            type="button"
                            class="editor-item-table-remove"
                            data-item-remove
                            data-action="${escapeHtml(removeAction)}"
                            data-item-id="${escapeHtml(item.id)}"
                            aria-label="Remove ${escapeHtml(item.primary)}"
                            tabindex="${selected ? '0' : '-1'}"
                          >
                            ${icon('trash', 'ui-icon ui-icon-sm')}
                          </button>
                        </td>
                      `
                      : ''
                  }
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

export function wireEditorItemTable(
  tableHost: HTMLElement | null,
  options: {
    rowSelector: string;
    readKey: (row: HTMLElement) => string | undefined;
    isSelected: (key: string) => boolean;
    onSelect: (key: string) => void;
  },
): void {
  if (!tableHost) return;

  const visibleRows = (): HTMLElement[] =>
    [...tableHost.querySelectorAll<HTMLElement>(options.rowSelector)].filter((row) => !row.hidden);

  tableHost.querySelectorAll<HTMLElement>(options.rowSelector).forEach((row) => {
    const activate = () => {
      const key = options.readKey(row);
      if (!key || options.isSelected(key)) return;
      options.onSelect(key);
    };

    row.addEventListener('click', (event) => {
      if ((event.target as Element).closest('[data-item-remove]')) return;
      activate();
    });
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
        return;
      }

      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

      event.preventDefault();
      const rows = visibleRows();
      const index = rows.indexOf(row);
      if (index < 0) return;

      const nextIndex =
        event.key === 'ArrowDown'
          ? Math.min(index + 1, rows.length - 1)
          : Math.max(index - 1, 0);
      const nextRow = rows[nextIndex];
      if (!nextRow || nextRow === row) return;

      const key = options.readKey(nextRow);
      if (!key) return;
      options.onSelect(key);
      nextRow.focus();
    });
  });
}

export function wireEditorItemTableRemove(
  tableHost: HTMLElement | null,
  options: {
    buttonSelector: string;
    readKey: (button: HTMLElement) => string | undefined;
    onRemove: (key: string) => void;
  },
): void {
  if (!tableHost) return;

  tableHost.querySelectorAll<HTMLElement>(options.buttonSelector).forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const key = options.readKey(button);
      if (!key) return;
      options.onRemove(key);
    });
  });
}
