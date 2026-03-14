/**
 * GitHub API tools — standalone implementations.
 * Uses GITHUB_TOKEN env var for authentication (optional but recommended).
 */

function requireString(val: unknown, name: string): string {
  if (!val || typeof val !== 'string' || (val as string).trim().length === 0) {
    throw new Error(`Missing required parameter: ${name}`);
  }
  return (val as string).trim();
}

function clampInt(val: unknown, def: number, min: number, max: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return def;
  return Math.max(min, Math.min(max, Math.trunc(val)));
}

function optionalInt(val: unknown, min: number, max: number): number | undefined {
  if (typeof val !== 'number' || !Number.isFinite(val) || val <= 0) return undefined;
  const v = Math.trunc(val);
  return Math.max(min, Math.min(max, v));
}

async function ghFetch(url: string, accept?: string): Promise<Response> {
  const headers: Record<string, string> = {
    'User-Agent': 'reliefpilot-mcp',
    'Accept': accept ?? 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = process.env['GITHUB_TOKEN'];
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { method: 'GET', headers });
}

async function ghJson<T>(url: string, accept?: string): Promise<T> {
  const res = await ghFetch(url, accept);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function ghText(url: string, accept?: string): Promise<string> {
  const res = await ghFetch(url, accept);
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return res.text();
}

// ─── github_search_code ──────────────────────────────────────────

export async function githubSearchCode(args: {
  query: string;
  per_page?: number;
}): Promise<string> {
  const query = requireString(args.query, 'query');
  const perPage = optionalInt(args.per_page, 1, 100);
  const url = new URL('https://api.github.com/search/code');
  url.searchParams.set('q', query);
  if (perPage) url.searchParams.set('per_page', String(perPage));

  const data = await ghJson<{
    total_count: number;
    items: Array<{ name: string; path: string; sha: string; html_url: string; repository: { full_name: string } }>;
  }>(url.toString());

  if (!data.items?.length) return 'No code results found.';
  const header = `GitHub Code Search (${data.items.length} of ${data.total_count})`;
  const items = data.items.map((i) =>
    `- Repo: ${i.repository.full_name}\n- File: ${i.path}\n- URL: ${i.html_url}`
  );
  return `${header}\n\n${items.join('\n----------\n')}`;
}

// ─── github_search_issues ────────────────────────────────────────

export async function githubSearchIssues(args: {
  query: string;
  per_page?: number;
}): Promise<string> {
  let query = requireString(args.query, 'query');
  if (!/\bis:issue\b/i.test(query)) query = `is:issue ${query}`;
  const perPage = optionalInt(args.per_page, 1, 100);
  const url = new URL('https://api.github.com/search/issues');
  url.searchParams.set('q', query);
  if (perPage) url.searchParams.set('per_page', String(perPage));

  const data = await ghJson<{
    total_count: number;
    items: Array<{
      number: number; title: string; state: string; html_url: string;
      comments: number; created_at: string; updated_at: string;
      user?: { login?: string }; labels?: Array<{ name?: string } | string>;
      pull_request?: unknown; repository_url?: string;
    }>;
  }>(url.toString());

  const issues = (data.items ?? []).filter((i) => !i.pull_request);
  if (!issues.length) return 'No issues found.';

  const header = `GitHub Issue Search (${issues.length} of ${data.total_count})`;
  const items = issues.map((i) => {
    const repo = i.repository_url ? i.repository_url.replace(/.*\/repos\//, '') : '';
    const labels = (i.labels ?? []).map((l) => typeof l === 'string' ? l : l.name).filter(Boolean).join(', ');
    return [
      repo ? `- Repo: ${repo}` : '',
      `- #${i.number}: ${i.title}`,
      `- State: ${i.state}`,
      i.user?.login ? `- Author: ${i.user.login}` : '',
      labels ? `- Labels: ${labels}` : '',
      `- URL: ${i.html_url}`,
    ].filter(Boolean).join('\n');
  });
  return `${header}\n\n${items.join('\n----------\n')}`;
}

// ─── github_search_repositories ──────────────────────────────────

export async function githubSearchRepositories(args: {
  query: string;
  per_page?: number;
}): Promise<string> {
  const query = requireString(args.query, 'query');
  const perPage = optionalInt(args.per_page, 1, 100);
  const url = new URL('https://api.github.com/search/repositories');
  url.searchParams.set('q', query);
  if (perPage) url.searchParams.set('per_page', String(perPage));

  const data = await ghJson<{
    total_count: number;
    items: Array<{
      full_name: string; description: string | null; stargazers_count: number;
      forks_count: number; language: string | null; html_url: string;
    }>;
  }>(url.toString());

  if (!data.items?.length) return 'No repositories found.';
  const header = `GitHub Repository Search (${data.items.length} of ${data.total_count})`;
  const items = data.items.map((r) => [
    `- Name: ${r.full_name}`,
    r.description ? `- Description: ${r.description}` : '',
    `- Stars: ${r.stargazers_count} | Forks: ${r.forks_count}`,
    r.language ? `- Language: ${r.language}` : '',
    `- URL: ${r.html_url}`,
  ].filter(Boolean).join('\n'));
  return `${header}\n\n${items.join('\n----------\n')}`;
}

// ─── github_get_file_contents ────────────────────────────────────

export async function githubGetFileContents(args: {
  owner: string;
  repo: string;
  path: string;
  ref?: string;
}): Promise<string> {
  const owner = requireString(args.owner, 'owner');
  const repo = requireString(args.repo, 'repo');
  const path = requireString(args.path, 'path');
  const ref = args.ref?.trim() || undefined;

  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  const url = new URL(base);
  if (ref) url.searchParams.set('ref', ref);

  const data = await ghJson<{
    type: string; name: string; path: string; sha: string; size: number;
    html_url: string; encoding?: string; content?: string;
  }>(url.toString());

  if (data.type !== 'file') throw new Error('Path is not a file. Use github_get_directory_contents for directories.');

  let content = '';
  if (data.encoding === 'base64' && data.content) {
    content = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
  }
  if (!content) throw new Error('Empty or unsupported file encoding.');

  const header = `# ${data.name}\nRepo: ${owner}/${repo}\nPath: ${data.path}${ref ? `\nRef: ${ref}` : ''}\nSize: ${data.size} bytes\nSHA: ${data.sha}\nURL: ${data.html_url}`;
  return `${header}\n\n~~~\n${content}\n~~~`;
}

// ─── github_get_directory_contents ───────────────────────────────

export async function githubGetDirectoryContents(args: {
  owner: string;
  repo: string;
  path?: string;
  ref?: string;
}): Promise<string> {
  const owner = requireString(args.owner, 'owner');
  const repo = requireString(args.repo, 'repo');
  let path = args.path?.trim()?.replace(/^\/+/, '')?.replace(/\/+$/, '') || undefined;
  if (path === '') path = undefined;
  const ref = args.ref?.trim() || undefined;

  const baseRepo = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents`;
  const base = path ? `${baseRepo}/${path.split('/').map(encodeURIComponent).join('/')}` : baseRepo;
  const url = new URL(base);
  if (ref) url.searchParams.set('ref', ref);

  const data = await ghJson<Array<{
    type: string; name: string; path: string; size?: number; sha: string; html_url: string;
  }> | { type?: string }>(url.toString());

  if (!Array.isArray(data)) {
    const t = (data as { type?: string }).type;
    if (t === 'file') throw new Error('Path is a file. Use github_get_file_contents instead.');
    throw new Error(`Unexpected response type: ${String(t)}`);
  }

  if (data.length === 0) return `Empty directory: ${owner}/${repo}/${path ?? ''}`;

  const dirPath = path ?? '';
  const header = `Directory: ${owner}/${repo}/${dirPath}${ref ? ` (ref: ${ref})` : ''} — ${data.length} entries`;
  const entries = data.map((e) =>
    `- ${e.type === 'dir' ? '📁' : '📄'} ${e.name} (${e.type}${typeof e.size === 'number' ? `, ${e.size}b` : ''})`
  );
  return `${header}\n\n${entries.join('\n')}`;
}

// ─── github_issue_read ───────────────────────────────────────────

export async function githubIssueRead(args: {
  owner: string;
  repo: string;
  issue_number: number;
}): Promise<string> {
  const owner = requireString(args.owner, 'owner');
  const repo = requireString(args.repo, 'repo');
  if (typeof args.issue_number !== 'number' || !Number.isFinite(args.issue_number) || args.issue_number <= 0) {
    throw new Error('Missing or invalid required parameter: issue_number');
  }
  const num = Math.trunc(args.issue_number);

  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${num}`;
  const issue = await ghJson<{
    id: number; number: number; title: string; state: string; state_reason?: string | null;
    html_url: string; comments: number; created_at: string; updated_at: string;
    closed_at?: string | null; body?: string | null;
    user?: { login: string }; closed_by?: { login: string };
    labels?: Array<{ name?: string } | string>;
    milestone?: { title: string; state: string; number: number };
  }>(url);

  const lines: string[] = [];
  lines.push(`- id: ${issue.id}`);
  lines.push(`- number: ${issue.number}`);
  lines.push(`- title: ${issue.title}`);
  lines.push(`- state: ${issue.state}`);
  if (issue.state_reason) lines.push(`- state_reason: ${issue.state_reason}`);
  lines.push(`- html_url: ${issue.html_url}`);
  lines.push(`- comments: ${issue.comments}`);
  lines.push(`- created_at: ${issue.created_at}`);
  lines.push(`- updated_at: ${issue.updated_at}`);
  if (issue.closed_at) lines.push(`- closed_at: ${issue.closed_at}`);
  if (issue.user) lines.push(`- user.login: ${issue.user.login}`);
  if (issue.closed_by) lines.push(`- closed_by: ${issue.closed_by.login}`);
  if (issue.milestone) {
    lines.push(`- milestone: ${issue.milestone.title} (${issue.milestone.state})`);
  }
  if (issue.labels && issue.labels.length > 0) {
    const names = issue.labels.map((l) => typeof l === 'string' ? l : l.name).filter(Boolean);
    if (names.length > 0) lines.push(`- labels: ${names.join(', ')}`);
  }
  if (issue.body?.trim()) {
    lines.push('\nBody:\n');
    lines.push(issue.body);
  }
  return lines.join('\n');
}

// ─── github_list_issues ──────────────────────────────────────────

export async function githubListIssues(args: {
  owner: string;
  repo: string;
  per_page?: number;
}): Promise<string> {
  const owner = requireString(args.owner, 'owner');
  const repo = requireString(args.repo, 'repo');
  const perPage = optionalInt(args.per_page, 1, 100);

  const url = new URL(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`);
  if (perPage) url.searchParams.set('per_page', String(perPage));

  const data = await ghJson<Array<{
    number: number; title: string; state: string; html_url: string;
    comments: number; updated_at: string;
    user?: { login?: string }; labels?: Array<{ name?: string } | string>;
    pull_request?: unknown;
  }>>(url.toString());

  const issues = data.filter((i) => !i.pull_request);
  if (!issues.length) return `No issues found for ${owner}/${repo}.`;

  const header = `GitHub Issues for ${owner}/${repo} (${issues.length})`;
  const items = issues.map((i) => {
    const labels = (i.labels ?? []).map((l) => typeof l === 'string' ? l : l.name).filter(Boolean).join(', ');
    return [
      `- #${i.number}: ${i.title}`,
      `- State: ${i.state}`,
      i.user?.login ? `- Author: ${i.user.login}` : '',
      labels ? `- Labels: ${labels}` : '',
      `- Updated: ${i.updated_at}`,
      `- URL: ${i.html_url}`,
    ].filter(Boolean).join('\n');
  });
  return `${header}\n\n${items.join('\n----------\n')}`;
}

// ─── github_pull_request_read ────────────────────────────────────

const PR_METHODS = new Set(['get', 'get_diff', 'get_status', 'get_files', 'get_review_comments', 'get_reviews', 'get_comments']);

export async function githubPullRequestRead(args: {
  method: string;
  owner: string;
  repo: string;
  pull_number: number;
  per_page?: number;
  page?: number;
}): Promise<string> {
  const method = requireString(args.method, 'method');
  if (!PR_METHODS.has(method)) throw new Error(`Invalid method: ${method}. Valid: ${[...PR_METHODS].join(', ')}`);
  const owner = requireString(args.owner, 'owner');
  const repo = requireString(args.repo, 'repo');
  if (typeof args.pull_number !== 'number' || args.pull_number <= 0) {
    throw new Error('Missing or invalid required parameter: pull_number');
  }
  const num = Math.trunc(args.pull_number);
  const perPage = optionalInt(args.per_page, 1, 100);
  const page = optionalInt(args.page, 1, 10000);

  const basePr = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${num}`;

  if (method === 'get') {
    const pr = await ghJson<{
      number: number; title: string; state: string; draft?: boolean;
      created_at: string; updated_at: string; merged_at?: string | null;
      body?: string | null; user?: { login: string };
      head?: { ref: string }; base?: { ref: string };
    }>(basePr);
    const lines = [
      `- number: ${pr.number}`, `- title: ${pr.title}`,
      `- state: ${pr.state}${pr.draft ? ' (draft)' : ''}`,
      pr.user ? `- author: ${pr.user.login}` : '',
      pr.base ? `- base: ${pr.base.ref}` : '',
      pr.head ? `- head: ${pr.head.ref}` : '',
      `- created: ${pr.created_at}`, `- updated: ${pr.updated_at}`,
      pr.merged_at ? `- merged: ${pr.merged_at}` : '',
      pr.body?.trim() ? `\nBody:\n${pr.body}` : '',
    ].filter(Boolean);
    return `PR ${owner}/${repo} #${num}\n\n${lines.join('\n')}`;
  }

  if (method === 'get_diff') {
    const diff = await ghText(basePr, 'application/vnd.github.v3.diff');
    return `PR Diff ${owner}/${repo} #${num}\n\n\`\`\`diff\n${diff}\n\`\`\``;
  }

  if (method === 'get_status') {
    const pr = await ghJson<{ head: { sha: string } }>(basePr);
    const statusUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${pr.head.sha}/status`;
    const status = await ghJson<{
      state: string; total_count: number;
      statuses: Array<{ context?: string; state?: string; description?: string }>;
    }>(statusUrl);
    const lines = [`State: ${status.state}`, `Checks: ${status.total_count}`];
    for (const s of status.statuses) {
      lines.push(`- ${s.context ?? '?'}: ${s.state ?? '?'} — ${s.description ?? ''}`);
    }
    return `PR Status ${owner}/${repo} #${num}\n\n${lines.join('\n')}`;
  }

  if (method === 'get_files') {
    const url = new URL(`${basePr}/files`);
    if (perPage) url.searchParams.set('per_page', String(perPage));
    if (page) url.searchParams.set('page', String(page));
    const files = await ghJson<Array<{
      filename: string; status: string; additions: number; deletions: number; changes: number; patch?: string;
    }>>(url.toString());
    if (!files.length) return 'No files in this PR.';
    const items = files.map((f) =>
      `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})${f.patch ? '\n  ```diff\n  ' + f.patch.split('\n').join('\n  ') + '\n  ```' : ''}`
    );
    return `PR Files ${owner}/${repo} #${num}\n\n${items.join('\n')}`;
  }

  if (method === 'get_review_comments') {
    const url = new URL(`${basePr}/comments`);
    if (perPage) url.searchParams.set('per_page', String(perPage));
    if (page) url.searchParams.set('page', String(page));
    const comments = await ghJson<Array<{
      id: number; user?: { login: string }; path?: string; body?: string; created_at?: string;
    }>>(url.toString());
    if (!comments.length) return 'No review comments.';
    const items = comments.map((c) =>
      `- #${c.id} by ${c.user?.login ?? '?'} on ${c.path ?? '?'}\n  ${(c.body ?? '').slice(0, 400)}`
    );
    return `PR Review Comments ${owner}/${repo} #${num}\n\n${items.join('\n----------\n')}`;
  }

  if (method === 'get_reviews') {
    const url = new URL(`${basePr}/reviews`);
    if (perPage) url.searchParams.set('per_page', String(perPage));
    if (page) url.searchParams.set('page', String(page));
    const reviews = await ghJson<Array<{
      id: number; user?: { login: string }; state?: string; body?: string | null; submitted_at?: string;
    }>>(url.toString());
    if (!reviews.length) return 'No reviews.';
    const items = reviews.map((r) =>
      `- #${r.id} by ${r.user?.login ?? '?'} — ${r.state ?? '?'} (${r.submitted_at ?? '?'})${r.body ? `\n  ${r.body.slice(0, 400)}` : ''}`
    );
    return `PR Reviews ${owner}/${repo} #${num}\n\n${items.join('\n----------\n')}`;
  }

  // get_comments (issue comments on PR)
  const url = new URL(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${num}/comments`);
  if (perPage) url.searchParams.set('per_page', String(perPage));
  if (page) url.searchParams.set('page', String(page));
  const comments = await ghJson<Array<{
    id: number; user?: { login: string }; body?: string; created_at?: string;
  }>>(url.toString());
  if (!comments.length) return 'No issue comments on this PR.';
  const items = comments.map((c) =>
    `- #${c.id} by ${c.user?.login ?? '?'} (${c.created_at ?? '?'})\n  ${(c.body ?? '').slice(0, 400)}`
  );
  return `PR Issue Comments ${owner}/${repo} #${num}\n\n${items.join('\n----------\n')}`;
}

// ─── github_list_pull_requests ───────────────────────────────────

export async function githubListPullRequests(args: {
  owner: string;
  repo: string;
  state?: string;
  head?: string;
  base?: string;
  sort?: string;
  direction?: string;
  per_page?: number;
  page?: number;
}): Promise<string> {
  const owner = requireString(args.owner, 'owner');
  const repo = requireString(args.repo, 'repo');
  const perPage = optionalInt(args.per_page, 1, 100);
  const page = optionalInt(args.page, 1, 10000);

  const url = new URL(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`);
  if (args.state) url.searchParams.set('state', args.state);
  if (args.head) url.searchParams.set('head', args.head);
  if (args.base) url.searchParams.set('base', args.base);
  if (args.sort) url.searchParams.set('sort', args.sort);
  if (args.direction) url.searchParams.set('direction', args.direction);
  if (perPage) url.searchParams.set('per_page', String(perPage));
  if (page) url.searchParams.set('page', String(page));

  const data = await ghJson<Array<{
    number: number; title: string; state: string; draft?: boolean;
    html_url: string; updated_at: string; merged_at?: string | null;
    user?: { login: string }; head?: { ref: string }; base?: { ref: string };
  }>>(url.toString());

  if (!data.length) return `No pull requests found for ${owner}/${repo}.`;
  const header = `GitHub Pull Requests for ${owner}/${repo} (${data.length})`;
  const items = data.map((pr) => [
    `- #${pr.number}: ${pr.title}`,
    `- State: ${pr.state}${pr.draft ? ' (draft)' : ''}`,
    pr.user ? `- Author: ${pr.user.login}` : '',
    pr.base ? `- Base: ${pr.base.ref}` : '',
    pr.head ? `- Head: ${pr.head.ref}` : '',
    `- Updated: ${pr.updated_at}`,
    pr.merged_at ? `- Merged: ${pr.merged_at}` : '',
    `- URL: ${pr.html_url}`,
  ].filter(Boolean).join('\n'));
  return `${header}\n\n${items.join('\n----------\n')}`;
}

// ─── github_list_releases ────────────────────────────────────────

export async function githubListReleases(args: {
  owner: string;
  repo: string;
  per_page?: number;
}): Promise<string> {
  const owner = requireString(args.owner, 'owner');
  const repo = requireString(args.repo, 'repo');
  const perPage = optionalInt(args.per_page, 1, 100);

  const url = new URL(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases`);
  if (perPage) url.searchParams.set('per_page', String(perPage));

  const data = await ghJson<Array<{
    tag_name: string; name: string | null; draft: boolean;
    prerelease: boolean; published_at: string | null; html_url: string;
  }>>(url.toString());

  if (!data.length) return `No releases found for ${owner}/${repo}.`;
  const header = `GitHub Releases for ${owner}/${repo} (${data.length})`;
  const items = data.map((r) => [
    `- Tag: ${r.tag_name}`,
    r.name ? `- Name: ${r.name}` : '',
    `- Draft: ${r.draft} | Pre-release: ${r.prerelease}`,
    `- Published: ${r.published_at ?? 'N/A'}`,
    `- URL: ${r.html_url}`,
  ].filter(Boolean).join('\n'));
  return `${header}\n\n${items.join('\n----------\n')}`;
}

// ─── github_get_latest_release ───────────────────────────────────

export async function githubGetLatestRelease(args: {
  owner: string;
  repo: string;
}): Promise<string> {
  const owner = requireString(args.owner, 'owner');
  const repo = requireString(args.repo, 'repo');

  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`;
  const r = await ghJson<{
    tag_name: string; name: string | null; draft: boolean;
    prerelease: boolean; published_at: string | null; html_url: string;
    body?: string | null;
  }>(url);

  const lines = [
    `Latest Release for ${owner}/${repo}`,
    '',
    `- Tag: ${r.tag_name}`,
    r.name ? `- Name: ${r.name}` : '',
    `- Draft: ${r.draft} | Pre-release: ${r.prerelease}`,
    `- Published: ${r.published_at ?? 'N/A'}`,
    `- URL: ${r.html_url}`,
    r.body?.trim() ? `\nRelease Notes:\n${r.body}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}
