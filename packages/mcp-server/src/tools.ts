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

  // ── Fetch & Search tools ─────────────────────────────────────────

  {
    name: 'ai_fetch_url',
    description:
      'Fetches a URL and returns its content as text. Strips HTML tags for web pages. Use for reading documentation, web pages, or any HTTP resource.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'The URL to fetch' },
        topic: { type: 'string', description: 'Optional topic hint for context' },
        includeLinks: { type: 'boolean', description: 'Include links in output (default: false)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'duckduckgo_search',
    description:
      'Search the web using DuckDuckGo. No API key required. Returns titles, URLs, and snippets.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        page: { type: 'number', description: 'Page number (default: 1)' },
        numResults: { type: 'number', description: 'Number of results (1-20, default: 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'google_search',
    description:
      'Search the web using Google Custom Search API. Requires GOOGLE_API_KEY and GOOGLE_CX env vars.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        num_results: { type: 'number', description: 'Number of results' },
        site: { type: 'string', description: 'Restrict to specific site' },
        language: { type: 'string', description: 'Language restriction (e.g., "en")' },
        dateRestrict: { type: 'string', description: 'Date restriction (e.g., "d7" for last 7 days)' },
        exactTerms: { type: 'string', description: 'Exact phrase to match' },
        page: { type: 'number', description: 'Results page number (default: 1)' },
        resultsPerPage: { type: 'number', description: 'Results per page (1-10, default: 5)' },
        sort: { type: 'string', description: 'Sort expression' },
      },
      required: ['query'],
    },
  },
  {
    name: 'exa_search',
    description:
      'Search the web using Exa AI. Requires EXA_API_KEY env var. Good for finding high-quality sources.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        maxResults: { type: 'number', description: 'Max results (1-25, default: 10)' },
        domain: { type: 'string', description: 'Restrict to specific domain' },
        includeText: { type: 'string', description: 'Text that must appear in results' },
        excludeText: { type: 'string', description: 'Text that must not appear in results' },
      },
      required: ['query'],
    },
  },
  {
    name: 'felo_search',
    description:
      'AI-powered web search using Felo. No API key required. Returns summarized answers with sources.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'linkup_search',
    description:
      'Search the web using Linkup API. Requires LINKUP_API_KEY env var.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        maxResults: { type: 'number', description: 'Max results (1-20, default: 5)' },
        onlySearchTheseDomains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Restrict search to these domains',
        },
      },
      required: ['query'],
    },
  },

  // ── Context7 documentation tools ─────────────────────────────────

  {
    name: 'context7_resolve-library-id',
    description:
      'Resolves a library name to a Context7-compatible library ID. Use before context7_get-library-docs to find the correct ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        libraryName: { type: 'string', description: 'Library name to search for (e.g., "react", "express")' },
      },
      required: ['libraryName'],
    },
  },
  {
    name: 'context7_get-library-docs',
    description:
      'Retrieves documentation for a library by its Context7-compatible ID. Call context7_resolve-library-id first to get a valid ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        context7CompatibleLibraryID: { type: 'string', description: 'Library ID from context7_resolve-library-id (e.g., "/facebook/react")' },
        topic: { type: 'string', description: 'Optional topic to focus on' },
        tokens: { type: 'number', description: 'Desired token count for response (min: 6000)' },
      },
      required: ['context7CompatibleLibraryID'],
    },
  },

  // ── GitHub tools ─────────────────────────────────────────────────

  {
    name: 'github_search_code',
    description:
      'Search code across GitHub repositories. Uses GITHUB_TOKEN env var if available.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'GitHub code search query' },
        per_page: { type: 'number', description: 'Results per page (max: 100)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'github_search_issues',
    description:
      'Search issues across GitHub. Automatically adds is:issue qualifier.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'GitHub issue search query' },
        per_page: { type: 'number', description: 'Results per page (max: 100)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'github_search_repositories',
    description: 'Search GitHub repositories by query.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'GitHub repository search query' },
        per_page: { type: 'number', description: 'Results per page (max: 100)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'github_get_file_contents',
    description: 'Get contents of a file from a GitHub repository.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'File path within the repository' },
        ref: { type: 'string', description: 'Branch, tag, or commit SHA (optional)' },
      },
      required: ['owner', 'repo', 'path'],
    },
  },
  {
    name: 'github_get_directory_contents',
    description: 'List contents of a directory in a GitHub repository.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'Directory path (optional, defaults to root)' },
        ref: { type: 'string', description: 'Branch, tag, or commit SHA (optional)' },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'github_issue_read',
    description: 'Read a specific GitHub issue with full details.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        issue_number: { type: 'number', description: 'Issue number' },
      },
      required: ['owner', 'repo', 'issue_number'],
    },
  },
  {
    name: 'github_list_issues',
    description: 'List issues for a GitHub repository.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        per_page: { type: 'number', description: 'Results per page (max: 100)' },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'github_pull_request_read',
    description:
      'Read pull request details. Use method to choose: get, get_diff, get_status, get_files, get_review_comments, get_reviews, get_comments.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        method: { type: 'string', description: 'Method: get|get_diff|get_status|get_files|get_review_comments|get_reviews|get_comments' },
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        pull_number: { type: 'number', description: 'Pull request number' },
        per_page: { type: 'number', description: 'Results per page (for paginated methods)' },
        page: { type: 'number', description: 'Page number (for paginated methods)' },
      },
      required: ['method', 'owner', 'repo', 'pull_number'],
    },
  },
  {
    name: 'github_list_pull_requests',
    description: 'List pull requests for a GitHub repository.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        state: { type: 'string', description: 'Filter by state: open, closed, all (default: open)' },
        head: { type: 'string', description: 'Filter by head user/org and branch (e.g., "user:branch")' },
        base: { type: 'string', description: 'Filter by base branch' },
        sort: { type: 'string', description: 'Sort by: created, updated, popularity, long-running' },
        direction: { type: 'string', description: 'Sort direction: asc, desc' },
        per_page: { type: 'number', description: 'Results per page (max: 100)' },
        page: { type: 'number', description: 'Page number' },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'github_list_releases',
    description: 'List releases for a GitHub repository.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        per_page: { type: 'number', description: 'Results per page (max: 100)' },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'github_get_latest_release',
    description: 'Get the latest release for a GitHub repository.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
      },
      required: ['owner', 'repo'],
    },
  },

  // ── Code quality ─────────────────────────────────────────────────

  {
    name: 'code_checker',
    description:
      'Runs code quality checks (TypeScript compiler and/or ESLint) on a project directory. Returns diagnostic output.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cwd: { type: 'string', description: 'Working directory to check (defaults to server CWD)' },
        tool: { type: 'string', enum: ['tsc', 'eslint', 'both'], description: 'Which checker to run (default: both)' },
      },
      required: [],
    },
  },
];
