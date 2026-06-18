export interface BulkImageRow {
  lineNumber: number;
  url: string;
  altText: string;
  sourceLabel: string;
  sourceUrl: string;
}

export interface BulkImageParseResult {
  rows: BulkImageRow[];
  errors: Array<{ lineNumber: number; message: string }>;
}

function isHeaderLine(line: string): boolean {
  const normalized = line.trim().toLowerCase();
  return normalized.startsWith('url;') && normalized.includes('alt');
}

export function isValidMediaImportUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseBulkImageImport(text: string): BulkImageParseResult {
  const rows: BulkImageRow[] = [];
  const errors: Array<{ lineNumber: number; message: string }> = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index].trim();
    if (!line) continue;
    if (index === 0 && isHeaderLine(line)) continue;

    let url = '';
    let altText = '';
    let sourceLabel = '';
    let sourceUrl = '';

    if (!line.includes(';')) {
      url = line;
    } else {
      const parts = line.split(';').map((part) => part.trim());
      url = parts[0] ?? '';
      altText = parts[1] ?? '';
      sourceLabel = parts[2] ?? '';
      sourceUrl = parts[3] ?? '';
    }

    if (!url) {
      errors.push({ lineNumber, message: 'URL is required.' });
      continue;
    }

    if (!isValidMediaImportUrl(url)) {
      errors.push({ lineNumber, message: 'URL must start with http:// or https://.' });
      continue;
    }

    rows.push({
      lineNumber,
      url,
      altText,
      sourceLabel,
      sourceUrl,
    });
  }

  return { rows, errors };
}
