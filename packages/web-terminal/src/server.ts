/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import * as pty from '@lydell/node-pty';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env['PORT'] || 8080;
const PUBLIC_DIR = path.join(__dirname, '../../public');
const CLI_PATH = path.join(__dirname, '../../../cli/dist/index.js');
const WORKSPACE_DIR = process.env['WORKSPACE_DIR'] || process.cwd();

app.use(express.static(PUBLIC_DIR));

wss.on('connection', (ws) => {
  // Spawn the gemini-cli inside a pseudo-terminal
  const ptyProcess = pty.spawn('node', [CLI_PATH], {
    name: 'xterm-color',
    cols: 100,
    rows: 40,
    cwd: WORKSPACE_DIR,
    env: {
      ...process.env,
      // Force color output
      FORCE_COLOR: '3',
      TERM: 'xterm-256color',
    },
  });

  // Terminal Stdout -> Browser WebSocket
  ptyProcess.onData((data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  });

  // Browser Keystrokes -> Terminal Stdin
  ws.on('message', (msg) => {
    ptyProcess.write(msg.toString());
  });

  // Handle terminal exit
  ptyProcess.onExit(() => {
    ws.close();
  });

  ws.on('close', () => {
    ptyProcess.kill();
  });

  ws.on('error', () => {
    ptyProcess.kill();
  });
});

server.listen(PORT, () => {
  // Server initialized
});
