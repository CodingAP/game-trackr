const DEFAULT_SCROLL_CONTAINER = '.image-picker-table-wrap, .embed-edit-options';

export function readListScroll(
  root: HTMLElement,
  scrollContainerSelector = DEFAULT_SCROLL_CONTAINER,
): number {
  const container = root.querySelector(scrollContainerSelector) as HTMLElement | null;
  return container?.scrollTop ?? 0;
}

export function restoreListScroll(
  root: HTMLElement,
  scrollTop: number,
  scrollContainerSelector = DEFAULT_SCROLL_CONTAINER,
): void {
  requestAnimationFrame(() => {
    const container = root.querySelector(scrollContainerSelector) as HTMLElement | null;
    if (!container) return;
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollTop = Math.min(scrollTop, maxScroll);
  });
}
