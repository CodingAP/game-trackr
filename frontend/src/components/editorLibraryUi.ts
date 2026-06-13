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

export function renderEditorItemTable(
  items: EditorTableItem[],
  options: {
    emptyMessage: string;
    selectedId?: string | null;
    rowAction?: string;
    primaryHeader: string;
  },
): string {
  if (items.length === 0) {
    return `<p class="text-muted text-sm px-3 py-4">${escapeHtml(options.emptyMessage)}</p>`;
  }

  const rowAction = options.rowAction ?? 'select-item';

  return `
    <div class="image-picker-table-wrap">
      <table class="image-picker-table">
        <thead>
          <tr>
            <th scope="col">${escapeHtml(options.primaryHeader)}</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map((item) => {
              const selected = options.selectedId === item.id;
              return `
                <tr
                  tabindex="0"
                  role="button"
                  class="${selected ? 'is-selected' : ''}"
                  data-action="${escapeHtml(rowAction)}"
                  data-item-id="${escapeHtml(item.id)}"
                  data-search-text="${escapeHtml(item.searchText)}"
                  title="${escapeHtml(item.primary)}"
                  aria-pressed="${selected ? 'true' : 'false'}"
                >
                  <td class="image-picker-table-name">${escapeHtml(item.primary)}</td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}
