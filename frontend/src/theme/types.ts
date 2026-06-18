export interface ThemeColors {
  background: string;
  surface: string;
  accent: string;
}

export type ThemePresetId =
  | 'midnight-dark'
  | 'midnight-light'
  | 'forest-dark'
  | 'forest-light'
  | 'neon-dark'
  | 'neon-light'
  | 'crimson-dark'
  | 'crimson-light';

export interface ThemeSettings {
  presetId: ThemePresetId | 'custom';
  colors: ThemeColors;
}

export interface ThemePresetOption {
  id: ThemePresetId;
  name: string;
  description: string;
  colors: ThemeColors;
}
