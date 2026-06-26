import { icon } from './icons.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function matchesSearch(query: string, ...parts: Array<string | undefined | null>): boolean {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return true;
  const haystack = parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(normalized);
}

export function renderListSearchBar(options: {
  id?: string;
  placeholder?: string;
  className?: string;
  value?: string;
} = {}): string {
  const id = options.id ?? 'list-search';
  const placeholder = options.placeholder ?? 'Search...';
  const className = options.className ?? 'mb-3';
  const value = options.value ?? '';

  return `
    <div class="list-search ${className}">
      <div class="list-search-field">
        <span class="list-search-icon" aria-hidden="true">${icon('search', 'ui-icon ui-icon-sm')}</span>
        <input
          type="search"
          class="list-search-input"
          data-list-search
          id="${escapeHtml(id)}"
          value="${escapeHtml(value)}"
          placeholder="${escapeHtml(placeholder)}"
          autocomplete="off"
          aria-label="${escapeHtml(placeholder)}"
        />
        <button
          type="button"
          class="list-search-clear hidden"
          data-list-search-clear
          aria-label="Clear search"
        >${icon('close', 'ui-icon ui-icon-sm')}</button>
      </div>
      <p class="list-search-empty text-muted hidden" data-list-search-empty>No matches.</p>
    </div>
  `;
}

export function applyListSearch(
  root: HTMLElement,
  query: string,
  itemSelector = '[data-search-text]',
): void {
  const normalized = normalizeSearchQuery(query);
  let visibleCount = 0;

  root.querySelectorAll(itemSelector).forEach((item) => {
    const text = (item as HTMLElement).dataset.searchText ?? item.textContent ?? '';
    const visible = matchesSearch(normalized, text);
    (item as HTMLElement).hidden = !visible;
    if (visible) visibleCount += 1;
  });

  const emptyEl = root.querySelector('[data-list-search-empty]') as HTMLElement | null;
  if (emptyEl) {
    emptyEl.classList.toggle('hidden', !normalized || visibleCount > 0);
  }
}

function syncSearchClearButton(input: HTMLInputElement): void {
  const field = input.closest('.list-search-field');
  const clearButton = field?.querySelector('[data-list-search-clear]') as HTMLButtonElement | null;
  if (!clearButton) return;
  const hasValue = input.value.length > 0;
  clearButton.classList.toggle('hidden', !hasValue);
  clearButton.tabIndex = hasValue ? 0 : -1;
}

export function wireListSearch(
  root: HTMLElement,
  options: {
    inputSelector?: string;
    itemSelector?: string;
    preserveQuery?: () => string;
    onQueryChange?: (query: string) => void;
  } = {},
): {
  getQuery: () => string;
  setQuery: (query: string) => void;
  apply: () => void;
  cleanup: () => void;
} {
  const inputSelector = options.inputSelector ?? '[data-list-search]';
  const itemSelector = options.itemSelector ?? '[data-search-text]';
  const input = root.querySelector(inputSelector) as HTMLInputElement | null;

  if (!input) {
    return {
      getQuery: () => '',
      setQuery: () => {},
      apply: () => {},
      cleanup: () => {},
    };
  }

  if (options.preserveQuery) {
    input.value = options.preserveQuery();
  }

  const clearButton = input
    .closest('.list-search-field')
    ?.querySelector('[data-list-search-clear]') as HTMLButtonElement | null;

  const apply = () => {
    applyListSearch(root, input.value, itemSelector);
    syncSearchClearButton(input);
  };

  const onInput = () => {
    apply();
    options.onQueryChange?.(input.value);
  };

  const onClear = () => {
    input.value = '';
    input.focus();
    apply();
    options.onQueryChange?.('');
  };

  input.addEventListener('input', onInput);
  clearButton?.addEventListener('click', onClear);
  apply();

  return {
    getQuery: () => input.value,
    setQuery: (query: string) => {
      input.value = query;
      apply();
      options.onQueryChange?.(query);
    },
    apply,
    cleanup: () => {
      input.removeEventListener('input', onInput);
      clearButton?.removeEventListener('click', onClear);
    },
  };
}
