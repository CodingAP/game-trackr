import type {
  CompletionTagsData,
  GameMeta,
  MobyGamesGameInfo,
  MobyGamesGameResponse,
  MobyGamesSearchHit,
  UploadedImage,
} from '../types/index.js';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? 'Request failed');
  }
  return response.json() as Promise<T>;
}

export async function fetchGames(): Promise<GameMeta[]> {
  return request<GameMeta[]>('/api/games');
}

export async function fetchGame(slug: string): Promise<GameMeta> {
  return request<GameMeta>(`/api/games/${slug}`);
}

export async function fetchGameContent(slug: string): Promise<string> {
  const response = await fetch(`/api/games/${slug}/content`);
  if (!response.ok) {
    throw new Error('Failed to load content');
  }
  return response.text();
}

export async function createGame(slug: string, name: string, content?: string): Promise<GameMeta> {
  return request<GameMeta>('/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, name, content }),
  });
}

export async function saveGameContent(slug: string, content: string): Promise<GameMeta> {
  return request<GameMeta>(`/api/games/${slug}/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

export async function uploadGameImage(slug: string, file: File): Promise<UploadedImage> {
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`/api/games/${slug}/images`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? 'Upload failed');
  }

  return response.json() as Promise<UploadedImage>;
}

export async function fetchGameImages(slug: string): Promise<UploadedImage[]> {
  return request<UploadedImage[]>(`/api/games/${slug}/images`);
}

export async function fetchCompletionTags(slug: string): Promise<CompletionTagsData> {
  return request<CompletionTagsData>(`/api/games/${slug}/completion-tags`);
}

export async function saveCompletionTags(
  slug: string,
  data: CompletionTagsData,
): Promise<GameMeta> {
  return request<GameMeta>(`/api/games/${slug}/completion-tags`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteGame(slug: string): Promise<void> {
  const response = await fetch(`/api/games/${slug}`, { method: 'DELETE' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? 'Delete failed');
  }
}

export async function duplicateGame(
  sourceSlug: string,
  slug: string,
  name: string,
): Promise<GameMeta> {
  return request<GameMeta>(`/api/games/${sourceSlug}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, name }),
  });
}

export async function fetchMobyGamesStatus(): Promise<{ configured: boolean }> {
  return request<{ configured: boolean }>('/api/mobygames/status');
}

export async function searchMobyGames(title: string, limit = 20): Promise<MobyGamesSearchHit[]> {
  const params = new URLSearchParams({ title, limit: String(limit) });
  const response = await request<{ results: MobyGamesSearchHit[] }>(`/api/mobygames/search?${params}`);
  return response.results;
}

export async function fetchMobyGamesForGame(slug: string): Promise<MobyGamesGameResponse> {
  const response = await fetch(`/api/games/${slug}/mobygames`);
  const body = await response.json().catch(() => ({ error: response.statusText }));
  if (!response.ok && response.status !== 503) {
    throw new Error(body.error ?? 'Failed to load MobyGames info');
  }
  return {
    configured: body.configured ?? false,
    link: body.link ?? null,
    info: body.info ?? null,
  };
}

export async function linkMobyGamesEntry(
  slug: string,
  gameId: number,
): Promise<{ link: MobyGamesGameResponse['link']; info: MobyGamesGameInfo }> {
  return request<{ link: MobyGamesGameResponse['link']; info: MobyGamesGameInfo }>(
    `/api/games/${slug}/mobygames`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId }),
    },
  );
}

export async function unlinkMobyGamesEntry(slug: string): Promise<void> {
  const response = await fetch(`/api/games/${slug}/mobygames`, { method: 'DELETE' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? 'Failed to unlink MobyGames entry');
  }
}
