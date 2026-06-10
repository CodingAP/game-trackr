import {
  buildTagProgressMarker,
  PROGRESS_ID_PATTERN,
  slugifyProgressBarId,
} from '../markdown/completionProgress.js';
import { renderCollapsiblePanel, wireCollapsiblePanels } from './CollapsiblePanel.js';
import { renderListSearchBar, wireListSearch } from './listSearch.js';
import { icon, iconLabel } from './icons.js';
import type { CompletionTag, CompletionTagsData } from '../types/index.js';
import type { MarkdownEditorHandle } from '../types/markdownEditor.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function mountCompletionTagsEditor(
  host: HTMLElement,
  editor: MarkdownEditorHandle,
  initial: CompletionTagsData,
  options: {
    onTagIdChange?: (oldId: string, newId: string) => void;
  } = {},
): {
  getData: () => CompletionTagsData;
  addTag: (name: string) => CompletionTag;
  registerTag: (tag: CompletionTag) => void;
  updateTag: (id: string, updates: { name?: string; id?: string }) => void;
  cleanup: () => void;
} {
  let tags: CompletionTag[] = structuredClone(initial.tags).map((tag) => ({
    id: tag.id,
    name: tag.name,
    showInSummary: tag.showInSummary ?? false,
  }));
  const expandedTags = new Set<string>();
  let searchQuery = '';
  let cleanupSearch = () => {};

  const existingIds = () => new Set(tags.map((tag) => tag.id));

  const syncFromDom = () => {
    host.querySelectorAll('[data-tag-name]').forEach((input) => {
      const tagId = (input as HTMLElement).dataset.tagName;
      const tag = tags.find((entry) => entry.id === tagId);
      if (tag) tag.name = (input as HTMLInputElement).value;
    });

    host.querySelectorAll('[data-tag-id-input]').forEach((input) => {
      const tagId = (input as HTMLElement).dataset.tagIdInput;
      const tag = tags.find((entry) => entry.id === tagId);
      if (tag) tag.id = (input as HTMLInputElement).value;
    });

    host.querySelectorAll('[data-show-in-summary]').forEach((input) => {
      const tagId = (input as HTMLElement).dataset.showInSummary;
      const tag = tags.find((entry) => entry.id === tagId);
      if (tag) tag.showInSummary = (input as HTMLInputElement).checked;
    });
  };

  const render = () => {
    syncFromDom();
    host.innerHTML = `
      ${tags.length > 0 ? renderListSearchBar({ id: 'tag-search', placeholder: 'Search progress bars...' }) : ''}
      <div class="space-y-2">
        ${
          tags.length === 0
            ? '<p class="text-faint text-sm">No progress bars yet.</p>'
            : tags
                .map((tag) => {
                  const tagTitle = tag.name.trim() || 'Untitled progress bar';

                  const tagBody = `
                      <label class="block mb-3">
                        <span class="label">Progress bar id</span>
                        <input
                          type="text"
                          class="input"
                          data-tag-id-input="${tag.id}"
                          value="${escapeHtml(tag.id)}"
                          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                        />
                      </label>
                      <label class="block mb-3">
                        <span class="label">Progress bar name</span>
                        <input type="text" class="input" data-tag-name="${tag.id}" value="${escapeHtml(tag.name)}" placeholder="e.g. Complete World 1" />
                      </label>
                      <label class="settings-check mb-3">
                        <input type="checkbox" data-show-in-summary="${tag.id}" ${tag.showInSummary ? 'checked' : ''} />
                        <span>Show in summary</span>
                      </label>
                      <p class="hint">Embeds use <code>[[pb:${escapeHtml(tag.id)}]]</code>. Renaming the label does not break existing embeds.</p>
                  `;

                  const titleActions = `
                    <button type="button" class="btn-secondary" data-action="insert-progress" data-tag-id="${tag.id}" aria-label="Insert progress bar in content">
                      ${icon('progress', 'ui-icon ui-icon-sm')}
                    </button>
                    <button type="button" class="btn-secondary" data-action="remove-tag" data-tag-id="${tag.id}" aria-label="Remove progress bar">
                      ${icon('trash', 'ui-icon ui-icon-sm')}
                    </button>
                  `;

                  return renderCollapsiblePanel({
                    title: tagTitle,
                    titleActions,
                    className: 'completion-tag-card',
                    defaultOpen: expandedTags.has(tag.id),
                    attributes: {
                      'tag-id': tag.id,
                      'search-text': `${tag.name} ${tag.id}`,
                    },
                    content: tagBody,
                  });
                })
                .join('')
        }
      </div>
      <div class="mt-4">
        <button type="button" class="btn-secondary" data-action="add-tag">${iconLabel('progress', 'Add progress bar')}</button>
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
  };

  const wireStaticActions = () => {
    host.querySelectorAll('[data-action="add-tag"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        tags.push({
          id: slugifyProgressBarId('', existingIds()),
          name: '',
          showInSummary: false,
        });
        render();
      });
    });

    host.querySelectorAll('[data-action="remove-tag"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const tagId = (button as HTMLElement).dataset.tagId;
        tags = tags.filter((tag) => tag.id !== tagId);
        expandedTags.delete(tagId);
        render();
      });
    });

    host.querySelectorAll('[data-action="insert-progress"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const tagId = (button as HTMLElement).dataset.tagId;
        const tag = tags.find((entry) => entry.id === tagId);
        if (!tag) return;
        editor.insertLine(buildTagProgressMarker(tag));
      });
    });

    host.querySelectorAll('[data-tag-name]').forEach((input) => {
      input.addEventListener('input', () => {
        const tagId = (input as HTMLElement).dataset.tagName;
        const tag = tags.find((entry) => entry.id === tagId);
        if (tag) tag.name = (input as HTMLInputElement).value;
      });
      input.addEventListener('blur', () => {
        const tagId = (input as HTMLElement).dataset.tagName;
        const tag = tags.find((entry) => entry.id === tagId);
        const idInput = host.querySelector(
          `[data-tag-id-input="${tagId}"]`,
        ) as HTMLInputElement | null;
        if (!tag || !idInput || idInput.dataset.idTouched === 'true') return;
        const label = (input as HTMLInputElement).value.trim();
        if (!label || PROGRESS_ID_PATTERN.test(tag.id)) return;
        const nextId = slugifyProgressBarId(label, existingIds());
        if (nextId === tag.id) return;
        tag.id = nextId;
        idInput.value = nextId;
      });
    });

    host.querySelectorAll('[data-tag-id-input]').forEach((input) => {
      input.addEventListener('input', () => {
        (input as HTMLElement).dataset.idTouched = 'true';
      });
      input.addEventListener('blur', () => {
        const oldId = (input as HTMLElement).dataset.tagIdInput;
        const tag = tags.find((entry) => entry.id === oldId);
        if (!tag) return;
        const nextId = (input as HTMLInputElement).value.trim();
        if (!nextId || nextId === oldId) {
          (input as HTMLInputElement).value = tag.id;
          return;
        }
        if (!PROGRESS_ID_PATTERN.test(nextId)) {
          (input as HTMLInputElement).value = tag.id;
          return;
        }
        if (tags.some((entry) => entry.id === nextId && entry !== tag)) {
          (input as HTMLInputElement).value = tag.id;
          return;
        }
        options.onTagIdChange?.(oldId, nextId);
        tag.id = nextId;
        (input as HTMLElement).dataset.tagIdInput = nextId;
        expandedTags.delete(oldId);
        expandedTags.add(nextId);
        render();
      });
    });

    host.querySelectorAll('[data-show-in-summary]').forEach((input) => {
      input.addEventListener('change', () => {
        const tagId = (input as HTMLElement).dataset.showInSummary;
        const tag = tags.find((entry) => entry.id === tagId);
        if (tag) tag.showInSummary = (input as HTMLInputElement).checked;
      });
    });
  };

  const cleanupCollapsible = wireCollapsiblePanels(host, {
    onToggle: (panel, expanded) => {
      const tagId = panel.dataset.tagId;
      if (!tagId) return;
      if (expanded) expandedTags.add(tagId);
      else expandedTags.delete(tagId);
    },
  });
  render();

  return {
    getData: () => ({
      tags: tags.map((tag) => ({
        ...tag,
        name: tag.name.trim(),
        showInSummary: tag.showInSummary ?? false,
      })),
    }),
    addTag: (name: string) => {
      const tag: CompletionTag = {
        id: slugifyProgressBarId(name, existingIds()),
        name: name.trim(),
        showInSummary: false,
      };
      tags.push(tag);
      render();
      return tag;
    },
    registerTag: (tag: CompletionTag) => {
      if (tags.some((entry) => entry.id === tag.id)) return;
      tags.push({
        id: tag.id,
        name: tag.name,
        showInSummary: tag.showInSummary ?? false,
      });
      expandedTags.add(tag.id);
      render();
    },
    updateTag: (id: string, updates: { name?: string; id?: string }) => {
      const tag = tags.find((entry) => entry.id === id);
      if (!tag) return;
      if (updates.id !== undefined && updates.id !== id) {
        tag.id = updates.id;
        expandedTags.delete(id);
        expandedTags.add(updates.id);
      }
      if (updates.name !== undefined) {
        tag.name = updates.name;
      }
      render();
    },
    cleanup: () => {
      cleanupSearch();
      cleanupCollapsible();
    },
  };
}
