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
  checkboxIds: string[];
  showInSummary?: boolean;
}

export interface CompletionTagsData {
  tags: CompletionTag[];
}

export interface MobyGamesLink {
  gameId: number;
  linkedAt: string;
}

export interface MobyGamesLinkBody {
  gameId: number;
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

export interface ImportGameBody {
  slug: string;
  name: string;
  sourceSlug?: string;
  content: string;
  completionTags: CompletionTagsData;
  images: JournalExportImage[];
}
