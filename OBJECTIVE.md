# Thought Experiment: Gemini CLI in the Cloud

## Executive Summary

This document outlines a proposed architecture for deploying the `gemini-cli`—a
terminal-native, heavily interactive AI agent—as a web-accessible service hosted
on Google Cloud Run.

The core challenge is bridging the gap between a stateful, interactive terminal
application operating on a local file system, and a stateless, HTTP-driven cloud
environment. To achieve this with minimal friction and maximum fidelity to the
original CLI experience, we propose a **Web Terminal (Path 2)** architecture
using WebSockets, `node-pty`, and Xterm.js, combined with **Cloud Storage FUSE**
for a persistent workspace.

---

## 1. Architecture Overview

The system consists of three main tiers:

1. **Frontend (Browser):** A lightweight static HTML page running `Xterm.js`. It
   acts as a "dumb terminal," rendering ANSI escape codes and forwarding
   keystrokes.
2. **Compute (Cloud Run):** A Node.js server running Express and a WebSocket
   Server (`ws`). It uses `node-pty` (already a dependency in
   `@google/gemini-cli-core`) to spawn the actual `gemini-cli` process in a
   pseudo-terminal.
3. **Storage (GCS FUSE):** A Google Cloud Storage bucket mounted directly into
   the Cloud Run container's file system, acting as the agent's persistent
   workspace (cwd).

---

## 2. Proposed Framework: The Web Terminal

Instead of rebuilding the CLI's sophisticated React-based UI (Ink) into a custom
web frontend, we stream the interactive terminal directly to the browser.

### Why this approach?

- **Zero UI Rewrite:** All interactive prompts, loading spinners, colored diffs,
  and multi-select menus work out of the box. The browser perfectly mirrors the
  terminal state.
- **Leverages Existing Dependencies:** The monorepo already uses `node-pty` for
  shell executions.
- **True Interactivity:** The user can interact with the agent exactly as they
  would locally (e.g., pressing arrow keys to select tool options).

### Backend Implementation (Node.js + WebSockets)

A lightweight wrapper server that acts as the bridge between the browser's
WebSocket and the CLI's stdin/stdout.

```typescript
// server.ts (Conceptual)
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import * as pty from 'node-pty';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static('public'));

wss.on('connection', (ws) => {
  // Spawn the gemini-cli inside a pseudo-terminal
  const ptyProcess = pty.spawn('node', ['./packages/cli/dist/index.js'], {
    name: 'xterm-color',
    cols: 100,
    rows: 40,
    cwd: process.env.WORKSPACE_DIR || '/mnt/gcs-workspace',
    env: process.env,
  });

  // Terminal Stdout -> Browser WebSocket
  ptyProcess.onData((data) => ws.send(data));

  // Browser Keystrokes -> Terminal Stdin
  ws.on('message', (msg) => ptyProcess.write(msg.toString()));

  ws.on('close', () => ptyProcess.kill());
});

server.listen(8080);
```

### Frontend Implementation (HTML + Xterm.js)

A static file served by the Express app.

```html
<!-- public/index.html (Conceptual) -->
<!DOCTYPE html>
<html>
  <head>
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/@xterm/xterm/css/xterm.css"
    />
    <script src="https://cdn.jsdelivr.net/npm/@xterm/xterm/lib/xterm.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit/lib/addon-fit.js"></script>
    <style>
      body {
        margin: 0;
        background: #000;
        height: 100vh;
        display: flex;
      }
    </style>
  </head>
  <body>
    <div id="terminal" style="flex: 1;"></div>
    <script>
      const term = new Terminal({ theme: { background: '#1e1e1e' } });
      const fitAddon = new FitAddon.FitAddon();
      term.loadAddon(fitAddon);
      term.open(document.getElementById('terminal'));
      fitAddon.fit();

      const ws = new WebSocket(
        `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`,
      );

      ws.onmessage = (e) => term.write(e.data); // Render ANSI from CLI
      term.onData((data) => ws.send(data)); // Send keystrokes to CLI
    </script>
  </body>
</html>
```

---

## 3. Solving the Workspace Problem: GCS FUSE

Cloud Run instances are stateless and their local `/tmp` is ephemeral RAM. The
`gemini-cli` expects to operate within a persistent Git repository.

To solve this, we utilize **Cloud Storage FUSE (Filesystem in Userspace)**.

1. **Mounting:** Cloud Run (Gen 2) supports natively mounting GCS buckets as
   volumes.
2. **Operation:** The container mounts `gs://my-agent-workspaces` to
   `/mnt/gcs-workspace`.
3. **Execution:** The Node.js server spawns the `gemini-cli` with
   `cwd: '/mnt/gcs-workspace'`.
4. **Result:** When the CLI uses tools like `read_file` or `replace`, it
   interacts with the GCS bucket exactly as if it were a local SSD.
5. **Persistence:** If the Cloud Run instance scales to zero or crashes, all
   file edits are safely preserved in the bucket.

---

## 4. Deployment Considerations

- **Dockerfile:** Requires a Node.js base image with OS-level dependencies
  (Python, `make`, `g++`) to compile `node-pty` native bindings. It also needs
  standard utilities like `git` installed, as the CLI tools rely on them.
- **Cloud Run Config:**
  - Must use **Execution Environment Gen 2** (required for GCS FUSE).
  - Enable **Session Affinity** (so WebSockets don't get routed to different
    instances mid-session).
  - Configure VPC egress if the agent needs to reach internal company APIs.
- **WebSockets:** Cloud Run natively supports long-lived HTTP/1.1 WebSockets
  without additional load balancer configuration.

---

## 5. Analysis: Pros and Cons

### Pros

- **Fastest Time to Market:** Reuses 100% of the existing CLI logic and Ink UI.
- **Cost Effective:** Cloud Run scales to zero. You only pay while the WebSocket
  is connected and the agent is actively "thinking" or outputting data.
- **Perfect Fidelity:** Users get the exact same experience as the local CLI,
  including rich interactive prompts and formatting.

### Cons / Challenges

- **FUSE Performance Latency:** GCS FUSE translates file operations into network
  requests. High-volume read operations (e.g., `git status` or exhaustive
  `grep_search` across node_modules) will be significantly slower than on a
  local NVMe drive. We may need to configure the CLI to strictly ignore massive
  dependency directories.
- **Concurrency Limitations:** If two users connect to the same Cloud Run URL
  and point to the same GCS workspace folder, they will overwrite each other's
  CLI instances and file changes. A session-management layer (mapping unique
  URLs/Tokens to unique sub-folders or containers) would be required for a
  multi-tenant production release.
- **Security:** Exposing a tool capable of running arbitrary shell commands
  (`run_shell_command`) to the web requires rigorous authentication (e.g., Cloud
  Identity-Aware Proxy) and restrictive IAM roles on the Cloud Run service
  account.
