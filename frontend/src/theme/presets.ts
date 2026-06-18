import type { ThemeColors, ThemePresetId, ThemePresetOption, ThemeSettings } from './types.js';

export const DEFAULT_THEME_PRESET: ThemePresetId = 'midnight-dark';

export const THEME_PRESET_OPTIONS: ThemePresetOption[] = [
  {
    id: 'midnight-dark',
    name: 'Midnight Dark',
    description: 'Deep navy with sky blue accents',
    colors: { background: '#080c18', surface: '#0f172a', accent: '#0ea5e9' },
  },
  {
    id: 'midnight-light',
    name: 'Midnight Light',
    description: 'Cool light blues with ocean accents',
    colors: { background: '#f0f9ff', surface: '#ffffff', accent: '#0284c7' },
  },
  {
    id: 'forest-dark',
    name: 'Forest Dark',
    description: 'Deep greens with bright leaf accents',
    colors: { background: '#050f0a', surface: '#0f1f14', accent: '#22c55e' },
  },
  {
    id: 'forest-light',
    name: 'Forest Light',
    description: 'Soft mint tones with green accents',
    colors: { background: '#f0fdf4', surface: '#ffffff', accent: '#16a34a' },
  },
  {
    id: 'neon-dark',
    name: 'Neon Dark',
    description: 'Electric violet with bright neon accents',
    colors: { background: '#0a0614', surface: '#140a1f', accent: '#e879f9' },
  },
  {
    id: 'neon-light',
    name: 'Neon Light',
    description: 'Bright lavender with vivid magenta accents',
    colors: { background: '#fdf4ff', surface: '#ffffff', accent: '#c026d3' },
  },
  {
    id: 'crimson-dark',
    name: 'Crimson Dark',
    description: 'Deep crimson with bright red accents',
    colors: { background: '#140808', surface: '#1e0c0c', accent: '#ef4444' },
  },
  {
    id: 'crimson-light',
    name: 'Crimson Light',
    description: 'Warm blush with rich red accents',
    colors: { background: '#fff1f2', surface: '#ffffff', accent: '#dc2626' },
  },
];

const PRESET_MAP = new Map(THEME_PRESET_OPTIONS.map((preset) => [preset.id, preset]));

export function getThemePreset(id: ThemePresetId): ThemePresetOption {
  return PRESET_MAP.get(id) ?? THEME_PRESET_OPTIONS[0];
}

export function getThemePresetColors(id: ThemePresetId): ThemeColors {
  return { ...getThemePreset(id).colors };
}

export function createThemeSettingsFromPreset(id: ThemePresetId): ThemeSettings {
  return {
    presetId: id,
    colors: getThemePresetColors(id),
  };
}

export function getDefaultThemeSettings(): ThemeSettings {
  return createThemeSettingsFromPreset(DEFAULT_THEME_PRESET);
}

export function isThemePresetId(value: string): value is ThemePresetId {
  return PRESET_MAP.has(value as ThemePresetId);
}