function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export interface CollapsiblePanelOptions {
  title: string;
  /** Pre-escaped HTML for the title area. Falls back to plain `title` when omitted. */
  titleHtml?: string;
  /** Pre-escaped HTML for action buttons shown in the panel header. */
  titleActions?: string;
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
  const titleContent = options.titleHtml ?? escapeHtml(options.title);
  const actionsMarkup = options.titleActions
    ? `<div class="collapsible-panel-actions">${options.titleActions}</div>`
    : '';

  return `
    <section class="panel collapsible-panel${extraClass}" data-collapsible${idAttr}${dataAttrs}>
      <div class="collapsible-panel-header">
        <button type="button" class="collapsible-panel-toggle" aria-expanded="${open ? 'true' : 'false'}">
          <span class="collapsible-panel-title">${titleContent}</span>
        </button>
        ${actionsMarkup}
        <button
          type="button"
          class="collapsible-panel-expand"
          aria-expanded="${open ? 'true' : 'false'}"
          aria-label="${open ? 'Collapse section' : 'Expand section'}"
        >
          <span class="collapsible-panel-icon" aria-hidden="true"></span>
        </button>
      </div>
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
  const setExpanded = (panel: HTMLElement, isExpanded: boolean) => {
    const body = panel.querySelector(':scope > .collapsible-panel-body') as HTMLElement | null;
    const toggle = panel.querySelector('.collapsible-panel-toggle') as HTMLButtonElement | null;
    const expand = panel.querySelector('.collapsible-panel-expand') as HTMLButtonElement | null;
    if (!body || !toggle || !expand) return;

    toggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    expand.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    expand.setAttribute('aria-label', isExpanded ? 'Collapse section' : 'Expand section');
    body.hidden = !isExpanded;
    options.onToggle?.(panel, isExpanded);
  };

  const onClick = (event: Event) => {
    const target = event.target as Element;
    if (target.closest('.collapsible-panel-actions')) return;

    const toggle = target.closest(
      '.collapsible-panel-toggle, .collapsible-panel-expand',
    ) as HTMLButtonElement | null;
    if (!toggle) return;

    event.preventDefault();
    event.stopPropagation();

    const panel = toggle.closest('[data-collapsible]') as HTMLElement | null;
    if (!panel) return;

    const wasExpanded = toggle.getAttribute('aria-expanded') === 'true';
    setExpanded(panel, !wasExpanded);
  };

  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}
