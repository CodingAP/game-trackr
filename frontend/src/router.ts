import type { RouteMatch } from './types/index.js';

type RouteHandler = (match: RouteMatch) => void;

let handler: RouteHandler | null = null;

function normalizePath(path: string): string {
  const stripped = path.replace(/^#+/, '').replace(/^\/+/, '').replace(/\/+$/, '');
  return stripped ? `/${stripped}` : '/';
}

function parsePath(pathname: string): RouteMatch {
  const path = pathname.replace(/^\/+/, '');
  const segments = path.split('/').filter(Boolean);

  if (segments.length === 0) {
    return { view: 'library', params: {} };
  }

  const [view, ...rest] = segments;

  if (view === 'editor') {
    return { view: 'editor', params: rest[0] ? { slug: rest[0] } : {} };
  }

  if (view === 'viewer' && rest[0]) {
    return {
      view: 'viewer',
      params: {
        slug: rest[0],
        ...(rest[1] ? { page: rest[1] } : {}),
      },
    };
  }

  if (view === 'settings') {
    return { view: 'settings', params: {} };
  }

  return { view: 'library', params: {} };
}

function dispatch(): void {
  if (!handler) return;
  handler(parsePath(window.location.pathname));
}

function migrateLegacyHashUrl(): void {
  const hash = window.location.hash;
  if (!hash) return;

  const path = normalizePath(hash);
  history.replaceState(null, '', path);
}

export function initRouter(onRoute: RouteHandler): void {
  handler = onRoute;
  window.addEventListener('popstate', dispatch);

  migrateLegacyHashUrl();

  const normalized = normalizePath(window.location.pathname);
  if (window.location.pathname !== normalized) {
    history.replaceState(null, '', normalized);
  }

  dispatch();
}

export function navigate(path: string): void {
  const normalized = normalizePath(path);
  if (window.location.pathname !== normalized) {
    history.pushState(null, '', normalized);
  }
  dispatch();
}

export function destroyRouter(): void {
  window.removeEventListener('popstate', dispatch);
  handler = null;
}
