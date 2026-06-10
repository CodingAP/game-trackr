import type { EditorTabId } from '../types/index.js';
import { icon } from './icons.js';

export const EDITOR_TAB_HELP: Record<EditorTabId, string> = {
  content: `
    <p>Use the sidebar to switch journal pages. Click a page to edit it; double-click a name to rename.</p>
    <p>Use the toolbar to insert checkboxes, progress bars, and images into page content.</p>
  `,
  images: `
    <p>Upload images here or use the Image button in the editor toolbar to insert them into page content.</p>
    <p>Removing an image from a page does not delete it from this list.</p>
  `,
  maps: `
    <p>Upload a base image for each map and place points on it. Scroll to pan and use zoom controls (or mouse wheel) while editing.</p>
    <p>Define custom point types for the map legend. Link points to checkboxes from the Checkboxes tab to track completion from the map in the viewer.</p>
    <p>Set viewport size and starting scroll position for the reader window. Embed a map with <code>[[map:map-id]]</code>.</p>
  `,
  checkboxes: `
    <p>Track checkboxes with stable ids and assign completion tags to them.</p>
    <p>Insert a checkbox in page content with <code>- [[cb:id]] Label</code>.</p>
  `,
  tags: `
    <p>Create completion tags for progress bars. Assign checkboxes to tags in the Checkboxes tab.</p>
    <p>Embed a tag progress bar with <code>[[pb:Tag Name]]</code>. Toggle &quot;Show in summary&quot; to display a tag above the journal in the viewer.</p>
  `,
  admin: `
    <p><strong>MobyGames</strong> — Link this journal to a MobyGames entry to show box art, release info, and description in the viewer.</p>
    <p><strong>Export</strong> — Download pages, checkboxes, completion tags, maps, and uploaded images as a <code>.gametrackr.json</code> file.</p>
    <p><strong>Duplicate</strong> — Create a copy of this game journal with a new slug.</p>
    <p><strong>Delete</strong> — Permanently delete this game, its pages, images, and completion tags.</p>
  `,
};

export function renderEditorTabHelp(tabId: EditorTabId): string {
  return `
    <div class="editor-tab-help">
      <button
        type="button"
        class="editor-tab-help-trigger"
        data-tab-help-trigger
        aria-label="Help for this tab"
        aria-expanded="false"
        aria-haspopup="dialog"
      >${icon('info', 'ui-icon ui-icon-sm')}</button>
      <div class="editor-tab-help-popover hidden" data-tab-help-popover role="dialog" aria-label="Help">
        <button type="button" class="editor-tab-help-close" data-tab-help-close aria-label="Close help">
          ${icon('close', 'ui-icon ui-icon-sm')}
        </button>
        <div class="editor-tab-help-content">${EDITOR_TAB_HELP[tabId]}</div>
      </div>
    </div>
  `;
}

export function wireEditorTabHelp(scope: ParentNode): () => void {
  const closeAll = () => {
    scope.querySelectorAll('[data-tab-help-popover]').forEach((popover) => {
      popover.classList.add('hidden');
      const trigger = popover
        .closest('.editor-tab-help')
        ?.querySelector('[data-tab-help-trigger]') as HTMLButtonElement | null;
      trigger?.setAttribute('aria-expanded', 'false');
    });
  };

  const onClick = (event: Event) => {
    const target = event.target as Element;

    const trigger = target.closest('[data-tab-help-trigger]') as HTMLButtonElement | null;
    if (trigger) {
      event.preventDefault();
      event.stopPropagation();

      const wrap = trigger.closest('.editor-tab-help');
      const popover = wrap?.querySelector('[data-tab-help-popover]') as HTMLElement | null;
      if (!popover) return;

      const isOpen = !popover.classList.contains('hidden');
      if (isOpen) {
        popover.classList.add('hidden');
        trigger.setAttribute('aria-expanded', 'false');
        return;
      }

      closeAll();
      popover.classList.remove('hidden');
      trigger.setAttribute('aria-expanded', 'true');
      return;
    }

    if (target.closest('[data-tab-help-close]')) {
      event.preventDefault();
      closeAll();
      return;
    }

    if (!target.closest('.editor-tab-help')) {
      closeAll();
    }
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    const openPopover = scope.querySelector(
      '[data-tab-help-popover]:not(.hidden)',
    ) as HTMLElement | null;
    if (!openPopover) return;

    const trigger = openPopover
      .closest('.editor-tab-help')
      ?.querySelector('[data-tab-help-trigger]') as HTMLButtonElement | null;
    closeAll();
    trigger?.focus();
  };

  scope.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeydown);

  return () => {
    scope.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKeydown);
  };
}
