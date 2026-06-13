export function removeExtraWhitespace(content: string): string {
  return content
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

export function countPagesWithExtraWhitespace(contents: Record<string, string>): number {
  return Object.values(contents).filter((content) => removeExtraWhitespace(content) !== content).length;
}

export function removeExtraWhitespaceFromPages(
  contents: Record<string, string>,
): { contents: Record<string, string>; changedPages: number } {
  let changedPages = 0;
  const next: Record<string, string> = { ...contents };

  for (const [pageId, content] of Object.entries(contents)) {
    const cleaned = removeExtraWhitespace(content);
    if (cleaned === content) continue;
    next[pageId] = cleaned;
    changedPages += 1;
  }

  return { contents: next, changedPages };
}
