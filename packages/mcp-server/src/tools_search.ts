/**
 * Search tools: DuckDuckGo, Google, Exa, Felo, Linkup
 * Standalone implementations without VS Code dependencies.
 * API keys are read from environment variables.
 */

// ─── Shared helpers ──────────────────────────────────────────────

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
];

function pickUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;
}

function requireString(val: unknown, name: string): string {
  if (!val || typeof val !== 'string' || (val as string).trim().length === 0) {
    throw new Error(`Missing required parameter: ${name}`);
  }
  return (val as string).trim();
}

function clampInt(val: unknown, def: number, min: number, max: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return def;
  const v = Math.trunc(val);
  return Math.max(min, Math.min(max, v));
}

function cleanHtml(html: string): string {
  const noTags = html.replace(/<[^>]+>/g, ' ');
  const entities: Record<string, string> = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  };
  const decoded = noTags.replace(/&(amp|lt|gt|quot|#39);/g, (m) => entities[m] ?? m);
  return decoded.replace(/\s+/g, ' ').trim();
}

// ─── DuckDuckGo ──────────────────────────────────────────────────

function extractDirectUrl(raw: string): string {
  let urlStr = raw;
  if (raw.startsWith('//')) urlStr = `https:${raw}`;
  else if (raw.startsWith('/')) urlStr = `https://duckduckgo.com${raw}`;
  try {
    const u = new URL(urlStr);
    if (u.host === 'duckduckgo.com' && u.pathname === '/l/') {
      const uddg = u.searchParams.get('uddg');
      if (uddg) { try { return decodeURIComponent(uddg); } catch { return uddg; } }
    }
    return urlStr;
  } catch { return urlStr; }
}

export async function duckduckgoSearch(args: {
  query: string;
  page?: number;
  numResults?: number;
}): Promise<string> {
  const query = requireString(args.query, 'query');
  const page = clampInt(args.page, 1, 1, 100);
  const numResults = clampInt(args.numResults, 10, 1, 20);
  const startIndex = (page - 1) * 10;
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}&s=${startIndex}`;

  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': pickUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  const html = await resp.text();
  if (!resp.ok) throw new Error(`DuckDuckGo returned ${resp.status}`);
  if (html.includes('captcha') || html.includes('blocked') || html.includes('anomaly-modal') || html.length < 1000) {
    throw new Error('DuckDuckGo rate limit exceeded. Try another search tool.');
  }

  const anchorRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
  const snippetRegex = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>(.*?)<\/a>/gi;
  const snippets: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = snippetRegex.exec(html))) snippets.push(cleanHtml(m[1]!));

  interface ResultItem { title: string; url: string; snippet: string }
  const results: ResultItem[] = [];
  let idx = 0;
  while ((m = anchorRegex.exec(html))) {
    const rawLink = m[1]!;
    const title = cleanHtml(m[2]!);
    if (!title || !rawLink) continue;
    results.push({ title, url: extractDirectUrl(rawLink), snippet: snippets[idx] ?? '' });
    idx++;
    if (results.length >= numResults) break;
  }

  if (results.length === 0) return 'No results found.';
  const lines = [`Search results for "${query}" (page ${page}, ${results.length} results):\n`];
  results.forEach((r, i) => {
    lines.push(`${i + 1}. [${r.title}](${r.url})`);
    if (r.snippet) lines.push(`   ${r.snippet}`);
    lines.push('');
  });
  return lines.join('\n');
}

// ─── Google Custom Search ────────────────────────────────────────

export async function googleSearch(args: {
  query: string;
  num_results?: number;
  site?: string;
  language?: string;
  dateRestrict?: string;
  exactTerms?: string;
  page?: number;
  resultsPerPage?: number;
  sort?: string;
}): Promise<string> {
  const apiKey = process.env['GOOGLE_API_KEY'];
  const cx = process.env['GOOGLE_CX'];
  if (!apiKey || !cx) {
    throw new Error('Google Search requires GOOGLE_API_KEY and GOOGLE_CX environment variables.');
  }

  const query = requireString(args.query, 'query');
  const resultsPerPage = clampInt(args.resultsPerPage, 5, 1, 10);
  const page = clampInt(args.page, 1, 1, 1000);
  const start = (page - 1) * resultsPerPage + 1;

  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('cx', cx);
  url.searchParams.set('q', query);
  url.searchParams.set('num', String(resultsPerPage));
  url.searchParams.set('start', String(start));
  if (args.site) {
    url.searchParams.set('siteSearch', args.site);
    url.searchParams.set('siteSearchFilter', 'i');
  }
  if (args.language) {
    const lr = args.language.toLowerCase().startsWith('lang_') ? args.language : `lang_${args.language}`;
    url.searchParams.set('lr', lr);
  }
  if (args.dateRestrict) url.searchParams.set('dateRestrict', args.dateRestrict);
  if (args.exactTerms) url.searchParams.set('exactTerms', args.exactTerms);
  if (args.sort) url.searchParams.set('sort', args.sort);

  const resp = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json' },
  });
  const data = await resp.json() as {
    items?: Array<{ title: string; link: string; snippet?: string }>;
    searchInformation?: { totalResults?: string };
    error?: { message?: string };
  };

  if (data.error) throw new Error(`Google API error: ${data.error.message ?? 'Unknown'}`);
  if (!data.items || data.items.length === 0) return 'No results found.';

  const total = data.searchInformation?.totalResults ?? '?';
  const lines = [`Google Search: "${query}" (page ${page}, ${data.items.length} of ~${total} results)\n`];
  data.items.forEach((item, i) => {
    lines.push(`${i + 1}. [${item.title}](${item.link})`);
    if (item.snippet) lines.push(`   ${item.snippet}`);
    lines.push('');
  });
  return lines.join('\n');
}

// ─── Exa Search ──────────────────────────────────────────────────

export async function exaSearch(args: {
  query: string;
  maxResults?: number;
  domain?: string;
  includeText?: string;
  excludeText?: string;
}): Promise<string> {
  const apiKey = process.env['EXA_API_KEY'];
  if (!apiKey) throw new Error('Exa Search requires EXA_API_KEY environment variable.');

  const query = requireString(args.query, 'query');
  const maxResults = clampInt(args.maxResults, 10, 1, 25);

  const body: Record<string, unknown> = {
    query,
    numResults: maxResults,
    type: 'auto',
  };
  if (args.domain) body['includeDomains'] = [args.domain];
  if (args.includeText) body['includeText'] = [args.includeText];
  if (args.excludeText) body['excludeText'] = [args.excludeText];

  const resp = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await resp.json() as {
    results?: Array<{ title?: string; url?: string; score?: number; publishedDate?: string; author?: string }>;
    error?: { message?: string };
  };

  if (!resp.ok || data.error) {
    throw new Error(`Exa API error: ${data.error?.message ?? `HTTP ${resp.status}`}`);
  }

  if (!data.results || data.results.length === 0) return 'No results found.';

  const lines = [`Exa Search: "${query}" (${data.results.length} results)\n`];
  data.results.forEach((r, i) => {
    lines.push(`${i + 1}. [${r.title ?? 'Untitled'}](${r.url ?? ''})`);
    if (r.author) lines.push(`   Author: ${r.author}`);
    if (r.publishedDate) lines.push(`   Date: ${r.publishedDate}`);
    if (typeof r.score === 'number') lines.push(`   Score: ${r.score.toFixed(3)}`);
    lines.push('');
  });
  return lines.join('\n');
}

// ─── Felo Search ─────────────────────────────────────────────────

export async function feloSearch(args: { query: string }): Promise<string> {
  const query = requireString(args.query, 'query');
  const { randomUUID } = await import('node:crypto');

  const payload = {
    query,
    search_uuid: randomUUID(),
    lang: '',
    agent_lang: 'en',
    search_options: { langcode: 'en-US' },
    search_video: true,
    contexts_from: 'google',
  };

  const resp = await fetch('https://api.felo.ai/search/threads', {
    method: 'POST',
    headers: {
      'accept': '*/*',
      'content-type': 'application/json',
      'origin': 'https://felo.ai',
      'referer': 'https://felo.ai/',
      'user-agent': pickUserAgent(),
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) throw new Error(`Felo API error: HTTP ${resp.status}`);

  const text = await resp.text();
  // Felo returns SSE stream. Parse "data:" lines.
  const chunks: string[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const jsonStr = line.slice(5).trim();
    if (!jsonStr || jsonStr === '[DONE]') continue;
    try {
      const parsed = JSON.parse(jsonStr) as { type?: string; data?: { text?: string } };
      if (parsed.type === 'answer' && parsed.data?.text) {
        chunks.push(parsed.data.text);
      }
    } catch { /* skip malformed lines */ }
  }

  if (chunks.length === 0) return 'No answer from Felo search.';
  return `Felo Search: "${query}"\n\n${chunks.join('')}`;
}

// ─── Linkup Search ───────────────────────────────────────────────

export async function linkupSearch(args: {
  query: string;
  maxResults?: number;
  onlySearchTheseDomains?: string[];
}): Promise<string> {
  const apiKey = process.env['LINKUP_API_KEY'];
  if (!apiKey) throw new Error('Linkup Search requires LINKUP_API_KEY environment variable.');

  const query = requireString(args.query, 'query');
  const maxResults = clampInt(args.maxResults, 5, 1, 20);

  const body: Record<string, unknown> = {
    q: query,
    depth: 'standard',
    outputType: 'searchResults',
    includeImages: false,
  };
  if (args.onlySearchTheseDomains && args.onlySearchTheseDomains.length > 0) {
    body['onlySearchTheseDomains'] = args.onlySearchTheseDomains;
  }

  const resp = await fetch('https://api.linkup.so/v1/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await resp.json() as {
    results?: Array<{ name?: string; url?: string; content?: string; snippet?: string }>;
    answer?: string;
    error?: { message?: string };
  };

  if (!resp.ok || data.error) {
    throw new Error(`Linkup API error: ${data.error?.message ?? `HTTP ${resp.status}`}`);
  }

  const lines: string[] = [`Linkup Search: "${query}"\n`];
  if (data.answer) {
    lines.push(data.answer);
    lines.push('');
  }
  if (data.results && data.results.length > 0) {
    const shown = data.results.slice(0, maxResults);
    lines.push(`Sources (${shown.length}):\n`);
    shown.forEach((r, i) => {
      lines.push(`${i + 1}. [${r.name ?? 'Untitled'}](${r.url ?? ''})`);
      if (r.snippet || r.content) lines.push(`   ${(r.snippet ?? r.content ?? '').slice(0, 200)}`);
      lines.push('');
    });
  }

  return lines.join('\n') || 'No results found.';
}
