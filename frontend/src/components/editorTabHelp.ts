import type { EditorTabId } from '../types/index.js';
import { icon } from './icons.js';

const EDITOR_TAB_HELP: Record<EditorTabId, string> = {
  content: `
    <p><strong>Pages</strong> — Use the sidebar to switch journal pages. Click to edit; double-click a name to rename.</p>
    <p><strong>Writing</strong> — Use the toolbar for headings, formatting, checkboxes, progress bars, maps, and media. Changes autosave.</p>
    <p><strong>Viewer</strong> — Open the viewer to read the journal with live checkbox and progress tracking.</p>
  `,
  images: `
    <p><strong>Adding media</strong> — Import a URL or upload a file. Click + in the library to open the add form.</p>
    <p><strong>Bulk import</strong> — Use the import button in the media list to paste many URLs at once. One URL per line, or use <code>URL;Alt Text;Source Label;Source URL</code> with semicolons between columns.</p>
    <p><strong>Optional metadata</strong> — Alt text, source label, and source URL apply to imports and uploads. Alt text defaults to the filename; source URL defaults to the import URL when importing.</p>
    <p><strong>Library</strong> — Select media from the list on the left. Edit alt text and source on the right.</p>
    <p><strong>Embedding</strong> — Use the Media toolbar button to place an embed in page content. Viewport size and centering are set per embed when editing the page.</p>
    <p><strong>Deleting</strong> — Removing a file from uploads deletes it from the server and strips any journal embeds that reference it.</p>
  `,
  maps: `
    <p><strong>Maps</strong> — Select a map from the list or click + to add one. Upload a base image and define point types.</p>
    <p><strong>Points</strong> — Open the point editor to place points on the fullscreen map. Choose a type before clicking, then edit labels and checkbox links in the sidebar. In the viewer, use the legend below the map to show or hide each point type.</p>
    <p><strong>Embedding</strong> — Insert with <code>[[map:map-id]]</code> or the toolbar map button. Click the map badge in the journal to set viewport size and starting scroll position per embed. The marker id updates when you rename the map.</p>
  `,
  checkboxes: `
    <p><strong>Checkboxes</strong> — Define trackable items with auto-generated ids. Nesting is supported for grouped goals.</p>
    <p><strong>Progress bars</strong> — Assign progress bars to each checkbox so completion counts toward the right totals.</p>
    <p><strong>Bulk add</strong> — Use the import button in the checkbox list to paste many checkboxes at once. One label per line, or use <code>Label;Parent;Progress Bars</code> with semicolons between columns and commas between progress bars.</p>
    <p><strong>Embedding</strong> — Insert in page content with <code>- [[cb:id]] Label</code>, or use the toolbar checkbox button. The marker id updates when you rename the label.</p>
  `,
  tags: `
    <p><strong>Progress bars</strong> — Define named bars here. Each bar tracks completion for the checkboxes assigned to it in the Checkboxes tab.</p>
    <p><strong>Embedding</strong> — Place a bar in page content with <code>[[pb:progress-bar-id]]</code> or the toolbar progress button. The embed id updates when you rename the progress bar.</p>
    <p><strong>Viewer summary</strong> — Enable &quot;Show in summary&quot; to display a bar above the journal in the viewer.</p>
  `,
  admin: `
    <p><strong>MobyGames</strong> — Link this journal to a MobyGames entry for box art, release info, and description in the viewer. Edit the cached fields below to customize what appears without changing the MobyGames link.</p>
    <p><strong>Maintenance</strong> — Clear abandoned badges removes embed markers that reference deleted checkboxes, progress bars, or maps. Remove extra whitespace trims trailing spaces and collapses extra blank lines across journal pages.</p>
    <p><strong>Export</strong> — Download pages, checkboxes, progress bars, maps, and uploaded media as a <code>.gametrackr.json</code> file.</p>
    <p><strong>Delete</strong> — Permanently remove this game, including its pages, media, and progress bars.</p>
  `,
};

export function renderHelpButton(
  content: string,
  ariaLabel = 'Help',
): string {
  return `
    <div class="editor-tab-help">
      <button
        type="button"
        class="editor-tab-help-trigger"
        data-tab-help-trigger
        aria-label="${ariaLabel}"
        aria-expanded="false"
        aria-haspopup="dialog"
      >${icon('info', 'ui-icon ui-icon-sm')}</button>
      <div class="editor-tab-help-popover hidden" data-tab-help-popover role="dialog" aria-label="Help">
        <button type="button" class="editor-tab-help-close" data-tab-help-close aria-label="Close help">
          ${icon('close', 'ui-icon ui-icon-sm')}
        </button>
        <div class="editor-tab-help-content">${content}</div>
      </div>
    </div>
  `;
}

export function renderEditorTabHelp(tabId: EditorTabId): string {
  return renderHelpButton(EDITOR_TAB_HELP[tabId], 'Help for this tab');
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
