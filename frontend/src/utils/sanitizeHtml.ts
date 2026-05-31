const ALLOWED_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'em',
  'h2',
  'h3',
  'h4',
  'i',
  'li',
  'ol',
  'p',
  'strong',
  'u',
  'ul',
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'rel', 'target']),
};

const UNWRAP_TAGS = new Set(['div', 'span', 'section', 'article']);

function isSafeHref(value: string): boolean {
  const href = value.trim().toLowerCase();
  return href.startsWith('https://') || href.startsWith('http://') || href.startsWith('mailto:');
}

function sanitizeElement(element: Element, doc: Document): void {
  const children = [...element.children];

  for (const child of children) {
    const tag = child.tagName.toLowerCase();

    if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object' || tag === 'embed') {
      child.remove();
      continue;
    }

    if (UNWRAP_TAGS.has(tag)) {
      while (child.firstChild) {
        element.insertBefore(child.firstChild, child);
      }
      child.remove();
      continue;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      child.remove();
      continue;
    }

    for (const attr of [...child.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || name === 'style') {
        child.removeAttribute(attr.name);
        continue;
      }

      if (!ALLOWED_ATTRS[tag]?.has(name)) {
        child.removeAttribute(attr.name);
      }
    }

    if (tag === 'a') {
      const href = child.getAttribute('href');
      if (!href || !isSafeHref(href)) {
        while (child.firstChild) {
          element.insertBefore(child.firstChild, child);
        }
        child.remove();
        continue;
      }
      child.setAttribute('rel', 'noopener noreferrer');
      child.setAttribute('target', '_blank');
    }

    sanitizeElement(child, doc);
  }
}

export function sanitizeHtml(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  sanitizeElement(doc.body, doc);
  return doc.body.innerHTML.trim();
}

export function formatDescriptionHtml(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return '';

  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    return sanitizeHtml(trimmed);
  }

  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const escaped = paragraph
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
      return `<p>${escaped.replaceAll('\n', '<br />')}</p>`;
    })
    .join('');
}

export function descriptionToPlainText(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return '';

  if (typeof DOMParser !== 'undefined' && /<[a-z][\s\S]*>/i.test(trimmed)) {
    return (new DOMParser().parseFromString(trimmed, 'text/html').body.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return trimmed.replace(/\s+/g, ' ').trim();
}

export function truncatePlainText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}
