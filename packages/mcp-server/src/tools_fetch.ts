/**
 * ai_fetch_url — Fetches a URL and returns content as text.
 * Strips HTML tags for web pages, returns raw text for non-HTML.
 */

const USER_AGENT = 'Mozilla/5.0 (compatible; ReliefPilot/1.0; +https://github.com/ivan-mezentsev/reliefpilot)';

function stripHtml(html: string): string {
  // Remove script/style/noscript blocks entirely
  let text = html.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Decode common HTML entities
  const entities: Record<string, string> = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
    '&#39;': "'", '&nbsp;': ' ', '&#x27;': "'", '&#x2F;': '/',
  };
  text = text.replace(/&(?:#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m) => entities[m] ?? m);
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

function looksLikeHtml(text: string): boolean {
  const sample = text.slice(0, 4096).toLowerCase();
  return sample.includes('<!doctype html') || sample.includes('<html') ||
    (sample.includes('<head') && sample.includes('<body'));
}

export async function fetchUrl(args: {
  url: string;
  topic?: string;
  includeLinks?: boolean;
  timeoutSec?: number;
}): Promise<string> {
  const { url, topic, timeoutSec = 30 } = args;

  if (!url || typeof url !== 'string') {
    throw new Error('Missing required parameter: url');
  }

  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Only allow http/https
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(`Unsupported protocol: ${parsedUrl.protocol}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }

    const contentType = resp.headers.get('content-type') ?? '';
    const body = await resp.text();

    if (contentType.includes('application/json')) {
      return body;
    }

    if (contentType.includes('text/html') || looksLikeHtml(body)) {
      let text = stripHtml(body);
      // Truncate to ~100K chars to avoid massive outputs
      if (text.length > 100_000) {
        text = text.slice(0, 100_000) + '\n\n[Content truncated at 100,000 characters]';
      }
      if (topic) {
        return `URL: ${url}\nTopic: ${topic}\n\n${text}`;
      }
      return `URL: ${url}\n\n${text}`;
    }

    // Plain text or other
    if (body.length > 100_000) {
      return body.slice(0, 100_000) + '\n\n[Content truncated at 100,000 characters]';
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}
