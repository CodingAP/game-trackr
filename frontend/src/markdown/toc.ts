export interface TocEntry {
  id: string;
  text: string;
  level: number;
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
    return '<p class="text-sm text-faint">No sections yet.</p>';
  }

  const tree = buildTocTree(entries);
  return `<ul class="toc-tree">${tree.map(renderTocNode).join('')}</ul>`;
}

export function wireTocNav(tocRoot: HTMLElement): () => void {
  const handlers: Array<{ element: Element; handler: (event: Event) => void }> = [];

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
