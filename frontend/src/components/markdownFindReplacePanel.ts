import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  searchPanelOpen,
  selectMatches,
  setSearchQuery,
} from '@codemirror/search';
import type { EditorView, Panel } from '@codemirror/view';
import { icon } from './icons.js';

/** Hidden panel kept inside CodeMirror for match highlighting only. */
export function createSearchHighlightStub(): () => Panel {
  return () => {
    const dom = document.createElement('div');
    dom.className = 'markdown-find-replace-stub';
    dom.setAttribute('aria-hidden', 'true');
    return { top: true, dom };
  };
}

export function mountMarkdownFindReplace(
  host: HTMLElement,
  view: EditorView,
): {
  open: (field?: 'find' | 'replace') => void;
  close: () => void;
  focusField: (field: 'find' | 'replace') => void;
  isOpen: () => boolean;
} {
  host.className = 'markdown-editor-find-host hidden';
  host.setAttribute('aria-live', 'polite');
  host.innerHTML = `
    <div class="markdown-find-replace">
      <div class="markdown-find-replace-row">
        <label class="markdown-find-replace-field">
          <input type="search" class="input markdown-find-replace-input" data-find-input placeholder="Find" aria-label="Find" autocomplete="off" spellcheck="false" />
        </label>
        <div class="markdown-find-replace-actions">
          <button type="button" class="btn-secondary markdown-find-replace-btn" data-action="prev">Prev</button>
          <button type="button" class="btn-secondary markdown-find-replace-btn" data-action="next">Next</button>
          <button type="button" class="btn-secondary markdown-find-replace-btn" data-action="all">All</button>
        </div>
        <div class="markdown-find-replace-options">
          <label class="markdown-find-replace-option">
            <input type="checkbox" data-option="case" />
            <span>Match case</span>
          </label>
          <label class="markdown-find-replace-option">
            <input type="checkbox" data-option="regexp" />
            <span>Regex</span>
          </label>
          <label class="markdown-find-replace-option">
            <input type="checkbox" data-option="word" />
            <span>Words</span>
          </label>
        </div>
        <button type="button" class="markdown-find-replace-close" data-action="close" aria-label="Close find and replace">
          ${icon('close', 'ui-icon ui-icon-sm')}
        </button>
      </div>
      <div class="markdown-find-replace-row">
        <label class="markdown-find-replace-field">
          <input type="text" class="input markdown-find-replace-input" data-replace-input placeholder="Replace" aria-label="Replace" autocomplete="off" spellcheck="false" />
        </label>
        <div class="markdown-find-replace-actions">
          <button type="button" class="btn-secondary markdown-find-replace-btn" data-action="replace">Replace</button>
          <button type="button" class="btn-secondary markdown-find-replace-btn" data-action="replace-all">Replace all</button>
        </div>
      </div>
    </div>
  `;

  const findInput = host.querySelector('[data-find-input]') as HTMLInputElement;
  const replaceInput = host.querySelector('[data-replace-input]') as HTMLInputElement;
  const caseInput = host.querySelector('[data-option="case"]') as HTMLInputElement;
  const regexpInput = host.querySelector('[data-option="regexp"]') as HTMLInputElement;
  const wordInput = host.querySelector('[data-option="word"]') as HTMLInputElement;

  const commit = () => {
    const query = new SearchQuery({
      search: findInput.value,
      replace: replaceInput.value,
      caseSensitive: caseInput.checked,
      regexp: regexpInput.checked,
      wholeWord: wordInput.checked,
    });
    if (!query.eq(getSearchQuery(view.state))) {
      view.dispatch({ effects: setSearchQuery.of(query) });
    }
  };

  const syncFromState = () => {
    const query = getSearchQuery(view.state);
    if (findInput.value !== query.search) findInput.value = query.search;
    if (replaceInput.value !== query.replace) replaceInput.value = query.replace;
    caseInput.checked = query.caseSensitive;
    regexpInput.checked = query.regexp;
    wordInput.checked = query.wholeWord;
  };

  const onInput = () => commit();

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
      if (event.target === replaceInput) {
        replaceNext(view);
      } else {
        findNext(view);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const focusField = (field: 'find' | 'replace') => {
    const input = field === 'find' ? findInput : replaceInput;
    input.focus();
    input.select();
  };

  const open = (field: 'find' | 'replace' = 'find') => {
    openSearchPanel(view);
    host.classList.remove('hidden');
    syncFromState();
    queueMicrotask(() => focusField(field));
  };

  const close = () => {
    closeSearchPanel(view);
    host.classList.add('hidden');
    view.focus();
  };

  findInput.addEventListener('input', onInput);
  replaceInput.addEventListener('input', onInput);
  caseInput.addEventListener('change', onInput);
  regexpInput.addEventListener('change', onInput);
  wordInput.addEventListener('change', onInput);
  findInput.addEventListener('keydown', onKeydown);
  replaceInput.addEventListener('keydown', onKeydown);

  host.querySelector('[data-action="prev"]')?.addEventListener('click', () => {
    commit();
    findPrevious(view);
  });
  host.querySelector('[data-action="next"]')?.addEventListener('click', () => {
    commit();
    findNext(view);
  });
  host.querySelector('[data-action="all"]')?.addEventListener('click', () => {
    commit();
    selectMatches(view);
  });
  host.querySelector('[data-action="replace"]')?.addEventListener('click', () => {
    commit();
    replaceNext(view);
  });
  host.querySelector('[data-action="replace-all"]')?.addEventListener('click', () => {
    commit();
    replaceAll(view);
  });
  host.querySelector('[data-action="close"]')?.addEventListener('click', close);

  return {
    open,
    close,
    focusField,
    isOpen: () => searchPanelOpen(view.state) && !host.classList.contains('hidden'),
  };
}
