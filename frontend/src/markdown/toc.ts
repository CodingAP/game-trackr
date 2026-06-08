import type { JournalPage } from '../types/index.js';

export interface TocEntry {
  id: string;
  text: string;
  level: number;
}

export interface TocPageEntry {
  id: string;
  name: string;
  active: boolean;
}

export interface TocNode extends TocEntry {
  children: TocNode[];
}

export function buildToc(container: HTMLElement): TocEntry[] {
  const entries: TocEntry[] = [];
  const usedIds = new Set<string>();

  container.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    const level = Number(heading.tagName.charAt(1));
    const text = heading.textContent?.trim() ?? '';
    if (!text) return;

    const id = uniqueHeadingId(text, usedIds);
    heading.id = id;
    entries.push({ id, text, level });
  });

  return entries;
}

export function buildTocTree(entries: TocEntry[]): TocNode[] {
  const root: TocNode[] = [];
  const stack: TocNode[] = [];

  for (const entry of entries) {
    const node: TocNode = { ...entry, children: [] };

    while (stack.length > 0 && stack[stack.length - 1].level >= entry.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);
  }

  return root;
}

export function renderTocNav(entries: TocEntry[]): string {
  if (entries.length === 0) {
    return '<p class="text-sm text-faint">No sections on this page.</p>';
  }

  const tree = buildTocTree(entries);
  return `<ul class="toc-tree">${tree.map(renderTocNode).join('')}</ul>`;
}

export function renderJournalTocNav(
  pages: JournalPage[],
  activePageId: string,
  sectionEntries: TocEntry[],
  gameSlug: string,
): string {
  const sortedPages = [...pages].sort((a, b) => a.order - b.order);
  const pageItems = sortedPages
    .map(
      (page) => `
        <li class="toc-page-item${page.id === activePageId ? ' is-active' : ''}">
          <button
            type="button"
            class="toc-page-link"
            data-page-link="${page.id}"
            data-game-slug="${escapeHtml(gameSlug)}"
            aria-current="${page.id === activePageId ? 'page' : 'false'}"
          >
            ${escapeHtml(page.name.trim() || 'Untitled page')}
          </button>
        </li>
      `,
    )
    .join('');

  const sections =
    sectionEntries.length > 0
      ? `
        <div class="toc-sections">
          <p class="toc-sections-label">On this page</p>
          ${renderTocNav(sectionEntries)}
        </div>
      `
      : '';

  return `
    <div class="journal-toc">
      <div class="toc-pages">
        <p class="toc-pages-label">Pages</p>
        <ul class="toc-page-list">${pageItems}</ul>
      </div>
      ${sections}
    </div>
  `;
}

export function wireTocNav(
  tocRoot: HTMLElement,
  options: { onPageChange?: (pageId: string) => void } = {},
): () => void {
  const handlers: Array<{ element: Element; handler: (event: Event) => void }> = [];

  tocRoot.querySelectorAll('[data-page-link]').forEach((button) => {
    const handler = (event: Event) => {
      event.preventDefault();
      const pageId = (button as HTMLElement).dataset.pageLink;
      if (!pageId) return;
      options.onPageChange?.(pageId);
    };
    button.addEventListener('click', handler);
    handlers.push({ element: button, handler });
  });

  tocRoot.querySelectorAll('[data-target]').forEach((button) => {
    const handler = (event: Event) => {
      event.preventDefault();
      const id = (button as HTMLElement).dataset.target;
      if (!id) return;
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    button.addEventListener('click', handler);
    handlers.push({ element: button, handler });
  });

  tocRoot.querySelectorAll('[data-toggle]').forEach((button) => {
    const handler = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();

      const toggle = button as HTMLButtonElement;
      const node = toggle.closest('.toc-node');
      const subtree = node?.querySelector(':scope > .toc-subtree');
      if (!subtree) return;

      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      subtree.classList.toggle('is-collapsed', expanded);
    };
    button.addEventListener('click', handler);
    handlers.push({ element: button, handler });
  });

  return () => {
    handlers.forEach(({ element, handler }) => {
      element.removeEventListener('click', handler);
    });
  };
}

function renderTocNode(node: TocNode): string {
  const hasChildren = node.children.length > 0;
  const levelClass = `toc-depth-${node.level}`;

  const toggle = hasChildren
    ? `<button type="button" class="toc-toggle" data-toggle aria-expanded="true" aria-label="Toggle ${escapeHtml(node.text)}">
         <span class="toc-toggle-icon" aria-hidden="true"></span>
       </button>`
    : '<span class="toc-toggle-spacer" aria-hidden="true"></span>';

  const children = hasChildren
    ? `<ul class="toc-subtree">${node.children.map(renderTocNode).join('')}</ul>`
    : '';

  return `
    <li class="toc-node ${levelClass}">
      <div class="toc-row">
        ${toggle}
        <button type="button" class="toc-link" data-target="${node.id}">
          ${escapeHtml(node.text)}
        </button>
      </div>
      ${children}
    </li>
  `;
}

function uniqueHeadingId(text: string, usedIds: Set<string>): string {
  const base = slugify(text) || 'section';
  let id = base;
  let counter = 2;

  while (usedIds.has(id)) {
    id = `${base}-${counter}`;
    counter += 1;
  }

  usedIds.add(id);
  return id;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
