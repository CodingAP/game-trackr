export interface CompletionTag {
  id: string;
  name: string;
  checkboxIds: string[];
  showInSummary?: boolean;
}

export interface CompletionTagsData {
  tags: CompletionTag[];
}

export type ThemeId = 'dark' | 'light' | 'midnight' | 'forest';

export interface ThemeOption {
  id: ThemeId;
  name: string;
  description: string;
  preview: [string, string, string];
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'dark',
    name: 'Dark',
    description: 'Slate background with emerald accents',
    preview: ['#020617', '#0f172a', '#10b981'],
  },
  {
    id: 'light',
    name: 'Light',
    description: 'Clean light background with emerald accents',
    preview: ['#f8fafc', '#ffffff', '#059669'],
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep navy tones with sky blue accents',
    preview: ['#080c18', '#0f172a', '#0ea5e9'],
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Dark green tones with bright green accents',
    preview: ['#050f0a', '#0f1f14', '#22c55e'],
  },
];

export interface GameMeta {
  slug: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProgress {
  gameSlug: string;
  checkedItems: Record<string, boolean>;
  stats: Record<string, number | string>;
  updatedAt: string;
}

export interface PlaytimeEntry {
  id: string;
  playedAt: string;
  durationMinutes: number;
}

export interface GamePlaytime {
  gameSlug: string;
  entries: PlaytimeEntry[];
  updatedAt: string;
}

export interface GameNotes {
  gameSlug: string;
  content: string;
  updatedAt: string;
}

export interface UploadedImage {
  filename: string;
  url: string;
}

export interface ImageViewportSettings {
  enabled: boolean;
  width: number;
  height: number;
  scaleToFit: boolean;
}

export type ViewName = 'library' | 'editor' | 'viewer' | 'settings';

export type EditorTabId = 'content' | 'images' | 'tags' | 'admin';

export interface RouteMatch {
  view: ViewName;
  params: Record<string, string>;
}

export interface MobyGamesLink {
  gameId: number;
  linkedAt: string;
}

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

export interface MobyGamesGameResponse {
  configured: boolean;
  link: MobyGamesLink | null;
  info: MobyGamesGameInfo | null;
}

export const JOURNAL_EXPORT_VERSION = 1;

export interface JournalExportImage {
  filename: string;
  mimeType: string;
  data: string;
}

export interface JournalExportBundle {
  version: typeof JOURNAL_EXPORT_VERSION;
  exportedAt: string;
  name: string;
  slug: string;
  content: string;
  completionTags: CompletionTagsData;
  images: JournalExportImage[];
}

export interface ImportGameRequest {
  slug: string;
  name: string;
  sourceSlug?: string;
  content: string;
  completionTags: CompletionTagsData;
  images: JournalExportImage[];
}

export interface AuthSession {
  token: string;
  expiresAt: string;
}

export interface AuthStatus {
  configured: boolean;
  authenticated: boolean;
  expiresAt?: string;
}
