import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let testDir: string;

describe('web app', () => {
  beforeEach(async () => {
    vi.resetModules();
    testDir = await mkdtemp(join(tmpdir(), 'relief-web-test-'));
    process.env['RELIEF_SESSIONS_DIR'] = testDir;
    delete process.env['RELIEF_AUTH_TOKEN'];
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    delete process.env['RELIEF_SESSIONS_DIR'];
    delete process.env['RELIEF_AUTH_TOKEN'];
  });

  it('GET / returns dashboard HTML', async () => {
    const { initSessionStore } = await import('./sessions.js');
    const { createWebApp } = await import('./web.js');

    await initSessionStore();
    const app = createWebApp();

    const res = await app.request('/');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Relief Pilot');
    expect(html).toContain('No pending sessions');
  });

  it('GET /api/sessions returns empty array', async () => {
    const { initSessionStore } = await import('./sessions.js');
    const { createWebApp } = await import('./web.js');

    await initSessionStore();
    const app = createWebApp();

    const res = await app.request('/api/sessions');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it('GET /api/pending returns count', async () => {
    const { initSessionStore } = await import('./sessions.js');
    const { createWebApp } = await import('./web.js');

    await initSessionStore();
    const app = createWebApp();

    const res = await app.request('/api/pending');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { count: number };
    expect(data.count).toBe(0);
  });

  it('GET /api/health returns ok', async () => {
    const { initSessionStore } = await import('./sessions.js');
    const { createWebApp } = await import('./web.js');

    await initSessionStore();
    const app = createWebApp();

    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string };
    expect(data.status).toBe('ok');
  });

  it('POST /session/:id/reply returns 400 without response body', async () => {
    const { initSessionStore, createSession, listSessions } = await import('./sessions.js');
    const { createWebApp } = await import('./web.js');

    await initSessionStore();
    createSession('test', { message: 'q' });
    const sessions = await listSessions();
    const id = sessions[0].id;

    const app = createWebApp();
    const res = await app.request(`/session/${id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('POST /session/:id/reply resolves a session', async () => {
    const { initSessionStore, createSession, listSessions } = await import('./sessions.js');
    const { createWebApp } = await import('./web.js');

    await initSessionStore();
    createSession('test', { message: 'q' });
    const sessions = await listSessions();
    const id = sessions[0].id;

    const app = createWebApp();
    const res = await app.request(`/session/${id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: 'approved' }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  it('DELETE /session/:id removes a session', async () => {
    const { initSessionStore, createSession, listSessions } = await import('./sessions.js');
    const { createWebApp } = await import('./web.js');

    await initSessionStore();
    createSession('test', { message: 'q' });
    const sessions = await listSessions();
    const id = sessions[0].id;

    const app = createWebApp();
    const res = await app.request(`/session/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);

    const after = await listSessions();
    expect(after.length).toBe(0);
  });

  it('GET /session/:id returns session detail HTML', async () => {
    const { initSessionStore, createSession, listSessions } = await import('./sessions.js');
    const { createWebApp } = await import('./web.js');

    await initSessionStore();
    createSession('my-project', {
      message: '## Test Question\n\nIs this working?',
      predefinedOptions: ['Yes', 'No'],
    });
    const sessions = await listSessions();
    const id = sessions[0].id;

    const app = createWebApp();
    const res = await app.request(`/session/${id}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('my-project');
    expect(html).toContain('Test Question');
  });
});

describe('web app auth', () => {
  beforeEach(async () => {
    vi.resetModules();
    testDir = await mkdtemp(join(tmpdir(), 'relief-auth-test-'));
    process.env['RELIEF_SESSIONS_DIR'] = testDir;
    process.env['RELIEF_AUTH_TOKEN'] = 'test-secret-token';
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    delete process.env['RELIEF_SESSIONS_DIR'];
    delete process.env['RELIEF_AUTH_TOKEN'];
  });

  it('rejects requests without token', async () => {
    const { initSessionStore } = await import('./sessions.js');
    const { createWebApp } = await import('./web.js');

    await initSessionStore();
    const app = createWebApp();

    const res = await app.request('/api/sessions');
    expect(res.status).toBe(401);
  });

  it('accepts requests with Bearer token', async () => {
    const { initSessionStore } = await import('./sessions.js');
    const { createWebApp } = await import('./web.js');

    await initSessionStore();
    const app = createWebApp();

    const res = await app.request('/api/sessions', {
      headers: { Authorization: 'Bearer test-secret-token' },
    });
    expect(res.status).toBe(200);
  });

  it('accepts requests with query param token', async () => {
    const { initSessionStore } = await import('./sessions.js');
    const { createWebApp } = await import('./web.js');

    await initSessionStore();
    const app = createWebApp();

    const res = await app.request('/api/sessions?token=test-secret-token');
    expect(res.status).toBe(200);
  });
});
