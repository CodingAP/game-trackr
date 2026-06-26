const API_BASE = 'https://retroachievements.org/API';
const MEDIA_BASE = 'https://media.retroachievements.org';

export interface RetroAchievement {
  id: number;
  title: string;
  description: string;
  points: number;
  badgeName: string;
  displayOrder: number;
}

export interface RetroAchievementsGameInfo {
  gameId: number;
  title: string;
  iconUrl: string | null;
  consoleName: string | null;
  achievements: RetroAchievement[];
}

interface RawAchievement {
  ID?: number | string;
  Title?: string;
  Description?: string;
  Points?: number | string;
  BadgeName?: string;
  DisplayOrder?: number | string;
}

interface RawGameExtended {
  ID?: number | string;
  Title?: string;
  ImageIcon?: string;
  ConsoleName?: string;
  Achievements?: Record<string, RawAchievement>;
}

export function isRetroAchievementsConfigured(): boolean {
  return Boolean(process.env.RETROACHIEVEMENTS_API_KEY?.trim());
}

function getApiKey(): string {
  const key = process.env.RETROACHIEVEMENTS_API_KEY?.trim();
  if (!key) {
    throw new Error(
      'RetroAchievements API key is not configured. Set RETROACHIEVEMENTS_API_KEY.',
    );
  }
  return key;
}

/** Parses a RetroAchievements game id from a numeric value or a game URL. */
export function parseRetroAchievementsGameId(reference: string | number): number | null {
  if (typeof reference === 'number') {
    return Number.isInteger(reference) && reference > 0 ? reference : null;
  }

  const trimmed = reference.trim();
  if (/^\d+$/.test(trimmed)) {
    const value = Number(trimmed);
    return value > 0 ? value : null;
  }

  const fromUrl = trimmed.match(/retroachievements\.org\/game\/(\d+)/i)?.[1];
  if (fromUrl) {
    const value = Number(fromUrl);
    return value > 0 ? value : null;
  }

  return null;
}

function toNumber(value: number | string | undefined, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function buildIconUrl(imageIcon: string | undefined): string | null {
  if (!imageIcon) return null;
  if (/^https?:\/\//i.test(imageIcon)) return imageIcon;
  return `${MEDIA_BASE}${imageIcon.startsWith('/') ? '' : '/'}${imageIcon}`;
}

function normalizeGame(raw: RawGameExtended, gameId: number): RetroAchievementsGameInfo {
  const achievementsMap = raw.Achievements ?? {};
  const achievements: RetroAchievement[] = Object.values(achievementsMap)
    .map((entry) => ({
      id: toNumber(entry.ID),
      title: typeof entry.Title === 'string' ? entry.Title : '',
      description: typeof entry.Description === 'string' ? entry.Description : '',
      points: toNumber(entry.Points),
      badgeName: typeof entry.BadgeName === 'string' ? entry.BadgeName : '',
      displayOrder: toNumber(entry.DisplayOrder),
    }))
    .filter((achievement) => achievement.id > 0)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id);

  return {
    gameId: toNumber(raw.ID, gameId) || gameId,
    title: typeof raw.Title === 'string' ? raw.Title : `Game ${gameId}`,
    iconUrl: buildIconUrl(raw.ImageIcon),
    consoleName: typeof raw.ConsoleName === 'string' ? raw.ConsoleName : null,
    achievements,
  };
}

export async function fetchRetroAchievementsGame(
  gameId: number,
): Promise<RetroAchievementsGameInfo> {
  const url = new URL(`${API_BASE}/API_GetGameExtended.php`);
  url.searchParams.set('y', getApiKey());
  url.searchParams.set('i', String(gameId));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`RetroAchievements API error (${response.status})`);
  }

  const body = (await response.json().catch(() => null)) as RawGameExtended | null;
  if (!body || !body.ID) {
    throw new Error(`RetroAchievements game ${gameId} was not found`);
  }

  return normalizeGame(body, gameId);
}
