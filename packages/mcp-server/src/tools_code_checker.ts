/**
 * code_checker — Standalone code quality checker.
 * Runs `tsc --noEmit` and/or `eslint .` as child processes and returns diagnostics.
 */
import { execFile } from 'node:child_process';

function runProcess(cmd: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout: 120_000, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err && 'code' in err ? (err as { code: number }).code : (err ? 1 : 0);
      resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code });
    });
  });
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    const { code } = await runProcess('which', [cmd], '/');
    return code === 0;
  } catch {
    return false;
  }
}

export async function codeChecker(args: {
  cwd?: string;
  tool?: 'tsc' | 'eslint' | 'both';
}): Promise<string> {
  const cwd = args.cwd || process.cwd();
  const tool = args.tool ?? 'both';
  const results: string[] = [];

  if (tool === 'tsc' || tool === 'both') {
    // Try npx tsc first (project-local), fall back to global
    const tscCmd = await commandExists('npx') ? 'npx' : 'tsc';
    const tscArgs = tscCmd === 'npx' ? ['tsc', '--noEmit'] : ['--noEmit'];
    const { stdout, stderr, code } = await runProcess(tscCmd, tscArgs, cwd);
    const output = (stdout + '\n' + stderr).trim();
    if (code === 0) {
      results.push('TypeScript: 0 errors ✓');
    } else {
      results.push(`TypeScript errors (exit code ${code}):\n${output}`);
    }
  }

  if (tool === 'eslint' || tool === 'both') {
    const eslintCmd = await commandExists('npx') ? 'npx' : 'eslint';
    const eslintArgs = eslintCmd === 'npx' ? ['eslint', '.', '--format', 'compact'] : ['.', '--format', 'compact'];
    const { stdout, stderr, code } = await runProcess(eslintCmd, eslintArgs, cwd);
    const output = (stdout + '\n' + stderr).trim();
    if (code === 0) {
      results.push('ESLint: 0 issues ✓');
    } else {
      results.push(`ESLint issues (exit code ${code}):\n${output}`);
    }
  }

  return results.join('\n\n---\n\n') || 'No checks performed.';
}
