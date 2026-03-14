import { describe, expect, it } from 'vitest';
import { tools } from './tools.js';

describe('tool definitions', () => {
  const toolNames = ['ask_user', 'halt', 'execute_command', 'get_terminal_output', 'ripgrep'];

  it('has all expected tools', () => {
    const names = tools.map((t) => t.name);
    for (const name of toolNames) {
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
