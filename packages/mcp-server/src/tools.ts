import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const tools: Tool[] = [
  {
    name: 'ask_user',
    description:
      'Prompts the user with a Markdown question via the web dashboard and waits indefinitely for a response. Use for decisions, reports, confirmations, or any human-in-the-loop interaction.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Identifies the context/project making the request',
        },
        message: {
          type: 'string',
          description: 'The question for the user. Supports Markdown formatting.',
        },
        predefinedOptions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Predefined options for the user to choose from (optional)',
        },
      },
      required: ['projectName', 'message'],
    },
  },
  {
    name: 'halt',
    description:
      'Pauses agent execution and waits for the user to resume or provide feedback via the web dashboard. The pause persists indefinitely.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        reason: {
          type: 'string',
          description: 'Why the agent is pausing (shown to the user)',
        },
      },
      required: [],
    },
  },
  {
    name: 'execute_command',
    description:
      'Executes a shell command on the server. Use background=true for long-running processes (servers, watchers). Returns stdout, stderr, and exit code for foreground commands, or a terminalId for background ones.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute',
        },
        cwd: {
          type: 'string',
          description: 'Working directory for the command (optional)',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in seconds for foreground commands (default: 120)',
        },
        background: {
          type: 'boolean',
          description: 'Run in background. Returns terminalId for later output retrieval.',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'get_terminal_output',
    description:
      'Retrieves output from a background terminal started with execute_command(background=true).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        terminalId: {
          type: 'string',
          description: 'Terminal ID returned by execute_command',
        },
        maxLines: {
          type: 'number',
          description: 'Maximum number of lines to retrieve (default: 200)',
        },
      },
      required: ['terminalId'],
    },
  },
  {
    name: 'ripgrep',
    description:
      'Fast file search using ripgrep (rg). Returns matching lines with context.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'Search pattern (regex by default)',
        },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Paths to search in',
        },
        glob: {
          type: 'array',
          items: { type: 'string' },
          description: 'Glob patterns to include (e.g., ["*.ts", "*.js"])',
        },
        caseMode: {
          type: 'string',
          enum: ['smart', 'sensitive', 'insensitive'],
          description: 'Case sensitivity mode (default: smart)',
        },
        contextLines: {
          type: 'number',
          description: 'Number of context lines around each match (default: 2)',
        },
      },
      required: ['pattern'],
    },
  },
];
