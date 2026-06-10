import type { FullJournalData, JournalPage } from '../types/index.js';
import type { MarkdownEditorHandle } from '../types/markdownEditor.js';
import { renderListSearchBar, wireListSearch } from './listSearch.js';
import { icon, iconLabel } from './icons.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function slugifyPageName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'page';
}

function uniquePageId(name: string, pages: JournalPage[]): string {
  const base = slugifyPageName(name);
  if (!pages.some((page) => page.id === base)) return base;

  let counter = 2;
  while (pages.some((page) => page.id === `${base}-${counter}`)) {
    counter += 1;
  }
  return `${base}-${counter}`;
}

export function mountPagesEditor(
  host: HTMLElement,
  editor: MarkdownEditorHandle,
  initial: FullJournalData,
): {
  getData: () => FullJournalData;
  getActivePageId: () => string;
  getAllContents: () => Record<string, string>;
    setPageContent: (pageId: string, content: string) => void;
    setAllContents: (contents: Record<string, string>) => void;
    getPageName: (pageId: string) => string;
    cleanup: () => void;
} {
  let pages = structuredClone(initial.pages).sort((a, b) => a.order - b.order);
  let contents = structuredClone(initial.contents);
  let activePageId = pages[0]?.id ?? 'main';
  let editingPageId: string | null = null;
  let searchQuery = '';
  let cleanupSearch = () => {};

  const persistActivePage = () => {
    if (activePageId) {
      contents[activePageId] = editor.getValue();
    }
  };

  const loadActivePage = () => {
    editor.setValue(contents[activePageId] ?? '', true);
  };

  const commitRename = (pageId: string, value: string) => {
    const page = pages.find((entry) => entry.id === pageId);
    if (!page) {
      editingPageId = null;
      return;
    }

    const name = value.trim() || 'Untitled page';
    page.name = name;

    const newId = uniquePageId(
      name,
      pages.filter((entry) => entry.id !== pageId),
    );
    if (newId !== pageId) {
      contents[newId] = contents[pageId] ?? '';
      delete contents[pageId];
      page.id = newId;
      if (activePageId === pageId) activePageId = newId;
      if (editingPageId === pageId) editingPageId = newId;
    }

    editingPageId = null;
  };

  const focusRenameInput = (pageId: string) => {
    queueMicrotask(() => {
      const input = host.querySelector(
        `[data-page-name="${pageId}"]`,
      ) as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  };

  const render = () => {
    host.innerHTML = `
      <div class="pages-sidebar-inner">
        <div class="pages-sidebar-header">
          <span class="label">Pages</span>
          <button type="button" class="btn-secondary text-xs" data-action="add-page">${iconLabel('plus', 'Add', 'ui-icon ui-icon-sm')}</button>
        </div>
        ${renderListSearchBar({ id: 'pages-search', placeholder: 'Search pages...', className: 'mb-2' })}
        <ul class="pages-sidebar-list" role="tablist" aria-label="Journal pages">
          ${pages
            .map((page) => {
              const isEditing = editingPageId === page.id;
              const nameMarkup = isEditing
                ? `<input
                    type="text"
                    class="pages-sidebar-name-input"
                    data-page-name="${page.id}"
                    value="${escapeHtml(page.name)}"
                    aria-label="Page name"
                  />`
                : `<span class="pages-sidebar-name" data-page-name-display="${page.id}">${escapeHtml(page.name)}</span>`;

              return `
                <li
                  class="pages-sidebar-item${page.id === activePageId ? ' is-active' : ''}"
                  role="presentation"
                  data-page-id="${page.id}"
                  data-search-text="${escapeHtml(`${page.name} ${page.id}`)}"
                >
                  <button
                    type="button"
                    class="pages-sidebar-select"
                    role="tab"
                    data-action="select-page"
                    data-page-id="${page.id}"
                    aria-selected="${page.id === activePageId}"
                  >
                    ${nameMarkup}
                  </button>
                  ${
                    pages.length > 1
                      ? `<button
                          type="button"
                          class="pages-sidebar-remove"
                          data-action="remove-page"
                          data-page-id="${page.id}"
                          aria-label="Remove ${escapeHtml(page.name)}"
                        >${icon('close', 'ui-icon ui-icon-sm')}</button>`
                      : ''
                  }
                </li>
              `;
            })
            .join('')}
        </ul>
      </div>
    `;

    host.querySelectorAll('[data-action="add-page"]').forEach((button) => {
      button.addEventListener('click', () => {
        persistActivePage();
        const name = `Page ${pages.length + 1}`;
        const id = uniquePageId(name, pages);
        pages.push({ id, name, order: pages.length });
        contents[id] = `# ${name}\n`;
        activePageId = id;
        editingPageId = null;
        render();
        loadActivePage();
      });
    });

    host.querySelectorAll('[data-action="select-page"]').forEach((button) => {
      button.addEventListener('click', () => {
        const pageId = (button as HTMLElement).dataset.pageId;
        if (!pageId || pageId === activePageId || editingPageId === pageId) return;

        persistActivePage();
        activePageId = pageId;
        editingPageId = null;
        render();
        loadActivePage();
      });
    });

    host.querySelectorAll('[data-page-name-display]').forEach((span) => {
      span.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const pageId = (span as HTMLElement).dataset.pageNameDisplay;
        if (!pageId) return;
        editingPageId = pageId;
        render();
        focusRenameInput(pageId);
      });
    });

    host.querySelectorAll('[data-page-name]').forEach((input) => {
      const pageId = (input as HTMLElement).dataset.pageName;
      if (!pageId) return;

      const finishRename = () => {
        commitRename(pageId, (input as HTMLInputElement).value);
        render();
      };

      input.addEventListener('input', () => {
        const page = pages.find((entry) => entry.id === pageId);
        if (page) page.name = (input as HTMLInputElement).value;
      });

      input.addEventListener('blur', finishRename);

      input.addEventListener('keydown', (event) => {
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.key === 'Enter') {
          keyboardEvent.preventDefault();
          (input as HTMLInputElement).blur();
        }
        if (keyboardEvent.key === 'Escape') {
          keyboardEvent.preventDefault();
          const page = pages.find((entry) => entry.id === pageId);
          if (page) (input as HTMLInputElement).value = page.name;
          editingPageId = null;
          render();
        }
      });

      input.addEventListener('click', (event) => event.stopPropagation());
    });

    host.querySelectorAll('[data-action="remove-page"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const pageId = (button as HTMLElement).dataset.pageId;
        if (!pageId || pages.length <= 1) return;

        const page = pages.find((entry) => entry.id === pageId);
        const confirmed = window.confirm(
          `Remove page "${page?.name ?? pageId}"? Its markdown will be deleted.`,
        );
        if (!confirmed) return;

        persistActivePage();
        pages = pages.filter((entry) => entry.id !== pageId);
        delete contents[pageId];
        pages = pages.map((entry, index) => ({ ...entry, order: index }));
        if (activePageId === pageId) {
          activePageId = pages[0]?.id ?? 'main';
        }
        if (editingPageId === pageId) {
          editingPageId = null;
        }
        render();
        loadActivePage();
      });
    });

    if (editingPageId) {
      focusRenameInput(editingPageId);
    }

    cleanupSearch();
    const search = wireListSearch(host, {
      preserveQuery: () => searchQuery,
      onQueryChange: (query) => {
        searchQuery = query;
      },
    });
    cleanupSearch = search.cleanup;
  };

  render();
  loadActivePage();

  return {
    getData: () => {
      persistActivePage();
      return {
        version: initial.version,
        pages: pages.map((page, index) => ({
          ...page,
          name: page.name.trim() || 'Untitled page',
          order: index,
        })),
        contents: { ...contents },
      };
    },
    getActivePageId: () => activePageId,
    getAllContents: () => {
      persistActivePage();
      return { ...contents };
    },
    setPageContent: (pageId: string, content: string) => {
      contents[pageId] = content;
      if (pageId === activePageId && editor.getValue() !== content) {
        editor.setValue(content);
      }
    },
    setAllContents: (nextContents: Record<string, string>) => {
      persistActivePage();
      contents = { ...nextContents };
      const nextActive = contents[activePageId] ?? '';
      if (editor.getValue() !== nextActive) {
        loadActivePage();
      }
    },
    getPageName: (pageId: string) =>
      pages.find((page) => page.id === pageId)?.name.trim() || 'Untitled page',
    cleanup: () => {
      cleanupSearch();
      persistActivePage();
    },
  };
}
