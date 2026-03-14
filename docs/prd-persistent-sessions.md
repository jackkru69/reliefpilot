# PRD: Relief Pilot MCP Server — Persistent Background Sessions

## Problem Statement

Currently, Relief Pilot runs as a VS Code extension. All tool invocations (ask_report, halt_for_feedback, execute_command, etc.) are tied to the VS Code extension host process. When VS Code restarts or closes, all pending tool call Promises are destroyed and agent sessions are lost.

Users want to:

1. Run agent sessions that survive VS Code restarts
2. Have multiple background sessions running in parallel
3. Pause/freeze a session indefinitely and resume it later
4. Monitor and manage sessions from a web dashboard (accessible from any device)
5. Run the server on a VPS for always-on availability

## Solution Overview

Create a standalone MCP server (`reliefpilot-mcp-server`) that:

- Runs as a long-lived daemon process (systemd/pm2/docker)
- Exposes Relief Pilot tools via Model Context Protocol (stdio transport)
- Uses a **web UI** (HTTP server) instead of Electron/VS Code webviews for user interaction
- Persists session state to disk (JSON files)
- Supports indefinite hold — pending questions wait forever until the user responds
- Compatible with: VS Code (MCP support), Copilot CLI, Cursor, Claude, any MCP client

## Architecture

```
┌──────────────────────────────────────────────────┐
│              reliefpilot-mcp-server              │
│                                                  │
│  ┌─────────────┐  ┌──────────────────────────┐  │
│  │  MCP Server  │  │     Web Dashboard        │  │
│  │  (stdio)     │  │     (HTTP :3120)         │  │
│  │              │  │                          │  │
│  │  Tools:      │  │  GET /                   │  │
│  │  • ask_user  │  │  → list pending sessions │  │
│  │  • halt      │  │                          │  │
│  │  • exec_cmd  │  │  GET /session/:id        │  │
│  │  • ripgrep   │  │  → view session details  │  │
│  │  • code_chk  │  │                          │  │
│  │              │  │  POST /session/:id/reply  │  │
│  │              │  │  → submit user response  │  │
│  └──────┬───────┘  └──────────┬───────────────┘  │
│         │                     │                   │
│  ┌──────┴─────────────────────┴───────────────┐  │
│  │         Session State Store                 │  │
│  │   (JSON files in ~/.reliefpilot/sessions/)  │  │
│  │                                             │  │
│  │   session_001.json  { question, options }   │  │
│  │   session_002.json  { question, options }   │  │
│  │   session_003.json  { resolved: true }      │  │
│  └─────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

## Tools Specification

### Phase 1 — Core (MVP)

#### 1. `ask_user`

Prompts the user with a Markdown message and optional predefined options. **No timeout** — waits indefinitely until the user responds via the web dashboard.

```typescript
interface AskUserInput {
  projectName: string; // Context/project identifier
  message: string; // Markdown-formatted question
  predefinedOptions?: string[]; // Optional buttons
}
// Returns: { text: "User replied: <response>" }
```

**Behavior**:

1. Creates a pending question in the session store
2. Web dashboard shows the question with Markdown rendering, copy buttons, options
3. The MCP tool call Promise blocks until user responds via web UI
4. User can respond from any device (phone, laptop, etc.)

#### 2. `halt`

Pauses agent execution globally. Resumes when the user clicks "Resume" in the web dashboard.

```typescript
interface HaltInput {
  reason?: string; // Why the agent is pausing
}
// Returns: { text: "Resumed by user" } or { text: "Feedback: <user feedback>" }
```

#### 3. `execute_command`

Executes a shell command on the server. Supports foreground/background execution.

```typescript
interface ExecuteCommandInput {
  command: string;
  cwd?: string;
  background?: boolean;
  timeout?: number;
}
// Returns: { text: "exit_code: 0\nstdout: ..." }
```

#### 4. `get_terminal_output`

Retrieves output from a previously started background command.

#### 5. `ripgrep`

Fast file search using the `rg` binary.

```typescript
interface RipgrepInput {
  pattern: string;
  paths?: string[];
  glob?: string[];
  caseMode?: "smart" | "sensitive" | "insensitive";
  contextLines?: number;
}
```

#### 6. `code_checker`

Runs linters/type checkers and returns diagnostics. Configurable per project.

### Phase 2 — Extended

- `ai_fetch_url` — web content extraction via sub-agent
- `duckduckgo_search` — web search
- `context7` tools — documentation lookup
- GitHub API tools — repo/issue/PR operations

## Web Dashboard

### Pages

1. **Dashboard** (`GET /`)
   - List of all sessions (pending / resolved / expired)
   - Each session shows: project name, timestamp, status indicator
   - Click to open session detail

2. **Session Detail** (`GET /session/:id`)
   - Full Markdown-rendered question
   - Predefined option buttons
   - Custom text input with submit
   - Copy-to-clipboard for code blocks
   - Session history (previous questions in this session)

3. **Settings** (`GET /settings`)
   - Server port configuration
   - Auth token management
   - Session retention policy

### Security

- **Auth token**: Simple bearer token for web dashboard access (`RELIEF_AUTH_TOKEN` env var)
- **CORS**: Configurable allowed origins
- **HTTPS**: Via reverse proxy (nginx/caddy) — server itself runs HTTP

### Real-time Updates

- **SSE (Server-Sent Events)**: Dashboard receives live updates when new questions arrive
- No WebSocket dependency — simpler deployment

## Session Store

```typescript
interface SessionEntry {
  id: string; // UUID
  projectName: string;
  createdAt: string; // ISO 8601
  status: "pending" | "resolved" | "expired";
  question: {
    message: string; // Markdown
    predefinedOptions?: string[];
  };
  response?: {
    text: string;
    respondedAt: string;
  };
}
```

Storage: JSON files in `~/.reliefpilot/sessions/` (one file per session).

## Configuration

### MCP Client Configuration

```json
{
  "mcpServers": {
    "reliefpilot": {
      "command": "npx",
      "args": ["reliefpilot-mcp-server"],
      "type": "stdio",
      "env": {
        "RELIEF_WEB_PORT": "3120",
        "RELIEF_AUTH_TOKEN": "your-secret-token",
        "RELIEF_SESSIONS_DIR": "/path/to/sessions"
      }
    }
  }
}
```

### Environment Variables

| Variable              | Default                   | Description                                          |
| --------------------- | ------------------------- | ---------------------------------------------------- |
| `RELIEF_WEB_PORT`     | `3120`                    | Web dashboard port                                   |
| `RELIEF_AUTH_TOKEN`   | —                         | Bearer token for web access (required in production) |
| `RELIEF_SESSIONS_DIR` | `~/.reliefpilot/sessions` | Session storage directory                            |

## Deployment Options

### 1. Local (development)

```bash
npx reliefpilot-mcp-server
# Web dashboard at http://localhost:3120
```

### 2. VPS with systemd

```ini
[Unit]
Description=Relief Pilot MCP Server
After=network.target

[Service]
ExecStart=/usr/bin/node /path/to/reliefpilot-mcp-server/dist/index.js
Environment=RELIEF_WEB_PORT=3120
Environment=RELIEF_AUTH_TOKEN=your-secret-token
Restart=always
User=relief

[Install]
WantedBy=multi-user.target
```

### 3. Docker

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY . .
RUN npm install --production
EXPOSE 3120
CMD ["node", "dist/index.js"]
```

## User Stories

### US-1: Indefinite Hold

As a user, I want to start an agent task, pause it (halt_for_feedback), close my laptop, and come back the next day to continue so that I can work asynchronously with the agent.

**Acceptance Criteria**:

- Agent calls `ask_user` → question appears in web dashboard
- User closes browser → question persists
- User opens dashboard hours later → question still visible
- User responds → agent continues from where it stopped

### US-2: Multiple Parallel Sessions

As a user, I want to run 3 agent tasks simultaneously and switch between them in the web dashboard so that I can manage multiple projects at once.

**Acceptance Criteria**:

- Each MCP client connection creates an independent session context
- Dashboard shows all sessions with status indicators
- User can respond to any session independently

### US-3: Mobile Access

As a user, I want to check agent questions and respond from my phone so that I can unblock agents while away from my desk.

**Acceptance Criteria**:

- Web dashboard is mobile-responsive
- Touch-friendly buttons for predefined options
- Text input works on mobile keyboards

### US-4: Server Persistence

As a user, I want the MCP server to survive reboots and automatically restart so that sessions are never lost.

**Acceptance Criteria**:

- systemd/pm2 auto-restart on crash
- Session state persists to disk (not in-memory only)
- Server loads existing pending sessions on startup
- Pending Promises are restored after server restart (reconnection)

## Technical Decisions

| Decision       | Choice       | Rationale                                     |
| -------------- | ------------ | --------------------------------------------- |
| Runtime        | Node.js 22+  | Same as existing Relief Pilot codebase        |
| Language       | TypeScript   | Type safety, consistency with extension       |
| HTTP framework | Hono         | Lightweight, fast, zero dependencies          |
| Transport      | MCP stdio    | Standard MCP transport, works everywhere      |
| Session store  | JSON files   | Simple, no database dependency, easy backup   |
| Real-time      | SSE          | Simpler than WebSocket, works through proxies |
| Auth           | Bearer token | Simple, sufficient for single-user deployment |
| Build          | esbuild      | Fast, consistent with extension package       |

## Out of Scope (Phase 1)

- Multi-user authentication (OAuth, etc.)
- Session sharing between users
- Built-in HTTPS (use reverse proxy)
- VS Code extension integration (reuse existing Relief Pilot extension)
- AI model integration (MCP client handles this)
- Chat history visualization (MCP client shows this)

## Success Metrics

- Server runs 30+ days without restart
- Pending questions survive server restart
- Web dashboard loads in < 1 second
- Responds to user input within 100ms
- Works with Copilot CLI, VS Code MCP, Cursor, Claude Desktop

## Dependencies

- `@modelcontextprotocol/sdk` — MCP server implementation
- `hono` — HTTP server for web dashboard
- `marked` + `highlight.js` — Markdown rendering in web UI

## Timeline

Phase 1 (MVP): `ask_user` + `halt` + `execute_command` + web dashboard
Phase 2: All remaining tools + SSE + mobile optimization
Phase 3: Docker image + npm publish + documentation
