import type { EditorTabId } from '../types/index.js';
import { EDITOR_TAB_ICONS, iconLabel } from './icons.js';

export interface EditorTab {
  id: EditorTabId;
  label: string;
  panel: HTMLElement;
}

export function mountEditorTabs(
  navHost: HTMLElement,
  tabs: EditorTab[],
  initial: EditorTabId = 'content',
): { setTab: (id: EditorTabId) => void; cleanup: () => void } {
  navHost.innerHTML = `
    <div class="editor-tabs" role="tablist">
      ${tabs
        .map(
          (tab) => `
            <button
              type="button"
              class="editor-tab"
              role="tab"
              data-tab="${tab.id}"
              aria-selected="false"
            >
              ${iconLabel(EDITOR_TAB_ICONS[tab.id] ?? 'pages', tab.label)}
            </button>
          `,
        )
        .join('')}
    </div>
  `;

  const handlers: Array<{ element: Element; handler: (event: Event) => void }> = [];

  const setTab = (id: EditorTabId) => {
    tabs.forEach((tab) => {
      const active = tab.id === id;
      tab.panel.hidden = !active;
      tab.panel.classList.toggle('is-active', active);
    });

    navHost.querySelectorAll('[data-tab]').forEach((button) => {
      const active = (button as HTMLElement).dataset.tab === id;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
  };

  navHost.querySelectorAll('[data-tab]').forEach((button) => {
    const handler = () => {
      const id = (button as HTMLElement).dataset.tab as EditorTabId;
      setTab(id);
    };
    button.addEventListener('click', handler);
    handlers.push({ element: button, handler });
  });

  setTab(initial);

  return {
    setTab,
    cleanup: () => {
      handlers.forEach(({ element, handler }) => {
        element.removeEventListener('click', handler);
      });
    },
  };
}
