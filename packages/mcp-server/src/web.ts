import { serve } from '@hono/node-server';
import { Hono, type Context } from 'hono';
import { cleanupOldSessions, deleteSession, getPendingCount, getSession, listSessions, resolveSession } from './sessions.js';

// ── Types for SSE ──────────────────────────────────────────────────

interface SSEClient {
  write: (data: string) => void;
  close: () => void;
}

const sseClients: SSEClient[] = [];

export function notifyClients(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const alive: SSEClient[] = [];
  for (const client of sseClients) {
    try {
      client.write(payload);
      alive.push(client);
    } catch {
      // Drop dead clients
    }
  }
  sseClients.length = 0;
  sseClients.push(...alive);
}

// ── Auth middleware ────────────────────────────────────────────────

const AUTH_TOKEN = process.env['RELIEF_AUTH_TOKEN'];

function checkAuth(c: Context): Response | null {
  if (!AUTH_TOKEN) return null;
  const header = c.req.header('Authorization');
  if (header === `Bearer ${AUTH_TOKEN}`) return null;
  // Check query param fallback for browser navigation
  const tokenParam = new URL(c.req.url).searchParams.get('token');
  if (tokenParam === AUTH_TOKEN) return null;
  return c.json({ error: 'Unauthorized' }, 401) as unknown as Response;
}

// ── HTML Templates ─────────────────────────────────────────────────

function dashboardHtml(sessions: Awaited<ReturnType<typeof listSessions>>): string {
  const pending = sessions.filter((s) => s.status === 'pending');
  const resolved = sessions.filter((s) => s.status === 'resolved');
  const orphaned = sessions.filter((s) => s.status === 'orphaned');

  const renderRow = (s: (typeof sessions)[0]) => `
    <tr class="${s.status}">
      <td><a href="/session/${s.id}">${s.id.slice(0, 8)}…</a></td>
      <td>${escapeHtml(s.projectName)}</td>
      <td><span class="badge ${s.status}">${s.status}</span></td>
      <td>${new Date(s.createdAt).toLocaleString()}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Relief Pilot — Sessions</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; padding: 1rem; max-width: 960px; margin: 0 auto; }
    h1 { color: #38bdf8; margin-bottom: 0.5rem; }
    h2 { color: #94a3b8; margin: 1.5rem 0 0.5rem; font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
    th, td { padding: 0.6rem 0.75rem; text-align: left; border-bottom: 1px solid #1e293b; }
    th { color: #64748b; font-weight: 500; }
    a { color: #38bdf8; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .badge { padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
    .badge.pending { background: #854d0e; color: #fef08a; animation: pulse 2s infinite; }
    .badge.resolved { background: #166534; color: #86efac; }
    .badge.orphaned { background: #7f1d1d; color: #fca5a5; }
    .empty { color: #64748b; padding: 2rem; text-align: center; }
    .count { color: #94a3b8; font-size: 0.9rem; margin-bottom: 0.5rem; }
    .notif-btn { background: #334155; border: 1px solid #475569; color: #e2e8f0; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; font-size: 0.85rem; margin-left: 1rem; }
    .notif-btn:hover { background: #475569; }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
    @media (max-width: 640px) {
      body { padding: 0.5rem; }
      th, td { padding: 0.4rem; font-size: 0.85rem; }
      .header { flex-direction: column; align-items: flex-start; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Relief Pilot</h1>
      <p class="count">${pending.length} pending · ${resolved.length} resolved${orphaned.length ? ` · ${orphaned.length} orphaned` : ''}</p>
    </div>
    <button class="notif-btn" onclick="enableNotifications()">Enable Notifications</button>
  </div>

  <h2>Pending Sessions</h2>
  ${pending.length === 0
      ? '<p class="empty">No pending sessions — agent is idle</p>'
      : `<table><thead><tr><th>ID</th><th>Project</th><th>Status</th><th>Created</th></tr></thead><tbody>${pending.map(renderRow).join('')}</tbody></table>`}

  <h2>Resolved Sessions</h2>
  ${resolved.length === 0
      ? '<p class="empty">No resolved sessions yet</p>'
      : `<table><thead><tr><th>ID</th><th>Project</th><th>Status</th><th>Created</th></tr></thead><tbody>${resolved.map(renderRow).join('')}</tbody></table>`}

  ${orphaned.length > 0 ? `
  <h2>Orphaned Sessions (from previous server runs)</h2>
  <table><thead><tr><th>ID</th><th>Project</th><th>Status</th><th>Created</th></tr></thead><tbody>${orphaned.map(renderRow).join('')}</tbody></table>
  ` : ''}

  <script>
    function enableNotifications() {
      if ('Notification' in window) {
        Notification.requestPermission();
      }
    }

    const evtSource = new EventSource('/events');
    evtSource.addEventListener('session_update', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'new_question' && Notification.permission === 'granted') {
          new Notification('Relief Pilot', { body: 'New question from agent', icon: '/favicon.ico' });
        }
      } catch {}
      location.reload();
    });
  </script>
</body>
</html>`;
}

function sessionDetailHtml(session: Awaited<ReturnType<typeof getSession>>): string {
  if (!session) return '<h1>Session not found</h1>';

  const optionsHtml = session.question.predefinedOptions?.map(
    (opt) => `<button class="option-btn" onclick="submitOption('${escapeJsString(opt)}')">${escapeHtml(opt)}</button>`,
  ).join('\n') ?? '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Session ${session.id.slice(0, 8)} — Relief Pilot</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11/styles/github-dark.min.css">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; padding: 1rem; max-width: 800px; margin: 0 auto; }
    h1 { color: #38bdf8; margin-bottom: 0.5rem; font-size: 1.2rem; }
    .meta { color: #64748b; margin-bottom: 1rem; font-size: 0.9rem; }
    .question { background: #1e293b; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; line-height: 1.6; }
    .question pre { background: #0f172a; padding: 0.75rem; border-radius: 4px; overflow-x: auto; margin: 0.5rem 0; position: relative; }
    .question code { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.9rem; }
    .question p { margin: 0.5rem 0; }
    .question ul, .question ol { margin: 0.5rem 0 0.5rem 1.5rem; }
    .question table { border-collapse: collapse; margin: 0.5rem 0; width: 100%; }
    .question th, .question td { padding: 0.4rem 0.6rem; border: 1px solid #334155; text-align: left; }
    .question th { background: #0f172a; }
    .copy-btn { position: absolute; top: 4px; right: 4px; background: #475569; border: none; color: #e2e8f0; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 0.75rem; opacity: 0.7; }
    .copy-btn:hover { opacity: 1; }
    .options { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
    .option-btn { padding: 0.6rem 1.2rem; border: 1px solid #38bdf8; background: transparent; color: #38bdf8; border-radius: 6px; cursor: pointer; font-size: 0.95rem; transition: all 0.15s; }
    .option-btn:hover { background: #38bdf8; color: #0f172a; }
    .option-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .custom-input { display: flex; gap: 0.5rem; }
    .custom-input textarea { flex: 1; padding: 0.5rem; background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: #e2e8f0; font-size: 0.95rem; font-family: inherit; min-height: 2.5rem; resize: vertical; }
    .custom-input button { padding: 0.5rem 1rem; background: #38bdf8; color: #0f172a; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; white-space: nowrap; }
    .custom-input button:disabled { opacity: 0.5; cursor: not-allowed; }
    .resolved-msg { background: #166534; color: #86efac; padding: 1rem; border-radius: 8px; }
    a { color: #38bdf8; text-decoration: none; }
    .back { margin-bottom: 1rem; display: inline-block; }
    .submitting { opacity: 0.6; pointer-events: none; }
    @media (max-width: 640px) {
      body { padding: 0.5rem; }
      .option-btn { padding: 0.5rem 0.8rem; font-size: 0.85rem; }
    }
  </style>
</head>
<body>
  <a href="/" class="back">&larr; Back to dashboard</a>
  <h1>${escapeHtml(session.projectName)}</h1>
  <p class="meta">${session.id} &middot; ${new Date(session.createdAt).toLocaleString()} &middot; <strong>${session.status}</strong></p>

  <div class="question" id="questionContent"></div>

  ${session.status === 'pending' ? `
    <div class="options" id="optionsContainer">${optionsHtml}</div>
    <div class="custom-input">
      <textarea id="customReply" placeholder="Type a custom response..." rows="2"></textarea>
      <button id="sendBtn" onclick="submitCustom()">Send</button>
    </div>
  ` : `
    <div class="resolved-msg">
      <strong>Response:</strong> ${escapeHtml(session.response?.text ?? '')}
      <br><small>${session.response?.respondedAt ?? ''}</small>
    </div>
  `}

  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11/highlight.min.js"><\/script>
  <script>
    document.getElementById('questionContent').innerHTML = marked.parse(${JSON.stringify(session.question.message)});
    if (typeof hljs !== 'undefined') hljs.highlightAll();

    // Add copy buttons to code blocks
    document.querySelectorAll('.question pre code').forEach(block => {
      const pre = block.parentElement;
      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      btn.onclick = () => {
        navigator.clipboard.writeText(block.textContent);
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 1500);
      };
      pre.appendChild(btn);
    });

    let submitting = false;

    async function submitOption(text) {
      if (submitting) return;
      submitting = true;
      document.querySelectorAll('.option-btn, #sendBtn').forEach(b => b.disabled = true);
      document.body.classList.add('submitting');
      await fetch('/session/${session.id}/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: text }),
      });
      location.reload();
    }

    async function submitCustom() {
      const ta = document.getElementById('customReply');
      if (!ta.value.trim()) return;
      await submitOption(ta.value.trim());
    }

    document.getElementById('customReply')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitCustom(); }
    });
  <\/script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape a string for safe embedding in a single-quoted JS string literal */
function escapeJsString(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'") 
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

// ── Hono App ───────────────────────────────────────────────────────

export function createWebApp(): Hono {
  const app = new Hono();

  // Dashboard
  app.get('/', async (c) => {
    const authErr = checkAuth(c);
    if (authErr) return authErr;
    const sessions = await listSessions();
    return c.html(dashboardHtml(sessions));
  });

  // Session detail
  app.get('/session/:id', async (c) => {
    const authErr = checkAuth(c);
    if (authErr) return authErr;
    const session = await getSession(c.req.param('id'));
    return c.html(sessionDetailHtml(session));
  });

  // Submit reply
  app.post('/session/:id/reply', async (c) => {
    const authErr = checkAuth(c);
    if (authErr) return authErr;
    const body = (await c.req.json()) as { response: string };
    if (!body?.response) return c.json({ error: 'response required' }, 400);
    const ok = await resolveSession(c.req.param('id'), body.response);
    if (!ok) return c.json({ error: 'session not found or already resolved' }, 404);
    notifyClients('session_update', { id: c.req.param('id'), status: 'resolved' });
    return c.json({ ok: true });
  });

  // Delete session
  app.delete('/session/:id', async (c) => {
    const authErr = checkAuth(c);
    if (authErr) return authErr;
    await deleteSession(c.req.param('id'));
    return c.json({ ok: true });
  });

  // API: list sessions
  app.get('/api/sessions', async (c) => {
    const authErr = checkAuth(c);
    if (authErr) return authErr;
    return c.json(await listSessions());
  });

  // API: pending count
  app.get('/api/pending', async (c) => {
    return c.json({ count: getPendingCount() });
  });

  // API: health check
  app.get('/api/health', (c) => {
    return c.json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      pending: getPendingCount(),
    });
  });

  // API: cleanup old resolved sessions
  app.post('/api/cleanup', async (c) => {
    const authErr = checkAuth(c);
    if (authErr) return authErr;
    const body = (await c.req.json().catch(() => ({}))) as { maxAgeDays?: number };
    const removed = await cleanupOldSessions(body.maxAgeDays);
    return c.json({ removed });
  });

  // SSE endpoint for real-time updates
  app.get('/events', (c) => {
    return new Response(
      new ReadableStream({
        start(controller) {
          const client: SSEClient = {
            write: (data) => controller.enqueue(new TextEncoder().encode(data)),
            close: () => controller.close(),
          };
          sseClients.push(client);
          // Keep-alive
          const interval = setInterval(() => {
            try {
              client.write(': keepalive\n\n');
            } catch {
              clearInterval(interval);
            }
          }, 30000);
        },
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      },
    );
  });

  return app;
}

export function startWebServer(port: number): void {
  const app = createWebApp();
  serve({ fetch: app.fetch, port }, () => {
    console.error(`Relief Pilot web dashboard: http://localhost:${port}`);
  });
}
