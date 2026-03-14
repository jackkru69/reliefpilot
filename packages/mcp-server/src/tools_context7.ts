/**
 * Context7 tools: resolve library ID and get library docs.
 * Uses Context7 public API. Optional CONTEXT7_API_KEY for auth.
 */

function requireString(val: unknown, name: string): string {
  if (!val || typeof val !== 'string' || (val as string).trim().length === 0) {
    throw new Error(`Missing required parameter: ${name}`);
  }
  return (val as string).trim();
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'X-Context7-Source': 'reliefpilot-mcp' };
  const token = process.env['CONTEXT7_API_KEY'];
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// ─── Resolve Library ID ──────────────────────────────────────────

interface Context7SearchResult {
  id: string;
  title: string;
  description: string;
  totalSnippets?: number;
  trustScore?: number;
  versions?: string[];
}

function formatSearchResult(r: Context7SearchResult): string {
  const lines: string[] = [];
  lines.push(`- Title: ${r.title}`);
  lines.push(`- Context7-compatible library ID: ${r.id}`);
  lines.push(`- Description: ${r.description}`);
  if (typeof r.totalSnippets === 'number') lines.push(`- Code Snippets: ${r.totalSnippets}`);
  if (typeof r.trustScore === 'number') lines.push(`- Trust Score: ${r.trustScore.toFixed(1)}`);
  if (Array.isArray(r.versions) && r.versions.length > 0) lines.push(`- Versions: ${r.versions.join(', ')}`);
  return lines.join('\n');
}

export async function context7ResolveLibraryId(args: {
  libraryName: string;
}): Promise<string> {
  const query = requireString(args.libraryName, 'libraryName');
  const url = `https://context7.com/api/v1/search?query=${encodeURIComponent(query)}`;

  const resp = await fetch(url, { headers: getHeaders() });
  if (!resp.ok) throw new Error(`Context7 API error: HTTP ${resp.status}`);

  const data = await resp.json() as { results: Context7SearchResult[] };
  if (!data.results || data.results.length === 0) {
    return 'No documentation libraries found matching your query.';
  }
  return data.results.map(formatSearchResult).join('\n----------\n');
}

// ─── Get Library Docs ────────────────────────────────────────────

const DEFAULT_MINIMUM_TOKENS = 6000;

export async function context7GetLibraryDocs(args: {
  context7CompatibleLibraryID: string;
  topic?: string;
  tokens?: number;
}): Promise<string> {
  const id = requireString(args.context7CompatibleLibraryID, 'context7CompatibleLibraryID');
  const cleanId = id.startsWith('/') ? id.slice(1) : id;
  const topic = args.topic?.trim() || undefined;
  let tokens = args.tokens;
  if (typeof tokens === 'number' && Number.isFinite(tokens) && tokens > 0) {
    tokens = Math.max(tokens, DEFAULT_MINIMUM_TOKENS);
  } else {
    tokens = undefined;
  }

  const url = new URL(`https://context7.com/api/v1/${cleanId}`);
  if (tokens) url.searchParams.set('tokens', String(Math.trunc(tokens)));
  if (topic) url.searchParams.set('topic', topic);
  url.searchParams.set('type', 'txt');

  const resp = await fetch(url.toString(), { headers: getHeaders() });
  if (!resp.ok) {
    return 'Documentation not found or not finalized for this library. This might have happened because you used an invalid Context7-compatible library ID. To get a valid ID, call context7_resolve-library-id first.';
  }

  const text = await resp.text();
  if (!text || text === 'No content available' || text === 'No context data available') {
    return 'Documentation not found or not finalized for this library. This might have happened because you used an invalid Context7-compatible library ID. To get a valid ID, call context7_resolve-library-id first.';
  }
  return text;
}
