import { normalizeHex, parseColor } from './colorUtils.js';
import {
  createThemeSettingsFromPreset,
  DEFAULT_THEME_PRESET,
  getThemePresetColors,
  isThemePresetId,
} from './presets.js';
import type { ThemeColors, ThemePresetId, ThemeSettings } from './types.js';

const LEGACY_THEME_MAP: Record<string, ThemePresetId> = {
  dark: 'midnight-dark',
  light: 'midnight-light',
  midnight: 'midnight-dark',
  forest: 'forest-dark',
  'purple-dark': 'neon-dark',
  'purple-light': 'neon-light',
  'red-dark': 'crimson-dark',
  'red-light': 'crimson-light',
};

function normalizeColors(colors: Partial<ThemeColors>, fallback: ThemeColors): ThemeColors {
  return {
    background: normalizeHex(colors.background ?? fallback.background, fallback.background),
    surface: normalizeHex(colors.surface ?? fallback.surface, fallback.surface),
    accent: normalizeHex(colors.accent ?? fallback.accent, fallback.accent),
  };
}

function colorsMatchPreset(colors: ThemeColors, presetId: ThemePresetId): boolean {
  const preset = getThemePresetColors(presetId);
  return (
    colors.background === preset.background &&
    colors.surface === preset.surface &&
    colors.accent === preset.accent
  );
}

function inferPresetId(colors: ThemeColors): ThemePresetId | 'custom' {
  const presetIds: ThemePresetId[] = [
    'midnight-dark',
    'midnight-light',
    'forest-dark',
    'forest-light',
    'neon-dark',
    'neon-light',
    'crimson-dark',
    'crimson-light',
  ];

  for (const presetId of presetIds) {
    if (colorsMatchPreset(colors, presetId)) {
      return presetId;
    }
  }

  return 'custom';
}

export function normalizeThemeSettings(value: unknown): ThemeSettings {
  const fallback = createThemeSettingsFromPreset(DEFAULT_THEME_PRESET);

  if (typeof value === 'string') {
    const legacyPreset = LEGACY_THEME_MAP[value];
    if (legacyPreset) {
      return createThemeSettingsFromPreset(legacyPreset);
    }
    if (isThemePresetId(value)) {
      return createThemeSettingsFromPreset(value);
    }
    return fallback;
  }

  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const record = value as Partial<ThemeSettings> & { colors?: Partial<ThemeColors> };
  const basePreset =
    typeof record.presetId === 'string' && isThemePresetId(record.presetId)
      ? record.presetId
      : DEFAULT_THEME_PRESET;
  const baseColors = getThemePresetColors(basePreset);
  const colors = normalizeColors(record.colors ?? {}, baseColors);
  if (record.presetId === 'custom') {
    return { presetId: 'custom', colors };
  }

  const presetId = inferPresetId(colors);
  return { presetId, colors };
}

export function parseStoredThemeSettings(raw: string | null): ThemeSettings {
  if (!raw) {
    return createThemeSettingsFromPreset(DEFAULT_THEME_PRESET);
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeThemeSettings(parsed);
  } catch {
    return normalizeThemeSettings(raw);
  }
}

export function serializeThemeSettings(settings: ThemeSettings): string {
  const normalized = normalizeThemeSettings(settings);
  return JSON.stringify(normalized);
}

export function isValidThemeColors(colors: ThemeColors): boolean {
  return Boolean(parseColor(colors.background) && parseColor(colors.surface) && parseColor(colors.accent));
}
