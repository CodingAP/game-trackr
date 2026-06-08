import { buildTagProgressMarker } from '../markdown/completionProgress.js';
import { renderCollapsiblePanel, wireCollapsiblePanels } from './CollapsiblePanel.js';
import { renderListSearchBar, wireListSearch } from './listSearch.js';
import { iconLabel } from './icons.js';
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
): { getData: () => CompletionTagsData; cleanup: () => void } {
  let tags: CompletionTag[] = structuredClone(initial.tags).map((tag) => ({
    id: tag.id,
    name: tag.name,
    showInSummary: tag.showInSummary ?? false,
  }));
  const expandedTags = new Set<string>();
  let searchQuery = '';
  let cleanupSearch = () => {};

  const syncFromDom = () => {
    host.querySelectorAll('[data-tag-name]').forEach((input) => {
      const tagId = (input as HTMLElement).dataset.tagName;
      const tag = tags.find((entry) => entry.id === tagId);
      if (tag) tag.name = (input as HTMLInputElement).value;
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
      ${tags.length > 0 ? renderListSearchBar({ id: 'tag-search', placeholder: 'Search tags...' }) : ''}
      <div class="space-y-2">
        ${
          tags.length === 0
            ? '<p class="text-faint text-sm">No completion tags yet.</p>'
            : tags
                .map((tag) => {
                  const tagTitle = tag.name.trim() || 'Untitled tag';

                  const tagBody = `
                      <div class="completion-tag-header mb-3">
                        <label class="block flex-1 min-w-[12rem]">
                          <span class="label">Tag name</span>
                          <input type="text" class="input" data-tag-name="${tag.id}" value="${escapeHtml(tag.name)}" placeholder="e.g. Complete World 1" />
                        </label>
                        <button type="button" class="btn-secondary completion-tag-remove" data-action="remove-tag" data-tag-id="${tag.id}">${iconLabel('trash', 'Remove tag')}</button>
                      </div>
                      <div class="flex flex-wrap items-center gap-4 mb-3">
                        <label class="settings-check">
                          <input type="checkbox" data-show-in-summary="${tag.id}" ${tag.showInSummary ? 'checked' : ''} />
                          <span>Show in summary</span>
                        </label>
                        <button type="button" class="btn-secondary text-xs" data-action="insert-progress" data-tag-id="${tag.id}">
                          ${iconLabel('progress', 'Insert progress bar in content', 'ui-icon ui-icon-sm')}
                        </button>
                      </div>
                  `;

                  return renderCollapsiblePanel({
                    title: tagTitle,
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
        <button type="button" class="btn-secondary" data-action="add-tag">${iconLabel('plus', 'Add tag')}</button>
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
          id: crypto.randomUUID(),
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
    cleanup: () => {
      cleanupSearch();
      cleanupCollapsible();
    },
  };
}
