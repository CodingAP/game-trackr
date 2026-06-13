import type { ImageViewportSettings, ThemeId } from '../types/index.js';
import { THEME_OPTIONS } from '../types/index.js';
import { applyFavicon } from '../utils/favicon.js';

const IMAGE_STORAGE_KEY = 'game-tracking:image-viewport';
const THEME_STORAGE_KEY = 'game-tracking:theme';
const HIDE_IMAGES_STORAGE_KEY = 'game-tracking:hide-images';

const IMAGE_DEFAULTS: ImageViewportSettings = {
  enabled: false,
  width: 800,
  height: 600,
  scaleToFit: false,
  maintainAspectRatio: false,
};

const DEFAULT_THEME: ThemeId = 'dark';

export function getImageViewportSettings(): ImageViewportSettings {
  try {
    const raw = localStorage.getItem(IMAGE_STORAGE_KEY);
    if (!raw) return { ...IMAGE_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<ImageViewportSettings>;
    return {
      enabled: Boolean(parsed.enabled),
      width: normalizeDimension(parsed.width, IMAGE_DEFAULTS.width),
      height: normalizeDimension(parsed.height, IMAGE_DEFAULTS.height),
      scaleToFit: Boolean(parsed.scaleToFit),
      maintainAspectRatio: Boolean(parsed.maintainAspectRatio),
    };
  } catch {
    return { ...IMAGE_DEFAULTS };
  }
}

export function saveImageViewportSettings(settings: ImageViewportSettings): ImageViewportSettings {
  const normalized: ImageViewportSettings = {
    enabled: settings.enabled,
    width: normalizeDimension(settings.width, IMAGE_DEFAULTS.width),
    height: normalizeDimension(settings.height, IMAGE_DEFAULTS.height),
    scaleToFit: settings.scaleToFit,
    maintainAspectRatio: settings.maintainAspectRatio,
  };
  localStorage.setItem(IMAGE_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function getTheme(): ThemeId {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored && THEME_OPTIONS.some((theme) => theme.id === stored)) {
    return stored as ThemeId;
  }
  return DEFAULT_THEME;
}

export function saveTheme(theme: ThemeId): ThemeId {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
  return theme;
}

export function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme;
  applyFavicon(theme);
}

export function initTheme(): void {
  applyTheme(getTheme());
}

export function getHideImages(): boolean {
  return localStorage.getItem(HIDE_IMAGES_STORAGE_KEY) === 'true';
}

export function saveHideImages(hide: boolean): boolean {
  localStorage.setItem(HIDE_IMAGES_STORAGE_KEY, hide ? 'true' : 'false');
  applyHideImages(hide);
  return hide;
}

export function applyHideImages(hide: boolean): void {
  if (hide) {
    document.documentElement.dataset.hideImages = 'true';
    return;
  }

  delete document.documentElement.dataset.hideImages;
}

export function initHideImages(): void {
  applyHideImages(getHideImages());
}

export function formatViewportTitle(
  width: number,
  height: number,
  scaleToFit = false,
  maintainAspectRatio = false,
): string {
  let title = scaleToFit ? `${width}x${height} fit` : `${width}x${height}`;
  if (maintainAspectRatio) title += ' aspect';
  return title;
}

function normalizeDimension(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.round(parsed);
}
