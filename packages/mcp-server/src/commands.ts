import { exec, execFile, spawn, type ChildProcess } from 'node:child_process';

const SHELL = process.env['SHELL'] || '/bin/sh';

const TERMINAL_MAX_AGE_MS = 3_600_000; // 1 hour

interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

// ── Background Terminals ───────────────────────────────────────────

interface BackgroundTerminal {
  id: string;
  command: string;
  cwd: string;
  process: ChildProcess;
  output: string[];
  maxLines: number;
  exitCode: number | null;
  startedAt: string;
}

const terminals = new Map<string, BackgroundTerminal>();
let terminalCounter = 0;

export function startBackgroundCommand(
  command: string,
  cwd?: string,
): { terminalId: string } {
  const id = String(++terminalCounter);
  cleanupFinishedTerminals();

  const proc = spawn(command, {
    cwd: cwd ?? process.cwd(),
    shell: SHELL,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const terminal: BackgroundTerminal = {
    id,
    command,
    cwd: cwd ?? process.cwd(),
    process: proc,
    output: [],
    maxLines: 5000,
    exitCode: null,
    startedAt: new Date().toISOString(),
  };

  const appendLine = (line: string) => {
    terminal.output.push(line);
    if (terminal.output.length > terminal.maxLines) {
      terminal.output.splice(0, terminal.output.length - terminal.maxLines);
    }
  };

  proc.stdout?.on('data', (data: Buffer) => {
    for (const line of data.toString().split('\n')) {
      if (line) appendLine(line);
    }
  });

  proc.stderr?.on('data', (data: Buffer) => {
    for (const line of data.toString().split('\n')) {
      if (line) appendLine(`[stderr] ${line}`);
    }
  });

  proc.on('exit', (code) => {
    terminal.exitCode = code ?? 1;
  });

  terminals.set(id, terminal);
  return { terminalId: id };
}

export function getTerminalOutput(
  terminalId: string,
  maxLines = 200,
): { output: string; isRunning: boolean; exitCode: number | null } | null {
  const terminal = terminals.get(terminalId);
  if (!terminal) return null;

  const lines = terminal.output.slice(-maxLines);
  return {
    output: lines.join('\n'),
    isRunning: terminal.exitCode === null,
    exitCode: terminal.exitCode,
  };
}

export function listTerminals(): Array<{
  id: string;
  command: string;
  isRunning: boolean;
  exitCode: number | null;
  startedAt: string;
}> {
  return Array.from(terminals.values()).map((t) => ({
    id: t.id,
    command: t.command,
    isRunning: t.exitCode === null,
    exitCode: t.exitCode,
    startedAt: t.startedAt,
  }));
}

/** Remove finished terminals older than TERMINAL_MAX_AGE_MS to prevent memory leaks */
function cleanupFinishedTerminals(): void {
  const cutoff = Date.now() - TERMINAL_MAX_AGE_MS;
  for (const [id, terminal] of terminals) {
    if (terminal.exitCode !== null && new Date(terminal.startedAt).getTime() < cutoff) {
      terminals.delete(id);
    }
  }
}

// ── Foreground Commands ────────────────────────────────────────────

export function executeCommand(
  command: string,
  cwd?: string,
  timeoutSec = 120,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    exec(
      command,
      {
        cwd: cwd ?? process.cwd(),
        timeout: timeoutSec * 1000,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
        shell: SHELL,
      },
      (error, stdout, stderr) => {
        const code = typeof error?.code === 'number' ? error.code : (error ? 1 : 0);
        resolve({
          exitCode: code,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        });
      },
    );
  });
}

export function runRipgrep(args: {
  pattern: string;
  paths?: string[];
  glob?: string[];
  caseMode?: string;
  contextLines?: number;
}): Promise<ExecResult> {
  const rgArgs = ['--json'];

  if (args.caseMode === 'insensitive') rgArgs.push('-i');
  else if (args.caseMode === 'sensitive') rgArgs.push('-s');
  else rgArgs.push('-S'); // smart case

  if (args.contextLines !== undefined) rgArgs.push(`-C${args.contextLines}`);

  if (args.glob) {
    for (const g of args.glob) rgArgs.push(`--glob`, g);
  }

  rgArgs.push('--', args.pattern);

  if (args.paths?.length) {
    for (const p of args.paths) rgArgs.push(p);
  } else {
    rgArgs.push('.');
  }

  return new Promise((resolve) => {
    execFile(
      'rg',
      rgArgs,
      { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = typeof error?.code === 'number' ? error.code : (error ? 1 : 0);
        resolve({
          exitCode: code,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        });
      },
    );
  });
}
