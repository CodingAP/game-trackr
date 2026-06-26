import { renderCollapsiblePanel } from './CollapsiblePanel.js';
import { getPlatformIconSlug, getPlatformIconUrl } from '../platformIcons.js';
import type { MobyGamesGameInfo, MobyGamesPlatformInfo } from '../types/index.js';
import { parseReleaseDateSortKey, getEarliestReleaseLabel } from '../utils/mobyReleaseDate.js';
import { formatDescriptionHtml, descriptionToPlainText, truncatePlainText } from '../utils/sanitizeHtml.js';

export interface LibraryMobyCardData {
  coverUrl: string | null;
  releaseDateLabel: string | null;
  description: string | null;
  genres: string[];
  platforms: MobyGamesPlatformInfo[];
  mobyScore: number | null;
  numVotes: number | null;
  title: string;
}

export function extractLibraryMobyCardData(info: MobyGamesGameInfo): LibraryMobyCardData {
  return {
    coverUrl: info.coverUrl,
    releaseDateLabel: getEarliestReleaseLabel(info),
    description: info.description ? descriptionToPlainText(info.description) : null,
    genres: info.genres,
    platforms: info.platforms,
    mobyScore: info.mobyScore,
    numVotes: info.numVotes,
    title: info.title,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function sortPlatformsByRelease(platforms: MobyGamesPlatformInfo[]): MobyGamesPlatformInfo[] {
  return [...platforms].sort((a, b) => {
    const dateCompare = parseReleaseDateSortKey(a.releaseDate) - parseReleaseDateSortKey(b.releaseDate);
    if (dateCompare !== 0) return dateCompare;
    return a.name.localeCompare(b.name);
  });
}

function renderVersions(platforms: MobyGamesGameInfo['platforms']): string {
  if (platforms.length === 0) {
    return `
      <div class="game-info-versions">
        <h3 class="game-info-versions-heading">Versions</h3>
        <p class="game-info-versions-empty text-faint text-sm">No platform data.</p>
      </div>
    `;
  }

  const sortedPlatforms = sortPlatformsByRelease(platforms);

  return `
    <div class="game-info-versions">
      <h3 class="game-info-versions-heading">Versions</h3>
      <ul class="game-info-platforms" aria-label="Platforms">
        ${sortedPlatforms
          .map((platform) => {
            const slug = getPlatformIconSlug(platform.name);
            const iconUrl = getPlatformIconUrl(platform.name);
            const release = platform.releaseDate
              ? `<span class="game-info-platform-date">${escapeHtml(platform.releaseDate)}</span>`
              : '';

            return `
              <li class="game-info-platform">
                <img
                  src="${escapeHtml(iconUrl)}"
                  alt=""
                  class="game-info-platform-icon"
                  width="24"
                  height="24"
                  loading="lazy"
                  data-platform-slug="${escapeHtml(slug)}"
                />
                <span class="game-info-platform-name">${escapeHtml(platform.name)}</span>
                ${release}
              </li>
            `;
          })
          .join('')}
      </ul>
    </div>
  `;
}

export function renderGameInfoHtml(info: MobyGamesGameInfo): string {
  const coverUrl = info.coverUrl;
  const descriptionHtml = info.description ? formatDescriptionHtml(info.description) : '';
  const layoutClass = coverUrl ? 'game-info-layout has-cover' : 'game-info-layout';

  const content = `
    <div class="${layoutClass}">
      ${
        coverUrl
          ? `
            <div class="game-info-cover-wrap">
              <img
                src="${escapeHtml(coverUrl)}"
                alt="${escapeHtml(info.title)} cover art"
                class="game-info-cover"
                loading="lazy"
              />
            </div>
          `
          : ''
      }
      ${
        descriptionHtml
          ? `<div class="game-info-description">${descriptionHtml}</div>`
          : '<div class="game-info-description"><p class="text-faint text-sm">No description available.</p></div>'
      }
      ${renderVersions(info.platforms)}
    </div>
    <div class="game-info-links">
      ${
        info.mobyUrl.trim()
          ? `<a href="${escapeHtml(info.mobyUrl)}" class="game-info-link" target="_blank" rel="noopener noreferrer">
              View on MobyGames
            </a>`
          : ''
      }
    </div>
  `;

  return renderCollapsiblePanel({
    title: info.title,
    className: 'game-info',
    content,
  });
}

export function renderLibraryMobyHtml(info: MobyGamesGameInfo): string {
  const coverUrl = info.coverUrl;
  const description = info.description
    ? truncatePlainText(descriptionToPlainText(info.description), 150)
    : '';

  if (!coverUrl && !description) return '';

  return `
    <div class="library-game-moby">
      ${
        coverUrl
          ? `
            <img
              src="${escapeHtml(coverUrl)}"
              alt="${escapeHtml(info.title)} cover art"
              class="library-game-cover"
              loading="lazy"
            />
          `
          : ''
      }
      ${
        description
          ? `<p class="library-game-description">${escapeHtml(description)}</p>`
          : ''
      }
    </div>
  `;
}

export function wireGameInfoPanel(root: HTMLElement): void {
  root.querySelectorAll('.game-info-platform-icon').forEach((element) => {
    const img = element as HTMLImageElement;
    const slug = img.dataset.platformSlug;
    if (!slug) return;

    let attempt = 0;
    const extensions = ['png', 'webp', 'jpg', 'jpeg'];

    img.addEventListener('error', () => {
      attempt += 1;
      if (attempt < extensions.length) {
        img.src = `/icons/platforms/${slug}.${extensions[attempt]}`;
        return;
      }

      if (slug !== 'default') {
        img.dataset.platformSlug = 'default';
        attempt = 0;
        img.src = '/icons/platforms/default.png';
        return;
      }

      img.hidden = true;
    });
  });
}
