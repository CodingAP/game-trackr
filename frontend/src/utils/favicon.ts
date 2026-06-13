import { getThemeAccentColor, type ThemeId } from '../types/index.js';

const FAVICON_CHECK_PATH = 'M11 24.5 20.5 36 38 14 33.5 10 20.5 27.5 15.5 22.5 11 24.5Z';

export function buildFaviconSvg(accentColor: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none"><path fill="${accentColor}" d="${FAVICON_CHECK_PATH}"/></svg>`;
}

export function applyFavicon(theme: ThemeId): void {
  if (typeof document === 'undefined') return;

  const svg = buildFaviconSvg(getThemeAccentColor(theme));
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }

  link.type = 'image/svg+xml';
  link.href = url;
}
