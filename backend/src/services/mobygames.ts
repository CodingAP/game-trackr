const API_BASE = 'https://api.mobygames.com/v1';

export interface MobyGamesSearchHit {
  gameId: number;
  title: string;
  mobyUrl: string;
}

export interface MobyGamesPlatformInfo {
  name: string;
  releaseDate: string | null;
}

export interface MobyGamesGameInfo {
  gameId: number;
  title: string;
  description: string | null;
  mobyUrl: string;
  officialUrl: string | null;
  mobyScore: number | null;
  numVotes: number | null;
  coverUrl: string | null;
  coverThumbnailUrl: string | null;
  genres: string[];
  platforms: MobyGamesPlatformInfo[];
  alternateTitles: string[];
}

interface MobyCover {
  image?: string;
  thumbnail_image?: string;
}

interface MobyGenre {
  genre_name?: string;
}

interface MobyPlatform {
  platform_name?: string;
  first_release_date?: string | null;
}

interface MobyAlternateTitle {
  title?: string;
}

interface MobyGameRaw {
  game_id?: number;
  title?: string;
  description?: string | null;
  moby_url?: string;
  official_url?: string | null;
  moby_score?: number | null;
  num_votes?: number | null;
  sample_cover?: MobyCover | null;
  genres?: MobyGenre[];
  platforms?: MobyPlatform[];
  alternate_titles?: MobyAlternateTitle[];
}

interface MobySearchResponse {
  games?: Array<{ game_id?: number; title?: string; moby_url?: string }>;
}

interface MobyGameResponse {
  games?: MobyGameRaw[];
  game_id?: number;
}

export function isMobyGamesConfigured(): boolean {
  return Boolean(process.env.MOBYGAMES_API_KEY?.trim());
}

function getApiKey(): string {
  const key = process.env.MOBYGAMES_API_KEY?.trim();
  if (!key) {
    throw new Error('MobyGames API key is not configured. Set MOBYGAMES_API_KEY.');
  }
  return key;
}

async function mobyRequest<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set('api_key', getApiKey());
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString());
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(body.message || body.error || `MobyGames API error (${response.status})`);
  }

  return body as T;
}

function normalizeGame(raw: MobyGameRaw): MobyGamesGameInfo {
  if (!raw.game_id || !raw.title || !raw.moby_url) {
    throw new Error('Incomplete game data from MobyGames');
  }

  return {
    gameId: raw.game_id,
    title: raw.title,
    description: raw.description ?? null,
    mobyUrl: raw.moby_url,
    officialUrl: raw.official_url ?? null,
    mobyScore: raw.moby_score ?? null,
    numVotes: raw.num_votes ?? null,
    coverUrl: raw.sample_cover?.image ?? null,
    coverThumbnailUrl: raw.sample_cover?.thumbnail_image ?? null,
    genres: (raw.genres ?? [])
      .map((genre) => genre.genre_name)
      .filter((name): name is string => Boolean(name)),
    platforms: (raw.platforms ?? [])
      .map((platform) => ({
        name: platform.platform_name ?? 'Unknown',
        releaseDate: platform.first_release_date ?? null,
      }))
      .filter((platform) => platform.name !== 'Unknown' || platform.releaseDate),
    alternateTitles: (raw.alternate_titles ?? [])
      .map((entry) => entry.title)
      .filter((title): title is string => Boolean(title)),
  };
}

function extractGameRaw(data: MobyGameResponse): MobyGameRaw {
  if (data.games?.[0]) return data.games[0];
  if (data.game_id) return data as MobyGameRaw;
  throw new Error('Game not found on MobyGames');
}

export async function searchMobyGames(title: string, limit = 20): Promise<MobyGamesSearchHit[]> {
  const trimmed = title.trim();
  if (!trimmed) return [];

  const data = await mobyRequest<MobySearchResponse>('/games', {
    title: trimmed,
    format: 'brief',
    limit: Math.min(Math.max(limit, 1), 50),
  });

  return (data.games ?? [])
    .filter((game) => game.game_id && game.title && game.moby_url)
    .map((game) => ({
      gameId: game.game_id!,
      title: game.title!,
      mobyUrl: game.moby_url!,
    }));
}

export async function fetchMobyGameInfo(gameId: number): Promise<MobyGamesGameInfo> {
  const data = await mobyRequest<MobyGameResponse>(`/games/${gameId}`, { format: 'normal' });
  return normalizeGame(extractGameRaw(data));
}

export function parseMobyGamesReference(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  const idFromQuery = trimmed.match(/[?&]id=(\d+)/i)?.[1];
  if (idFromQuery) return Number(idFromQuery);

  const idFromPath = trimmed.match(/mobygames\.com\/game(?:\/[^/?#]+)?\/(\d+)/i)?.[1];
  if (idFromPath) return Number(idFromPath);

  return null;
}
