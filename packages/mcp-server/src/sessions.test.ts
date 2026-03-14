import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let testDir: string;

describe('sessions', () => {
  beforeEach(async () => {
    vi.resetModules();
    testDir = await mkdtemp(join(tmpdir(), 'relief-test-'));
    process.env['RELIEF_SESSIONS_DIR'] = testDir;
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    delete process.env['RELIEF_SESSIONS_DIR'];
  });

  it('createSession + resolveSession completes the hold', async () => {
    // Re-import to pick up env change
    const { initSessionStore, createSession, resolveSession, listSessions, getPendingCount } =
      await import('./sessions.js');

    await initSessionStore();

    // Create session (non-blocking — will resolve when we call resolveSession)
    let resolved = false;
    const sessionPromise = createSession('test-project', {
      message: '## Question\n\nDo you approve?',
      predefinedOptions: ['Yes', 'No'],
    }).then((response) => {
      resolved = true;
      return response;
    });

    // Wait for async writeFile inside createSession to complete
    await new Promise((r) => setTimeout(r, 50));

    // Session should be pending
    expect(resolved).toBe(false);
    expect(getPendingCount()).toBe(1);

    // List sessions
    const sessions = await listSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].status).toBe('pending');
    expect(sessions[0].projectName).toBe('test-project');
    expect(sessions[0].question.message).toContain('Do you approve?');
    expect(sessions[0].question.predefinedOptions).toEqual(['Yes', 'No']);

    // Resolve
    const id = sessions[0].id;
    const ok = await resolveSession(id, 'Yes');
    expect(ok).toBe(true);

    // Promise should now resolve
    const response = await sessionPromise;
    expect(response).toBe('Yes');
    expect(resolved).toBe(true);
    expect(getPendingCount()).toBe(0);

    // Verify status on disk
    const updatedSessions = await listSessions();
    expect(updatedSessions[0].status).toBe('resolved');
    expect(updatedSessions[0].response?.text).toBe('Yes');
  });

  it('resolveSession returns false for unknown id', async () => {
    const { initSessionStore, resolveSession } = await import('./sessions.js');
    await initSessionStore();
    const ok = await resolveSession('nonexistent-id', 'test');
    expect(ok).toBe(false);
  });

  it('resolveSession works for orphaned sessions (no in-memory resolver)', async () => {
    const { writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { initSessionStore, resolveSession, getSession } = await import('./sessions.js');
    await initSessionStore();

    // Write an orphaned session directly to disk (simulates server restart)
    const id = 'orphan-test-001';
    const entry = {
      id,
      projectName: 'orphan-project',
      createdAt: new Date().toISOString(),
      status: 'pending',
      question: { message: 'test' },
    };
    await writeFile(join(testDir, `${id}.json`), JSON.stringify(entry), 'utf-8');

    // Should resolve successfully even without in-memory resolver
    const ok = await resolveSession(id, 'approved');
    expect(ok).toBe(true);

    // Verify file was updated
    const session = await getSession(id);
    expect(session?.status).toBe('resolved');
    expect(session?.response?.text).toBe('approved');
  });

  it('resolveSession returns false for already resolved session', async () => {
    const { initSessionStore, createSession, resolveSession, listSessions } = await import('./sessions.js');
    await initSessionStore();

    createSession('test', { message: 'q' });
    await new Promise((r) => setTimeout(r, 50));
    const sessions = await listSessions();
    const id = sessions[0].id;

    const ok1 = await resolveSession(id, 'first');
    expect(ok1).toBe(true);

    const ok2 = await resolveSession(id, 'second');
    expect(ok2).toBe(false);
  });

  it('getSession returns null for unknown id', async () => {
    const { initSessionStore, getSession } = await import('./sessions.js');
    await initSessionStore();
    const session = await getSession('nonexistent-id');
    expect(session).toBeNull();
  });

  it('deleteSession removes from disk and pending map', async () => {
    const { initSessionStore, createSession, deleteSession, listSessions, getPendingCount } =
      await import('./sessions.js');

    await initSessionStore();

    // Create and don't await (it would block forever)
    createSession('test', { message: 'test' });

    // Wait for async writeFile inside createSession to complete
    await new Promise((r) => setTimeout(r, 50));

    expect(getPendingCount()).toBe(1);
    const sessions = await listSessions();
    expect(sessions.length).toBe(1);

    await deleteSession(sessions[0].id);

    expect(getPendingCount()).toBe(0);
    const afterDelete = await listSessions();
    expect(afterDelete.length).toBe(0);
  });

  it('sessionPath sanitizes path traversal', async () => {
    const { initSessionStore, getSession } = await import('./sessions.js');
    await initSessionStore();

    // Attempt path traversal — should be sanitized
    const session = await getSession('../../etc/passwd');
    expect(session).toBeNull();
  });
});
