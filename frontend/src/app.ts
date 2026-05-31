import { renderNav } from './components/Nav.js';
import { requireAuth } from './components/AuthPrompt.js';
import { initRouter, navigate } from './router.js';
import type { RouteMatch } from './types/index.js';
import { renderEditor } from './views/EditorView.js';
import { renderLibrary } from './views/LibraryView.js';
import { renderSettings } from './views/SettingsView.js';
import { renderViewer } from './views/ViewerView.js';

let cleanup: (() => void) | null = null;

async function renderRoute(match: RouteMatch): Promise<void> {
  const main = document.querySelector('#main-content') as HTMLElement;
  if (!main) return;

  cleanup?.();
  cleanup = null;

  switch (match.view) {
    case 'library':
      cleanup = await renderLibrary(main);
      break;
    case 'editor':
      if (!(await requireAuth())) {
        navigate('/');
        return;
      }
      cleanup = await renderEditor(main, match.params);
      break;
    case 'viewer':
      cleanup = await renderViewer(main, match.params);
      break;
    case 'settings':
      cleanup = renderSettings(main);
      break;
    default:
      navigate('/');
  }
}

export function initApp(): void {
  const navHost = document.querySelector('#nav-host') as HTMLElement;
  if (navHost) renderNav(navHost);

  initRouter((match) => {
    void renderRoute(match);
  });
}
