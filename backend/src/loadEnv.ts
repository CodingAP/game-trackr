import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function resolveEnvPaths(): string[] {
  return [
    path.resolve(moduleDir, '../../.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
  ];
}

function parseEnvContent(content: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

export function loadEnv(): string | null {
  for (const envPath of resolveEnvPaths()) {
    let content: string;
    try {
      content = fs.readFileSync(envPath, 'utf-8');
    } catch {
      continue;
    }

    for (const [key, value] of Object.entries(parseEnvContent(content))) {
      const existing = process.env[key];
      if (existing === undefined || existing === '') {
        process.env[key] = value;
      }
    }

    return envPath;
  }

  return null;
}

export function getLoadedEnvPath(): string | null {
  for (const envPath of resolveEnvPaths()) {
    try {
      fs.accessSync(envPath, fs.constants.R_OK);
      return envPath;
    } catch {
      continue;
    }
  }
  return null;
}
