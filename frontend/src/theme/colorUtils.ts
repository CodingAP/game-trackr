export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function clamp(value: number, min = 0, max = 255): number {
  return Math.min(max, Math.max(min, value));
}

export function parseColor(input: string): RGB | null {
  const value = input.trim();
  const short = /^#?([0-9a-f]{3})$/i.exec(value);
  if (short) {
    const [r, g, b] = short[1].split('');
    return {
      r: parseInt(r + r, 16),
      g: parseInt(g + g, 16),
      b: parseInt(b + b, 16),
    };
  }

  const long = /^#?([0-9a-f]{6})$/i.exec(value);
  if (long) {
    return {
      r: parseInt(long[1].slice(0, 2), 16),
      g: parseInt(long[1].slice(2, 4), 16),
      b: parseInt(long[1].slice(4, 6), 16),
    };
  }

  return null;
}

export function normalizeHex(input: string, fallback: string): string {
  const parsed = parseColor(input);
  if (!parsed) return fallback;
  return `#${[parsed.r, parsed.g, parsed.b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function rgbToCss(rgb: RGB): string {
  return `${rgb.r} ${rgb.g} ${rgb.b}`;
}

export function mix(a: RGB, b: RGB, weight: number): RGB {
  const w = Math.min(1, Math.max(0, weight));
  return {
    r: Math.round(a.r + (b.r - a.r) * w),
    g: Math.round(a.g + (b.g - a.g) * w),
    b: Math.round(a.b + (b.b - a.b) * w),
  };
}

export function luminance(rgb: RGB): number {
  const channels = [rgb.r, rgb.g, rgb.b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function adjust(rgb: RGB, amount: number): RGB {
  if (amount >= 0) {
    return {
      r: clamp(Math.round(rgb.r + (255 - rgb.r) * amount)),
      g: clamp(Math.round(rgb.g + (255 - rgb.g) * amount)),
      b: clamp(Math.round(rgb.b + (255 - rgb.b) * amount)),
    };
  }

  const factor = 1 + amount;
  return {
    r: clamp(Math.round(rgb.r * factor)),
    g: clamp(Math.round(rgb.g * factor)),
    b: clamp(Math.round(rgb.b * factor)),
  };
}
