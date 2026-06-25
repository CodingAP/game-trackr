import type { ImageViewportSettings } from '../types/index.js';
import { applyThemeSettings } from '../theme/applyTheme.js';
import {
  createThemeSettingsFromPreset,
  DEFAULT_THEME_PRESET,
  getThemePreset,
} from '../theme/presets.js';
import {
  normalizeThemeSettings,
  parseStoredThemeSettings,
  serializeThemeSettings,
} from '../theme/storage.js';
import type { ThemeColors, ThemePresetId, ThemeSettings } from '../theme/types.js';
import { notifyLocalDataChanged } from './localDataEvents.js';

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
  notifyLocalDataChanged();
  return normalized;
}

export function getThemeSettings(): ThemeSettings {
  return parseStoredThemeSettings(localStorage.getItem(THEME_STORAGE_KEY));
}

export function saveThemeSettings(settings: ThemeSettings): ThemeSettings {
  const normalized = normalizeThemeSettings(settings);
  localStorage.setItem(THEME_STORAGE_KEY, serializeThemeSettings(normalized));
  applyThemeSettings(normalized);
  notifyLocalDataChanged();
  return normalized;
}

export function saveThemePreset(presetId: ThemePresetId): ThemeSettings {
  return saveThemeSettings(createThemeSettingsFromPreset(presetId));
}

export function saveCustomThemeColors(colors: ThemeColors): ThemeSettings {
  return saveThemeSettings({
    presetId: 'custom',
    colors,
  });
}

export function initTheme(): void {
  const raw = localStorage.getItem(THEME_STORAGE_KEY);
  const settings = parseStoredThemeSettings(raw);
  applyThemeSettings(settings);

  if (raw && !raw.trim().startsWith('{')) {
    localStorage.setItem(THEME_STORAGE_KEY, serializeThemeSettings(settings));
  }
}

export function getHideImages(): boolean {
  return localStorage.getItem(HIDE_IMAGES_STORAGE_KEY) === 'true';
}

export function saveHideImages(hide: boolean): boolean {
  localStorage.setItem(HIDE_IMAGES_STORAGE_KEY, hide ? 'true' : 'false');
  applyHideImages(hide);
  notifyLocalDataChanged();
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
  widthUnit: 'px' | '%' = 'px',
  heightUnit: 'px' | '%' = 'px',
): string {
  const w = `${width}${widthUnit === '%' ? '%' : ''}`;
  const h = `${height}${heightUnit === '%' ? '%' : ''}`;
  let title = scaleToFit ? `${w}x${h} fit` : `${w}x${h}`;
  if (maintainAspectRatio) title += ' aspect';
  return title;
}

function normalizeDimension(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.round(parsed);
}

export { DEFAULT_THEME_PRESET, getThemePreset };
