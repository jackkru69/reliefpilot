import { describe, expect, it } from 'vitest';
import { executeCommand, getTerminalOutput, listTerminals, startBackgroundCommand } from './commands.js';

describe('executeCommand', () => {
  it('runs a simple command and returns output', async () => {
    const result = await executeCommand('echo hello');
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello');
    expect(result.stderr).toBe('');
  });

  it('returns exit code for failing command', async () => {
    const result = await executeCommand('exit 42');
    expect(result.exitCode).toBe(42);
  });

  it('captures stderr', async () => {
    const result = await executeCommand('echo error >&2');
    expect(result.stderr.trim()).toBe('error');
  });

  it('respects cwd', async () => {
    const result = await executeCommand('pwd', '/tmp');
    expect(result.stdout.trim()).toBe('/tmp');
  });

  it('handles timeout', async () => {
    const result = await executeCommand('sleep 10', undefined, 1);
    // Should be killed — non-zero exit
    expect(result.exitCode).not.toBe(0);
  });
});

describe('background terminals', () => {
  it('starts a background process and retrieves output', async () => {
    const { terminalId } = startBackgroundCommand('echo background-test');

    // Wait for process to finish
    await new Promise((r) => setTimeout(r, 200));

    const result = getTerminalOutput(terminalId);
    expect(result).not.toBeNull();
    expect(result!.output).toContain('background-test');
    expect(result!.isRunning).toBe(false);
  });

  it('lists terminals', () => {
    startBackgroundCommand('echo list-test');
    const list = listTerminals();
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((t) => t.command === 'echo list-test')).toBe(true);
  });

  it('returns null for unknown terminal', () => {
    const result = getTerminalOutput('999999');
    expect(result).toBeNull();
  });

  it('respects maxLines', async () => {
    startBackgroundCommand('for i in $(seq 1 50); do echo "line $i"; done');
    await new Promise((r) => setTimeout(r, 500));

    const terminals = listTerminals();
    const id = terminals[terminals.length - 1].id;

    const result = getTerminalOutput(id, 5);
    expect(result).not.toBeNull();
    const lines = result!.output.split('\n').filter(Boolean);
    expect(lines.length).toBeLessThanOrEqual(5);
  });
});
