export const FAVICON_CHECK_PATH =
  'M11 24.5 20.5 36 38 14 33.5 10 20.5 27.5 15.5 22.5 11 24.5Z';

export const DEFAULT_FAVICON_ACCENT = '#0ea5e9';

export function buildFaviconSvg(accentColor: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none"><path fill="${accentColor}" d="${FAVICON_CHECK_PATH}"/></svg>`;
}
