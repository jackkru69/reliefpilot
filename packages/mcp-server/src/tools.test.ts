import { describe, expect, it } from 'vitest';
import { tools } from './tools.js';

describe('tool definitions', () => {
  const coreTools = ['ask_user', 'halt', 'execute_command', 'get_terminal_output', 'ripgrep'];
  const searchTools = ['ai_fetch_url', 'duckduckgo_search', 'google_search', 'exa_search', 'felo_search', 'linkup_search'];
  const context7Tools = ['context7_resolve-library-id', 'context7_get-library-docs'];
  const githubTools = [
    'github_search_code', 'github_search_issues', 'github_search_repositories',
    'github_get_file_contents', 'github_get_directory_contents', 'github_issue_read',
    'github_list_issues', 'github_pull_request_read', 'github_list_pull_requests',
    'github_list_releases', 'github_get_latest_release',
  ];
  const qualityTools = ['code_checker'];
  const allToolNames = [...coreTools, ...searchTools, ...context7Tools, ...githubTools, ...qualityTools];

  it('has all expected tools (25 total)', () => {
    const names = tools.map((t) => t.name);
    expect(names).toHaveLength(25);
    for (const name of allToolNames) {
      expect(names).toContain(name);
    }
  });

  it('all tools have description and inputSchema', () => {
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('ask_user requires projectName and message', () => {
    const askUser = tools.find((t) => t.name === 'ask_user')!;
    expect(askUser.inputSchema.required).toContain('projectName');
    expect(askUser.inputSchema.required).toContain('message');
  });

  it('execute_command requires command', () => {
    const execCmd = tools.find((t) => t.name === 'execute_command')!;
    expect(execCmd.inputSchema.required).toContain('command');
  });

  it('execute_command has background property', () => {
    const execCmd = tools.find((t) => t.name === 'execute_command')!;
    const props = execCmd.inputSchema.properties as Record<string, { type: string }>;
    expect(props['background']).toBeDefined();
    expect(props['background'].type).toBe('boolean');
  });

  it('get_terminal_output requires terminalId', () => {
    const getOutput = tools.find((t) => t.name === 'get_terminal_output')!;
    expect(getOutput.inputSchema.required).toContain('terminalId');
  });

  it('ripgrep requires pattern', () => {
    const rg = tools.find((t) => t.name === 'ripgrep')!;
    expect(rg.inputSchema.required).toContain('pattern');
  });
});
