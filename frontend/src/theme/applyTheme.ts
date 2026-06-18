import { deriveThemeVariables } from './deriveVariables.js';
import { buildFaviconSvg } from '../utils/favicon.js';
import type { ThemeSettings } from './types.js';

export function applyThemeVariables(variables: Record<string, string>): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(variables)) {
    root.style.setProperty(key, value);
  }
  root.dataset.theme = 'dynamic';
}

export function applyThemeSettings(settings: ThemeSettings): void {
  applyThemeVariables(deriveThemeVariables(settings.colors));
  applyThemeAccentFavicon(settings.colors.accent);
}

export function applyThemeAccentFavicon(accentColor: string): void {
  if (typeof document === 'undefined') return;

  const svg = buildFaviconSvg(accentColor);
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;

  document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach((node) => {
    node.remove();
  });

  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  link.href = url;
  document.head.appendChild(link);
}
