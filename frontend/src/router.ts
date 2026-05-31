import type { RouteMatch } from './types/index.js';

type RouteHandler = (match: RouteMatch) => void;

let handler: RouteHandler | null = null;

function parseHash(hash: string): RouteMatch {
  const path = hash.replace(/^#\/?/, '');
  const segments = path.split('/').filter(Boolean);

  if (segments.length === 0) {
    return { view: 'library', params: {} };
  }

  const [view, ...rest] = segments;

  if (view === 'editor') {
    return { view: 'editor', params: rest[0] ? { slug: rest[0] } : {} };
  }

  if (view === 'viewer' && rest[0]) {
    return { view: 'viewer', params: { slug: rest[0] } };
  }

  if (view === 'settings') {
    return { view: 'settings', params: {} };
  }

  return { view: 'library', params: {} };
}

function dispatch(): void {
  if (!handler) return;
  handler(parseHash(window.location.hash));
}

export function initRouter(onRoute: RouteHandler): void {
  handler = onRoute;
  window.addEventListener('hashchange', dispatch);
  dispatch();
}

export function navigate(path: string): void {
  window.location.hash = path.startsWith('#') ? path : `#/${path}`;
}

export function destroyRouter(): void {
  window.removeEventListener('hashchange', dispatch);
  handler = null;
}
