export interface BulkCheckboxRow {
  lineNumber: number;
  label: string;
  parentLabel: string;
  progressBarNames: string[];
}

export interface BulkCheckboxParseResult {
  rows: BulkCheckboxRow[];
  errors: Array<{ lineNumber: number; message: string }>;
}

function isHeaderLine(line: string): boolean {
  const normalized = line.trim().toLowerCase();
  return normalized.startsWith('label;') && normalized.includes('parent');
}

export function parseBulkCheckboxImport(text: string): BulkCheckboxParseResult {
  const rows: BulkCheckboxRow[] = [];
  const errors: Array<{ lineNumber: number; message: string }> = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index].trim();
    if (!line) continue;
    if (index === 0 && isHeaderLine(line)) continue;

    if (!line.includes(';')) {
      rows.push({
        lineNumber,
        label: line,
        parentLabel: '',
        progressBarNames: [],
      });
      continue;
    }

    const parts = line.split(';').map((part) => part.trim());
    const label = parts[0] ?? '';
    const parentLabel = parts[1] ?? '';
    const progressBarNames = (parts[2] ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);

    if (!label) {
      errors.push({ lineNumber, message: 'Label is required.' });
      continue;
    }

    rows.push({
      lineNumber,
      label,
      parentLabel,
      progressBarNames,
    });
  }

  return { rows, errors };
}
