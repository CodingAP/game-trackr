import { applyThemeSettings } from './applyTheme.js';
import { parseStoredThemeSettings } from './storage.js';

const THEME_STORAGE_KEY = 'game-tracking:theme';

try {
  applyThemeSettings(parseStoredThemeSettings(localStorage.getItem(THEME_STORAGE_KEY)));
} catch {
  // Ignore invalid stored theme data.
}
