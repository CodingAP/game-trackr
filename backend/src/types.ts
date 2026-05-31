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
