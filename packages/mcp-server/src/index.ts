import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { executeCommand, getTerminalOutput, runRipgrep, startBackgroundCommand } from './commands.js';
import { createSession, initSessionStore } from './sessions.js';
import { tools } from './tools.js';
import { notifyClients, startWebServer } from './web.js';

// New tool modules
import { fetchUrl } from './tools_fetch.js';
import { duckduckgoSearch, googleSearch, exaSearch, feloSearch, linkupSearch } from './tools_search.js';
import { context7ResolveLibraryId, context7GetLibraryDocs } from './tools_context7.js';
import {
  githubSearchCode, githubSearchIssues, githubSearchRepositories,
  githubGetFileContents, githubGetDirectoryContents, githubIssueRead,
  githubListIssues, githubPullRequestRead, githubListPullRequests,
  githubListReleases, githubGetLatestRelease,
} from './tools_github.js';
import { codeChecker } from './tools_code_checker.js';

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

    // ── Fetch & Search ───────────────────────────────────────────────

    case 'ai_fetch_url': {
      const text = await fetchUrl(args as { url: string; topic?: string; includeLinks?: boolean });
      return { content: [{ type: 'text', text }] };
    }

    case 'duckduckgo_search': {
      const text = await duckduckgoSearch(args as { query: string; page?: number; numResults?: number });
      return { content: [{ type: 'text', text }] };
    }

    case 'google_search': {
      const text = await googleSearch(args as {
        query: string; num_results?: number; site?: string; language?: string;
        dateRestrict?: string; exactTerms?: string; page?: number; resultsPerPage?: number; sort?: string;
      });
      return { content: [{ type: 'text', text }] };
    }

    case 'exa_search': {
      const text = await exaSearch(args as {
        query: string; maxResults?: number; domain?: string; includeText?: string; excludeText?: string;
      });
      return { content: [{ type: 'text', text }] };
    }

    case 'felo_search': {
      const text = await feloSearch(args as { query: string });
      return { content: [{ type: 'text', text }] };
    }

    case 'linkup_search': {
      const text = await linkupSearch(args as { query: string; maxResults?: number; onlySearchTheseDomains?: string[] });
      return { content: [{ type: 'text', text }] };
    }

    // ── Context7 ─────────────────────────────────────────────────────

    case 'context7_resolve-library-id': {
      const text = await context7ResolveLibraryId(args as { libraryName: string });
      return { content: [{ type: 'text', text }] };
    }

    case 'context7_get-library-docs': {
      const text = await context7GetLibraryDocs(args as {
        context7CompatibleLibraryID: string; topic?: string; tokens?: number;
      });
      return { content: [{ type: 'text', text }] };
    }

    // ── GitHub ───────────────────────────────────────────────────────

    case 'github_search_code': {
      const text = await githubSearchCode(args as { query: string; per_page?: number });
      return { content: [{ type: 'text', text }] };
    }

    case 'github_search_issues': {
      const text = await githubSearchIssues(args as { query: string; per_page?: number });
      return { content: [{ type: 'text', text }] };
    }

    case 'github_search_repositories': {
      const text = await githubSearchRepositories(args as { query: string; per_page?: number });
      return { content: [{ type: 'text', text }] };
    }

    case 'github_get_file_contents': {
      const text = await githubGetFileContents(args as { owner: string; repo: string; path: string; ref?: string });
      return { content: [{ type: 'text', text }] };
    }

    case 'github_get_directory_contents': {
      const text = await githubGetDirectoryContents(args as { owner: string; repo: string; path?: string; ref?: string });
      return { content: [{ type: 'text', text }] };
    }

    case 'github_issue_read': {
      const text = await githubIssueRead(args as { owner: string; repo: string; issue_number: number });
      return { content: [{ type: 'text', text }] };
    }

    case 'github_list_issues': {
      const text = await githubListIssues(args as { owner: string; repo: string; per_page?: number });
      return { content: [{ type: 'text', text }] };
    }

    case 'github_pull_request_read': {
      const text = await githubPullRequestRead(args as {
        method: string; owner: string; repo: string; pull_number: number; per_page?: number; page?: number;
      });
      return { content: [{ type: 'text', text }] };
    }

    case 'github_list_pull_requests': {
      const text = await githubListPullRequests(args as {
        owner: string; repo: string; state?: string; head?: string; base?: string;
        sort?: string; direction?: string; per_page?: number; page?: number;
      });
      return { content: [{ type: 'text', text }] };
    }

    case 'github_list_releases': {
      const text = await githubListReleases(args as { owner: string; repo: string; per_page?: number });
      return { content: [{ type: 'text', text }] };
    }

    case 'github_get_latest_release': {
      const text = await githubGetLatestRelease(args as { owner: string; repo: string });
      return { content: [{ type: 'text', text }] };
    }

    // ── Code quality ─────────────────────────────────────────────────

    case 'code_checker': {
      const text = await codeChecker(args as { cwd?: string; tool?: 'tsc' | 'eslint' | 'both' });
      return { content: [{ type: 'text', text }] };
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
