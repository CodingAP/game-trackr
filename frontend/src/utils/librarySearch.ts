import {
  getPlatformSearchSlug,
  normalizePlatformSearchQuery,
} from '../platformIcons.js';

export type LibrarySearchField = 'name' | 'platform' | 'date' | 'added';

export interface LibraryPlatformSearchEntry {
  slug: string;
  name: string;
}

export interface LibrarySearchTarget {
  name: string;
  platforms: LibraryPlatformSearchEntry[];
  releaseDates: string[];
  addedDate: string;
}

interface SearchTerm {
  negate: boolean;
  field: LibrarySearchField | null;
  value: string;
  group?: SearchOr;
}

interface SearchAnd {
  terms: SearchTerm[];
}

interface SearchOr {
  groups: SearchAnd[];
}

type Token =
  | { type: 'word'; value: string }
  | { type: 'quoted'; value: string }
  | { type: 'and' }
  | { type: 'or' }
  | { type: 'not' }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'colon' };

const FIELD_ALIASES: Record<string, LibrarySearchField> = {
  name: 'name',
  title: 'name',
  platform: 'platform',
  platforms: 'platform',
  date: 'date',
  release: 'date',
  released: 'date',
  added: 'added',
  created: 'added',
};

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === '"') {
      let value = '';
      index += 1;
      while (index < input.length && input[index] !== '"') {
        value += input[index];
        index += 1;
      }
      if (input[index] === '"') index += 1;
      tokens.push({ type: 'quoted', value });
      continue;
    }

    if (char === '(') {
      tokens.push({ type: 'lparen' });
      index += 1;
      continue;
    }

    if (char === ')') {
      tokens.push({ type: 'rparen' });
      index += 1;
      continue;
    }

    if (char === ':') {
      tokens.push({ type: 'colon' });
      index += 1;
      continue;
    }

    const rest = input.slice(index);
    const keywordMatch = rest.match(/^(and|or|not)\b/i);
    if (keywordMatch) {
      const keyword = keywordMatch[1].toLowerCase();
      if (keyword === 'and') tokens.push({ type: 'and' });
      if (keyword === 'or') tokens.push({ type: 'or' });
      if (keyword === 'not') tokens.push({ type: 'not' });
      index += keywordMatch[0].length;
      continue;
    }

    const wordMatch = rest.match(/^[^\s():]+/);
    if (!wordMatch) {
      index += 1;
      continue;
    }
    tokens.push({ type: 'word', value: wordMatch[0] });
    index += wordMatch[0].length;
  }

  return tokens;
}

class SearchParser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): SearchOr {
    const groups = [this.parseAnd()];
    while (this.match('or')) {
      this.consume('or');
      groups.push(this.parseAnd());
    }
    return { groups };
  }

  private parseAnd(): SearchAnd {
    const terms = [this.parseTerm()];
    while (!this.atEnd() && !this.match('or') && !this.match('rparen')) {
      if (this.match('and')) {
        this.consume('and');
      }
      if (this.atEnd() || this.match('or') || this.match('rparen')) {
        break;
      }
      terms.push(this.parseTerm());
    }
    return { terms };
  }

  private parseTerm(): SearchTerm {
    const negate = this.match('not');
    if (negate) this.consume('not');
    const primary = this.parsePrimary();
    return { negate, ...primary };
  }

  private parsePrimary(): Pick<SearchTerm, 'field' | 'value' | 'group'> {
    if (this.match('lparen')) {
      this.consume('lparen');
      const group = this.parse();
      if (this.match('rparen')) this.consume('rparen');
      return { field: null, value: '', group };
    }

    const first = this.consumeValueToken();
    if (this.match('colon')) {
      this.consume('colon');
      const field = FIELD_ALIASES[first.toLowerCase()] ?? null;
      const value = this.consumeValueToken();
      return { field, value };
    }

    const field = FIELD_ALIASES[first.toLowerCase()] ?? null;
    return { field: field === 'name' ? null : field, value: first };
  }

  private consumeValueToken(): string {
    const token = this.tokens[this.index];
    if (!token || (token.type !== 'word' && token.type !== 'quoted')) {
      return '';
    }
    this.index += 1;
    return token.value;
  }

  private atEnd(): boolean {
    return this.index >= this.tokens.length;
  }

  private match(type: Token['type']): boolean {
    return this.tokens[this.index]?.type === type;
  }

  private consume(type: Token['type']): void {
    if (this.match(type)) {
      this.index += 1;
    }
  }
}

function resolveField(field: LibrarySearchField | null): LibrarySearchField {
  return field ?? 'name';
}

function matchesPlatformValue(platforms: LibraryPlatformSearchEntry[], query: string): boolean {
  const querySlug = normalizePlatformSearchQuery(query);
  if (!querySlug) return false;
  return platforms.some((platform) => platform.slug === querySlug);
}

function matchesTerm(term: SearchTerm, target: LibrarySearchTarget): boolean {
  let matched = false;

  if (term.group) {
    matched = matchesOr(term.group, target);
  } else {
    const value = term.value.trim();
    if (!value) return term.negate;

    const field = resolveField(term.field);
    switch (field) {
      case 'name':
        matched = target.name.toLowerCase().includes(value.toLowerCase());
        break;
      case 'platform':
        matched = matchesPlatformValue(target.platforms, value);
        break;
      case 'date':
        matched = target.releaseDates.some((date) =>
          date.toLowerCase().includes(value.toLowerCase()),
        );
        break;
      case 'added':
        matched = target.addedDate.toLowerCase().includes(value.toLowerCase());
        break;
      default:
        matched = target.name.toLowerCase().includes(value.toLowerCase());
    }
  }

  return term.negate ? !matched : matched;
}

function matchesAnd(group: SearchAnd, target: LibrarySearchTarget): boolean {
  return group.terms.every((term) => matchesTerm(term, target));
}

function matchesOr(expr: SearchOr, target: LibrarySearchTarget): boolean {
  return expr.groups.some((group) => matchesAnd(group, target));
}

function parseSearchQuery(query: string): SearchOr | null {
  const tokens = tokenize(query);
  if (tokens.length === 0) return null;
  try {
    return new SearchParser(tokens).parse();
  } catch {
    return null;
  }
}

export function buildLibrarySearchTarget(
  name: string,
  createdAt: string,
  moby: {
    platforms: Array<{ name: string; releaseDate: string | null }>;
    releaseDateLabel: string | null;
  } | null,
): LibrarySearchTarget {
  const releaseDates = new Set<string>();
  for (const platform of moby?.platforms ?? []) {
    if (platform.releaseDate?.trim()) {
      releaseDates.add(platform.releaseDate.trim());
    }
  }
  if (moby?.releaseDateLabel?.trim()) {
    releaseDates.add(moby.releaseDateLabel.trim());
  }

  const platformMap = new Map<string, string>();
  for (const platform of moby?.platforms ?? []) {
    if (!platform.name?.trim()) continue;
    const slug = getPlatformSearchSlug(platform.name);
    if (!platformMap.has(slug)) {
      platformMap.set(slug, platform.name.trim());
    }
  }

  return {
    name,
    platforms: [...platformMap.entries()].map(([slug, label]) => ({ slug, name: label })),
    releaseDates: [...releaseDates],
    addedDate: createdAt,
  };
}

export function collectLibraryPlatformCatalog(
  targets: Map<string, LibrarySearchTarget>,
): LibraryPlatformSearchEntry[] {
  const catalog = new Map<string, string>();

  for (const target of targets.values()) {
    for (const platform of target.platforms) {
      if (!catalog.has(platform.slug)) {
        catalog.set(platform.slug, platform.name);
      }
    }
  }

  return [...catalog.entries()]
    .map(([slug, name]) => ({ slug, name }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function matchesLibrarySearch(query: string, target: LibrarySearchTarget): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;

  const parsed = parseSearchQuery(trimmed);
  if (!parsed) {
    return target.name.toLowerCase().includes(trimmed.toLowerCase());
  }

  return matchesOr(parsed, target);
}

export function filterSlugsByLibrarySearch(
  slugs: string[],
  query: string,
  targets: Map<string, LibrarySearchTarget>,
): string[] {
  const trimmed = query.trim();
  if (!trimmed) return slugs;
  return slugs.filter((slug) => {
    const target = targets.get(slug);
    if (!target) return false;
    return matchesLibrarySearch(trimmed, target);
  });
}
