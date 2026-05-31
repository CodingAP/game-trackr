const PLATFORM_ICON_SLUGS: Record<string, string> = {
  linux: 'linux',
  dos: 'dos',
  'pc dos': 'dos',
  windows: 'windows',
  'windows 3.x': 'windows',
  'windows 95': 'windows',
  'windows 98': 'windows',
  macintosh: 'mac',
  mac: 'mac',
  'apple macintosh': 'mac',
  'apple ii': 'apple-ii',
  playstation: 'playstation',
  'playstation 2': 'playstation-2',
  'playstation 3': 'playstation-3',
  'playstation 4': 'playstation-4',
  'playstation 5': 'playstation-5',
  psp: 'psp',
  'playstation portable': 'psp',
  'playstation vita': 'ps-vita',
  psvita: 'ps-vita',
  xbox: 'xbox',
  'xbox 360': 'xbox-360',
  'xbox one': 'xbox-one',
  'xbox series x': 'xbox-series',
  'xbox series s': 'xbox-series',
  'nintendo entertainment system': 'nes',
  nes: 'nes',
  'super nintendo entertainment system': 'snes',
  'super nintendo': 'snes',
  snes: 'snes',
  'nintendo 64': 'n64',
  n64: 'n64',
  gamecube: 'gamecube',
  'nintendo gamecube': 'gamecube',
  wii: 'wii',
  'nintendo wii': 'wii',
  'wii u': 'wii-u',
  'nintendo switch': 'switch',
  switch: 'switch',
  'game boy': 'game-boy',
  'game boy color': 'game-boy-color',
  'game boy advance': 'gba',
  gba: 'gba',
  'nintendo ds': 'nds',
  ds: 'nds',
  'nintendo 3ds': 'n3ds',
  '3ds': 'n3ds',
  genesis: 'genesis',
  'sega genesis': 'genesis',
  'mega drive': 'genesis',
  dreamcast: 'dreamcast',
  'sega dreamcast': 'dreamcast',
  saturn: 'saturn',
  'sega saturn': 'saturn',
  arcade: 'arcade',
  'atari 2600': 'atari-2600',
  'atari 7800': 'atari-7800',
  'neo geo': 'neo-geo',
  'neo geo cd': 'neo-geo',
  'pc engine': 'pc-engine',
  turbografx: 'pc-engine',
  'turbografx-16': 'pc-engine',
};

const PLATFORM_MATCHERS: Array<{ pattern: RegExp; slug: string }> = [
  { pattern: /playstation\s*5|ps5/i, slug: 'playstation-5' },
  { pattern: /playstation\s*4|ps4/i, slug: 'playstation-4' },
  { pattern: /playstation\s*3|ps3/i, slug: 'playstation-3' },
  { pattern: /playstation\s*2|ps2/i, slug: 'playstation-2' },
  { pattern: /playstation\s*vita|ps\s*vita/i, slug: 'ps-vita' },
  { pattern: /playstation\s*portable|\bpsp\b/i, slug: 'psp' },
  { pattern: /playstation|\bpsx\b|\bps1\b/i, slug: 'playstation' },
  { pattern: /xbox\s*series/i, slug: 'xbox-series' },
  { pattern: /xbox\s*360/i, slug: 'xbox-360' },
  { pattern: /xbox\s*one/i, slug: 'xbox-one' },
  { pattern: /\bxbox\b/i, slug: 'xbox' },
  { pattern: /switch/i, slug: 'switch' },
  { pattern: /wii\s*u/i, slug: 'wii-u' },
  { pattern: /\bwii\b/i, slug: 'wii' },
  { pattern: /gamecube|game\s*cube/i, slug: 'gamecube' },
  { pattern: /nintendo\s*64|\bn64\b/i, slug: 'n64' },
  { pattern: /super\s*nintendo|\bsnes\b/i, slug: 'snes' },
  { pattern: /nintendo\s*3ds|\b3ds\b/i, slug: 'n3ds' },
  { pattern: /nintendo\s*ds|\bnds\b/i, slug: 'nds' },
  { pattern: /game\s*boy\s*advance|\bgba\b/i, slug: 'gba' },
  { pattern: /game\s*boy\s*color/i, slug: 'game-boy-color' },
  { pattern: /game\s*boy/i, slug: 'game-boy' },
  { pattern: /\bnes\b|nintendo entertainment system/i, slug: 'nes' },
  { pattern: /dreamcast/i, slug: 'dreamcast' },
  { pattern: /saturn/i, slug: 'saturn' },
  { pattern: /genesis|mega\s*drive/i, slug: 'genesis' },
  { pattern: /windows/i, slug: 'windows' },
  { pattern: /\bdos\b/i, slug: 'dos' },
  { pattern: /linux/i, slug: 'linux' },
  { pattern: /macintosh|\bmac\b/i, slug: 'mac' },
  { pattern: /arcade/i, slug: 'arcade' },
];

export function getPlatformIconSlug(platformName: string): string {
  const normalized = platformName.trim().toLowerCase();
  if (PLATFORM_ICON_SLUGS[normalized]) {
    return PLATFORM_ICON_SLUGS[normalized];
  }

  for (const matcher of PLATFORM_MATCHERS) {
    if (matcher.pattern.test(platformName)) {
      return matcher.slug;
    }
  }

  return 'default';
}

export const PLATFORM_ICON_DIR = '/icons/platforms';

export const PLATFORM_ICON_EXTENSIONS = ['png', 'webp', 'jpg', 'jpeg'] as const;

export function getPlatformIconCandidates(slug: string): string[] {
  return PLATFORM_ICON_EXTENSIONS.map((ext) => `${PLATFORM_ICON_DIR}/${slug}.${ext}`);
}

export function getPlatformIconUrl(platformName: string): string {
  return getPlatformIconCandidates(getPlatformIconSlug(platformName))[0];
}

export const KNOWN_PLATFORM_ICON_SLUGS = [
  'default',
  'linux',
  'dos',
  'windows',
  'mac',
  'playstation',
  'playstation-2',
  'playstation-3',
  'playstation-4',
  'playstation-5',
  'psp',
  'ps-vita',
  'xbox',
  'xbox-360',
  'xbox-one',
  'xbox-series',
  'nes',
  'snes',
  'n64',
  'gamecube',
  'wii',
  'wii-u',
  'switch',
  'game-boy',
  'game-boy-color',
  'gba',
  'nds',
  'n3ds',
  'genesis',
  'dreamcast',
  'saturn',
  'arcade',
  'atari-2600',
  'neo-geo',
  'pc-engine',
  'apple-ii',
] as const;
