# Relief Pilot MCP Server

Standalone MCP server for persistent background agent sessions with a web dashboard.

## What This Does

Run agent sessions that **never die** — even when VS Code closes. Respond to agent questions from any device via the web dashboard.

```
Agent asks question → Web dashboard shows it → You respond when ready → Agent continues
```

## Quick Start

```bash
cd packages/mcp-server
pnpm install
pnpm run build
pnpm start
```

Web dashboard: http://localhost:3120

## MCP Client Configuration

Add to your `mcp.json` (VS Code, Cursor, Copilot CLI):

```json
{
  "mcpServers": {
    "reliefpilot": {
      "command": "node",
      "args": ["/path/to/packages/mcp-server/dist/index.js"],
      "type": "stdio",
      "env": {
        "RELIEF_WEB_PORT": "3120",
        "RELIEF_AUTH_TOKEN": "your-secret-token"
      }
    }
  }
}
```

## Available Tools

| Tool                  | Description                                                                |
| --------------------- | -------------------------------------------------------------------------- |
| `ask_user`            | Prompt the user with a Markdown question. Waits **indefinitely**.          |
| `halt`                | Pause agent execution. Resume via web dashboard.                           |
| `execute_command`     | Run shell commands. Supports `background=true` for long-running processes. |
| `get_terminal_output` | Retrieve output from background terminals started with `execute_command`.  |
| `ripgrep`             | Fast file search using `rg`.                                               |

## Web Dashboard Features

- Dark theme, mobile-responsive layout
- Markdown rendering with syntax-highlighted code blocks
- Copy-to-clipboard for code snippets
- Browser notifications for new questions (opt-in)
- SSE real-time auto-refresh
- Predefined option buttons + custom text input
- Session cleanup API (`POST /api/cleanup`)

## Environment Variables

| Variable              | Default                   | Description                 |
| --------------------- | ------------------------- | --------------------------- |
| `RELIEF_WEB_PORT`     | `3120`                    | Web dashboard port          |
| `RELIEF_AUTH_TOKEN`   | —                         | Bearer token for web access |
| `RELIEF_SESSIONS_DIR` | `~/.reliefpilot/sessions` | Session storage directory   |

## Architecture

See [PRD](../../docs/prd-persistent-sessions.md) for full details.

## License

MIT
