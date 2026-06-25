export interface GameMeta {
  slug: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGameBody {
  slug: string;
  name: string;
  content?: string;
}

export interface DuplicateGameBody {
  slug: string;
  name: string;
}

export interface CompletionTag {
  id: string;
  name: string;
  showInSummary?: boolean;
  /** @deprecated v1 only — removed during migration to v2 */
  checkboxIds?: string[];
}

export interface CompletionTagsData {
  tags: CompletionTag[];
}

export interface JournalPage {
  id: string;
  name: string;
  order: number;
}

export interface JournalData {
  version: number;
  pages: JournalPage[];
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
  /** When true, a top-level checkbox is excluded from the overall completion total. Defaults to counting. */
  excludeFromCompletion?: boolean;
}

export interface CheckboxConnectionsData {
  checkboxes: ManagedCheckbox[];
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

export interface MobyGamesLink {
  gameId: number;
  linkedAt: string;
}

export interface MobyGamesLinkBody {
  gameId: number;
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
  completionTags: CompletionTagsData;
  images: JournalExportImage[];
}

export interface JournalExportBundle {
  version: typeof JOURNAL_EXPORT_VERSION;
  exportedAt: string;
  name: string;
  slug: string;
  journal: FullJournalData;
  checkboxes: CheckboxConnectionsData;
  completionTags: CompletionTagsData;
  maps?: GameMapsData;
  imageLibrary?: ImageLibraryData;
  images: JournalExportImage[];
}

export interface ImportGameBody {
  slug: string;
  name: string;
  sourceSlug?: string;
  journal: FullJournalData;
  checkboxes: CheckboxConnectionsData;
  completionTags: CompletionTagsData;
  maps?: GameMapsData;
  imageLibrary?: ImageLibraryData;
  images: JournalExportImage[];
}

export interface EditorStateBody {
  journal: FullJournalData;
  checkboxes: CheckboxConnectionsData;
  completionTags: CompletionTagsData;
  maps: GameMapsData;
  imageLibrary: ImageLibraryData;
}
