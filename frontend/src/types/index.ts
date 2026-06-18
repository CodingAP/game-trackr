export interface ProgressBar {
  id: string;
  name: string;
  showInSummary?: boolean;
  /** @deprecated v1 only */
  checkboxIds?: string[];
}

export interface ProgressBarsData {
  tags: ProgressBar[];
}

export interface JournalPage {
  id: string;
  name: string;
  order: number;
}

export interface FullJournalData {
  version: number;
  pages: JournalPage[];
  contents: Record<string, string>;
}

export interface ManagedCheckbox {
  id: string;
  label: string;
  parentId: string | null;
  tagIds: string[];
}

export interface CheckboxConnectionsData {
  checkboxes: ManagedCheckbox[];
}

export interface MapViewport {
  width: number;
  height: number;
}

export interface MapScrollPosition {
  x: number;
  y: number;
}

export interface MapPointType {
  id: string;
  name: string;
  color: string;
}

export interface MapPoint {
  id: string;
  x: number;
  y: number;
  label: string;
  typeId?: string | null;
  checkboxId?: string | null;
}

export interface GameMap {
  id: string;
  name: string;
  imageUrl: string;
  imageFilename: string;
  pointTypes: MapPointType[];
  points: MapPoint[];
}

export interface GameMapsData {
  maps: GameMap[];
}

export interface EditorStateBody {
  journal: FullJournalData;
  checkboxes: CheckboxConnectionsData;
  completionTags: ProgressBarsData;
  maps: GameMapsData;
  imageLibrary: ImageLibraryData;
}

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

export interface ImageLibraryEntry {
  url: string;
  filename: string;
  alt: string;
  source?: {
    label: string;
    url: string;
  };
}

export interface ImageLibraryData {
  images: ImageLibraryEntry[];
}

export interface ImageViewportSettings {
  enabled: boolean;
  width: number;
  height: number;
  scaleToFit: boolean;
  maintainAspectRatio: boolean;
}

export type ViewName = 'library' | 'editor' | 'viewer' | 'settings';

export type EditorTabId = 'content' | 'images' | 'maps' | 'checkboxes' | 'tags' | 'admin';

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

export const JOURNAL_EXPORT_VERSION = 2;
export const JOURNAL_EXPORT_VERSION_LEGACY = 1;

export interface JournalExportImage {
  filename: string;
  mimeType: string;
  data: string;
}

export interface JournalExportBundleV1 {
  version: typeof JOURNAL_EXPORT_VERSION_LEGACY;
  exportedAt: string;
  name: string;
  slug: string;
  content: string;
  completionTags: ProgressBarsData;
  images: JournalExportImage[];
}

export interface JournalExportBundle {
  version: typeof JOURNAL_EXPORT_VERSION;
  exportedAt: string;
  name: string;
  slug: string;
  journal: FullJournalData;
  checkboxes: CheckboxConnectionsData;
  completionTags: ProgressBarsData;
  maps?: GameMapsData;
  imageLibrary?: ImageLibraryData;
  images: JournalExportImage[];
}

export interface ImportGameRequest {
  slug: string;
  name: string;
  sourceSlug?: string;
  journal: FullJournalData;
  checkboxes: CheckboxConnectionsData;
  completionTags: ProgressBarsData;
  maps?: GameMapsData;
  imageLibrary?: ImageLibraryData;
  images: JournalExportImage[];
}

export interface AuthSession {
  token: string;
  expiresAt: string;
  username: string;
}

export interface AuthStatus {
  configured: boolean;
  authenticated: boolean;
  expiresAt?: string;
  username?: string;
}
