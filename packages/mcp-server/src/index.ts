import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { executeCommand, getTerminalOutput, runRipgrep, startBackgroundCommand } from './commands.js';
import { createSession, initSessionStore } from './sessions.js';
import { tools } from './tools.js';
import { notifyClients, startWebServer } from './web.js';

// ── Configuration ──────────────────────────────────────────────────

const WEB_PORT = parseInt(process.env['RELIEF_WEB_PORT'] ?? '3120', 10);

// ── MCP Server ─────────────────────────────────────────────────────

const server = new Server(
  { name: 'reliefpilot-mcp-server', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'ask_user': {
      const { projectName, message, predefinedOptions } = args as {
        projectName: string;
        message: string;
        predefinedOptions?: string[];
      };
      notifyClients('session_update', { type: 'new_question' });
      const response = await createSession(projectName, { message, predefinedOptions });
      return { content: [{ type: 'text', text: `User replied: ${response}` }] };
    }

    case 'halt': {
      const reason = (args as { reason?: string }).reason ?? 'Agent paused';
      notifyClients('session_update', { type: 'halt' });
      const response = await createSession('halt', {
        message: `## Agent Paused\n\n${reason}`,
        predefinedOptions: ['Resume work', 'Send feedback'],
      });
      if (response === 'Resume work') {
        return { content: [{ type: 'text', text: 'Resumed by user' }] };
      }
      return { content: [{ type: 'text', text: `Feedback: ${response}` }] };
    }

    case 'execute_command': {
      const { command, cwd, timeout, background } = args as {
        command: string;
        cwd?: string;
        timeout?: number;
        background?: boolean;
      };
      if (background) {
        const { terminalId } = startBackgroundCommand(command, cwd);
        return {
          content: [{ type: 'text', text: `Background process started. terminalId: ${terminalId}` }],
        };
      }
      const result = await executeCommand(command, cwd, timeout);
      const output = [
        `exit_code: ${result.exitCode}`,
        result.stdout ? `stdout:\n${result.stdout}` : '',
        result.stderr ? `stderr:\n${result.stderr}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      return { content: [{ type: 'text', text: output }] };
    }

    case 'get_terminal_output': {
      const { terminalId, maxLines } = args as {
        terminalId: string;
        maxLines?: number;
      };
      const result = getTerminalOutput(terminalId, maxLines);
      if (!result) {
        return { content: [{ type: 'text', text: `Terminal ${terminalId} not found` }] };
      }
      const status = result.isRunning
        ? 'Status: running'
        : `Status: exited (code ${result.exitCode})`;
      return {
        content: [{ type: 'text', text: `${status}\n\n${result.output}` }],
      };
    }

    case 'ripgrep': {
      const { pattern, paths, glob, caseMode, contextLines } = args as {
        pattern: string;
        paths?: string[];
        glob?: string[];
        caseMode?: string;
        contextLines?: number;
      };
      const result = await runRipgrep({ pattern, paths, glob, caseMode, contextLines });
      const output = result.stdout || result.stderr || 'No matches found';
      return { content: [{ type: 'text', text: output }] };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// ── Main ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await initSessionStore();
  startWebServer(WEB_PORT);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Relief Pilot MCP server started');
}

function shutdown(): void {
  console.error('Shutting down…');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch(console.error);
