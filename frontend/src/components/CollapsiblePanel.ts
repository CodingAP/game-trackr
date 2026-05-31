function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export interface CollapsiblePanelOptions {
  title: string;
  content: string;
  className?: string;
  id?: string;
  defaultOpen?: boolean;
  attributes?: Record<string, string>;
}

export interface WireCollapsiblePanelsOptions {
  onToggle?: (panel: HTMLElement, expanded: boolean) => void;
}

export function renderCollapsiblePanel(options: CollapsiblePanelOptions): string {
  const open = options.defaultOpen !== false;
  const extraClass = options.className ? ` ${options.className}` : '';
  const idAttr = options.id ? ` id="${escapeHtml(options.id)}"` : '';
  const dataAttrs = options.attributes
    ? Object.entries(options.attributes)
        .map(([key, value]) => ` data-${escapeHtml(key)}="${escapeHtml(value)}"`)
        .join('')
    : '';
  const hiddenAttr = open ? '' : ' hidden';

  return `
    <section class="panel collapsible-panel${extraClass}" data-collapsible${idAttr}${dataAttrs}>
      <button type="button" class="collapsible-panel-toggle" aria-expanded="${open ? 'true' : 'false'}">
        <span class="collapsible-panel-title">${escapeHtml(options.title)}</span>
        <span class="collapsible-panel-icon" aria-hidden="true"></span>
      </button>
      <div class="collapsible-panel-body"${hiddenAttr}>
        ${options.content}
      </div>
    </section>
  `;
}

export function wireCollapsiblePanels(
  root: HTMLElement,
  options: WireCollapsiblePanelsOptions = {},
): () => void {
  const onClick = (event: Event) => {
    const target = event.target as Element;
    const toggle = target.closest('.collapsible-panel-toggle') as HTMLButtonElement | null;
    if (!toggle) return;

    event.preventDefault();
    event.stopPropagation();

    const panel = toggle.closest('[data-collapsible]') as HTMLElement | null;
    const body = panel?.querySelector(':scope > .collapsible-panel-body') as HTMLElement | null;
    if (!panel || !body) return;

    const wasExpanded = toggle.getAttribute('aria-expanded') === 'true';
    const isExpanded = !wasExpanded;
    toggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    body.hidden = !isExpanded;
    options.onToggle?.(panel, isExpanded);
  };

  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}
