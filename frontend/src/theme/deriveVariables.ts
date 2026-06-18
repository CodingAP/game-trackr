import { adjust, luminance, mix, parseColor, rgbToCss } from './colorUtils.js';
import type { ThemeColors } from './types.js';

export function deriveThemeVariables(colors: ThemeColors): Record<string, string> {
  const bg = parseColor(colors.background);
  const surface = parseColor(colors.surface);
  const accent = parseColor(colors.accent);
  if (!bg || !surface || !accent) {
    throw new Error('Invalid theme colors');
  }

  const isDark = luminance(bg) < 0.45;
  const textBase = isDark ? { r: 241, g: 245, b: 249 } : { r: 15, g: 23, b: 42 };
  const textHeading = isDark ? { r: 248, g: 250, b: 252 } : textBase;

  const text = mix(textBase, bg, isDark ? 0.08 : 0.05);
  const textMuted = mix(textBase, bg, isDark ? 0.45 : 0.4);
  const textFaint = mix(textBase, bg, isDark ? 0.55 : 0.5);
  const surfaceMuted = mix(bg, surface, 0.55);
  const border = mix(surface, textBase, isDark ? 0.22 : 0.12);
  const borderSubtle = mix(surface, textBase, isDark ? 0.32 : 0.18);
  const hover = mix(surface, textBase, isDark ? 0.14 : 0.06);
  const headerBg = mix(bg, surface, 0.35);
  const accentHover = isDark ? adjust(accent, 0.15) : adjust(accent, -0.12);
  const accentSoft = isDark ? adjust(accent, 0.35) : adjust(accent, 0.08);
  const editorBg = mix(bg, surface, 0.25);
  const editorGutterText = mix(textFaint, surface, 0.35);
  const editorStrong = isDark ? adjust(text, 0.05) : adjust(text, -0.05);
  const editorEmphasis = mix(text, textMuted, 0.35);
  const editorCodeBg = mix(surface, bg, 0.35);

  return {
    '--bg': rgbToCss(bg),
    '--surface': rgbToCss(surface),
    '--surface-muted': rgbToCss(surfaceMuted),
    '--border': rgbToCss(border),
    '--border-subtle': rgbToCss(borderSubtle),
    '--text': rgbToCss(text),
    '--text-muted': rgbToCss(textMuted),
    '--text-faint': rgbToCss(textFaint),
    '--text-heading': rgbToCss(textHeading),
    '--accent': rgbToCss(accent),
    '--accent-hover': rgbToCss(accentHover),
    '--accent-soft': rgbToCss(accentSoft),
    '--hover': rgbToCss(hover),
    '--header-bg': rgbToCss(headerBg),
    '--danger-border': '248 113 113',
    '--editor-bg': rgbToCss(editorBg),
    '--editor-gutter-bg': rgbToCss(surface),
    '--editor-gutter-text': rgbToCss(editorGutterText),
    '--editor-line-active': rgbToCss(hover),
    '--editor-selection': rgbToCss(accent),
    '--editor-heading': rgbToCss(textHeading),
    '--editor-strong': rgbToCss(editorStrong),
    '--editor-emphasis': rgbToCss(editorEmphasis),
    '--editor-link': rgbToCss(accentSoft),
    '--editor-meta': rgbToCss(textFaint),
    '--editor-code-fg': rgbToCss(accentSoft),
    '--editor-code-bg': rgbToCss(editorCodeBg),
    '--editor-quote': rgbToCss(textMuted),
    '--editor-cursor': rgbToCss(accentSoft),
  };
}
