import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ── Types ──────────────────────────────────────────────────────────

export interface SessionQuestion {
  message: string;
  predefinedOptions?: string[];
}

export interface SessionResponse {
  text: string;
  respondedAt: string;
}

export interface SessionEntry {
  id: string;
  projectName: string;
  createdAt: string;
  status: 'pending' | 'resolved' | 'orphaned';
  question: SessionQuestion;
  response?: SessionResponse;
}

// ── Session Store ──────────────────────────────────────────────────

type PendingResolver = (response: string) => void;

const pendingResolvers = new Map<string, PendingResolver>();
const sessionsDir =
  process.env['RELIEF_SESSIONS_DIR'] ?? join(homedir(), '.reliefpilot', 'sessions');

export async function initSessionStore(): Promise<void> {
  await mkdir(sessionsDir, { recursive: true });

  // Mark pending sessions from previous runs as orphaned
  const files = await readdir(sessionsDir);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const filePath = join(sessionsDir, file);
      const raw = await readFile(filePath, 'utf-8');
      const entry: SessionEntry = JSON.parse(raw);
      if (entry.status === 'pending') {
        entry.status = 'orphaned';
        await writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
      }
    } catch {
      // Skip malformed files
    }
  }
}

function sessionPath(id: string): string {
  // Sanitize id to prevent path traversal
  const safeId = id.replace(/[^a-zA-Z0-9\-]/g, '');
  return join(sessionsDir, `${safeId}.json`);
}

export async function createSession(
  projectName: string,
  question: SessionQuestion,
): Promise<string> {
  const id = randomUUID();
  const entry: SessionEntry = {
    id,
    projectName,
    createdAt: new Date().toISOString(),
    status: 'pending',
    question,
  };
  await writeFile(sessionPath(id), JSON.stringify(entry, null, 2), 'utf-8');

  return new Promise<string>((resolve) => {
    pendingResolvers.set(id, resolve);
  });
}

export async function resolveSession(id: string, responseText: string): Promise<boolean> {
  const resolver = pendingResolvers.get(id);
  if (!resolver) return false;

  // Update file
  const raw = await readFile(sessionPath(id), 'utf-8');
  const entry: SessionEntry = JSON.parse(raw);
  entry.status = 'resolved';
  entry.response = { text: responseText, respondedAt: new Date().toISOString() };
  await writeFile(sessionPath(id), JSON.stringify(entry, null, 2), 'utf-8');

  // Resolve the waiting Promise
  pendingResolvers.delete(id);
  resolver(responseText);
  return true;
}

export async function listSessions(): Promise<SessionEntry[]> {
  const files = await readdir(sessionsDir);
  const entries: SessionEntry[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const raw = await readFile(join(sessionsDir, file), 'utf-8');
    entries.push(JSON.parse(raw));
  }
  entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return entries;
}

export async function getSession(id: string): Promise<SessionEntry | null> {
  try {
    const raw = await readFile(sessionPath(id), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function deleteSession(id: string): Promise<void> {
  pendingResolvers.delete(id);
  try {
    await unlink(sessionPath(id));
  } catch {
    // Ignore if file doesn't exist
  }
}

export function getPendingCount(): number {
  return pendingResolvers.size;
}

export async function cleanupOldSessions(maxAgeDays = 7): Promise<number> {
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  const files = await readdir(sessionsDir);
  let removed = 0;
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = await readFile(join(sessionsDir, file), 'utf-8');
      const entry: SessionEntry = JSON.parse(raw);
      if ((entry.status === 'resolved' || entry.status === 'orphaned') && new Date(entry.createdAt).getTime() < cutoff) {
        await unlink(join(sessionsDir, file));
        removed++;
      }
    } catch {
      // Skip malformed files
    }
  }
  return removed;
}
