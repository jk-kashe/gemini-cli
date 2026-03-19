/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SessionSelector,
  extractFirstUserMessage,
  formatRelativeTime,
  hasUserOrAssistantMessage,
  SessionError,
} from './sessionUtils.js';
import {
  SESSION_FILE_PREFIX,
  type Config,
  type MessageRecord,
} from '@google/gemini-cli-core';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';

describe('SessionSelector', () => {
  let baseTmpDir: string;
  let tmpDir: string;
  let config: Config;

  beforeEach(async () => {
    // Create a temporary directory for testing
    baseTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-test-'));
    tmpDir = path.join(baseTmpDir, 'current-project');
    await fs.mkdir(tmpDir, { recursive: true });

    // Mock config
    config = {
      storage: {
        getProjectTempDir: () => tmpDir,
        getProjectIdentifier: () => 'current-project',
        listAllProjects: () => [
          { path: '/path/to/current', identifier: 'current-project' },
          { path: '/path/to/other', identifier: 'other-project' },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as unknown as any,
      getSessionId: () => 'current-session-id',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as unknown as any;

    // Mock static getGlobalTempDir
    vi.spyOn(
      (await import('@google/gemini-cli-core')).Storage,
      'getGlobalTempDir',
    ).mockReturnValue(baseTmpDir);
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.rm(baseTmpDir, { recursive: true, force: true });
    } catch (_error) {
      // Ignore cleanup errors
    }
    vi.restoreAllMocks();
  });

  it('should resolve session by UUID', async () => {
    const sessionId1 = randomUUID();
    const sessionId2 = randomUUID();

    // Create test session files
    const chatsDir = path.join(tmpDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    const session1 = {
      sessionId: sessionId1,
      projectHash: 'test-hash',
      startTime: '2024-01-01T10:00:00.000Z',
      lastUpdated: '2024-01-01T10:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'Test message 1',
          id: 'msg1',
          timestamp: '2024-01-01T10:00:00.000Z',
        },
      ],
    };

    const session2 = {
      sessionId: sessionId2,
      projectHash: 'test-hash',
      startTime: '2024-01-01T11:00:00.000Z',
      lastUpdated: '2024-01-01T11:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'Test message 2',
          id: 'msg2',
          timestamp: '2024-01-01T11:00:00.000Z',
        },
      ],
    };

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T10-00-${sessionId1.slice(0, 8)}.json`,
      ),
      JSON.stringify(session1, null, 2),
    );

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T11-00-${sessionId2.slice(0, 8)}.json`,
      ),
      JSON.stringify(session2, null, 2),
    );

    const sessionSelector = new SessionSelector(config);

    // Test resolving by UUID
    const result1 = await sessionSelector.resolveSession(sessionId1);
    expect(result1.sessionData.sessionId).toBe(sessionId1);
    expect(result1.sessionData.messages[0].content).toBe('Test message 1');

    const result2 = await sessionSelector.resolveSession(sessionId2);
    expect(result2.sessionData.sessionId).toBe(sessionId2);
    expect(result2.sessionData.messages[0].content).toBe('Test message 2');
  });

  it('should resolve session by alias', async () => {
    const sessionId = randomUUID();
    const alias = 'test-alias';

    const chatsDir = path.join(tmpDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    const session = {
      sessionId,
      projectHash: 'test-hash',
      alias,
      startTime: '2024-01-01T10:00:00.000Z',
      lastUpdated: '2024-01-01T10:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'Test message',
          id: 'msg1',
          timestamp: '2024-01-01T10:00:00.000Z',
        },
      ],
    };

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T10-00-${sessionId.slice(0, 8)}.json`,
      ),
      JSON.stringify(session, null, 2),
    );

    const sessionSelector = new SessionSelector(config);
    const result = await sessionSelector.resolveSession(alias);

    expect(result.sessionData.sessionId).toBe(sessionId);
    expect(result.sessionData.alias).toBe(alias);
  });

  it('should resolve session by index', async () => {
    const sessionId1 = randomUUID();
    const sessionId2 = randomUUID();

    // Create test session files
    const chatsDir = path.join(tmpDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    const session1 = {
      sessionId: sessionId1,
      projectHash: 'test-hash',
      startTime: '2024-01-01T10:00:00.000Z',
      lastUpdated: '2024-01-01T10:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'First session',
          id: 'msg1',
          timestamp: '2024-01-01T10:00:00.000Z',
        },
      ],
    };

    const session2 = {
      sessionId: sessionId2,
      projectHash: 'test-hash',
      startTime: '2024-01-01T11:00:00.000Z',
      lastUpdated: '2024-01-01T11:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'Second session',
          id: 'msg2',
          timestamp: '2024-01-01T11:00:00.000Z',
        },
      ],
    };

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T10-00-${sessionId1.slice(0, 8)}.json`,
      ),
      JSON.stringify(session1, null, 2),
    );

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T11-00-${sessionId2.slice(0, 8)}.json`,
      ),
      JSON.stringify(session2, null, 2),
    );

    const sessionSelector = new SessionSelector(config);

    // Test resolving by index (1-based)
    const result1 = await sessionSelector.resolveSession('1');
    expect(result1.sessionData.messages[0].content).toBe('First session');

    const result2 = await sessionSelector.resolveSession('2');
    expect(result2.sessionData.messages[0].content).toBe('Second session');
  });

  it('should resolve latest session', async () => {
    const sessionId1 = randomUUID();
    const sessionId2 = randomUUID();

    // Create test session files
    const chatsDir = path.join(tmpDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    const session1 = {
      sessionId: sessionId1,
      projectHash: 'test-hash',
      startTime: '2024-01-01T10:00:00.000Z',
      lastUpdated: '2024-01-01T10:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'First session',
          id: 'msg1',
          timestamp: '2024-01-01T10:00:00.000Z',
        },
      ],
    };

    const session2 = {
      sessionId: sessionId2,
      projectHash: 'test-hash',
      startTime: '2024-01-01T11:00:00.000Z',
      lastUpdated: '2024-01-01T11:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'Latest session',
          id: 'msg2',
          timestamp: '2024-01-01T11:00:00.000Z',
        },
      ],
    };

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T10-00-${sessionId1.slice(0, 8)}.json`,
      ),
      JSON.stringify(session1, null, 2),
    );

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T11-00-${sessionId2.slice(0, 8)}.json`,
      ),
      JSON.stringify(session2, null, 2),
    );

    const sessionSelector = new SessionSelector(config);

    // Test resolving latest
    const result = await sessionSelector.resolveSession('latest');
    expect(result.sessionData.messages[0].content).toBe('Latest session');
  });

  it('should resolve session by UUID with whitespace (trimming)', async () => {
    const sessionId = randomUUID();

    // Create test session files
    const chatsDir = path.join(tmpDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    const session = {
      sessionId,
      projectHash: 'test-hash',
      startTime: '2024-01-01T10:00:00.000Z',
      lastUpdated: '2024-01-01T10:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'Test message',
          id: 'msg1',
          timestamp: '2024-01-01T10:00:00.000Z',
        },
      ],
    };

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T10-00-${sessionId.slice(0, 8)}.json`,
      ),
      JSON.stringify(session, null, 2),
    );

    const sessionSelector = new SessionSelector(config);

    // Test resolving by UUID with leading/trailing spaces
    const result = await sessionSelector.resolveSession(`  ${sessionId}  `);
    expect(result.sessionData.sessionId).toBe(sessionId);
    expect(result.sessionData.messages[0].content).toBe('Test message');
  });

  it('should deduplicate sessions by ID', async () => {
    const sessionId = randomUUID();

    // Create test session files
    const chatsDir = path.join(tmpDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    const sessionOriginal = {
      sessionId,
      projectHash: 'test-hash',
      startTime: '2024-01-01T10:00:00.000Z',
      lastUpdated: '2024-01-01T10:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'Original',
          id: 'msg1',
          timestamp: '2024-01-01T10:00:00.000Z',
        },
      ],
    };

    const sessionDuplicate = {
      sessionId,
      projectHash: 'test-hash',
      startTime: '2024-01-01T10:00:00.000Z',
      lastUpdated: '2024-01-01T11:00:00.000Z', // Newer
      messages: [
        {
          type: 'user',
          content: 'Newer Duplicate',
          id: 'msg1',
          timestamp: '2024-01-01T10:00:00.000Z',
        },
      ],
    };

    // File 1
    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T10-00-${sessionId.slice(0, 8)}.json`,
      ),
      JSON.stringify(sessionOriginal, null, 2),
    );

    // File 2 (Simulate a copy or newer version with same ID)
    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T11-00-${sessionId.slice(0, 8)}.json`,
      ),
      JSON.stringify(sessionDuplicate, null, 2),
    );

    const sessionSelector = new SessionSelector(config);
    const sessions = await sessionSelector.listSessions();

    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe(sessionId);
    // Should keep the one with later lastUpdated
    expect(sessions[0].lastUpdated).toBe('2024-01-01T11:00:00.000Z');
  });

  it('should throw error for invalid session identifier', async () => {
    const sessionId1 = randomUUID();

    // Create test session files
    const chatsDir = path.join(tmpDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    const session1 = {
      sessionId: sessionId1,
      projectHash: 'test-hash',
      startTime: '2024-01-01T10:00:00.000Z',
      lastUpdated: '2024-01-01T10:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'Test message 1',
          id: 'msg1',
          timestamp: '2024-01-01T10:00:00.000Z',
        },
      ],
    };

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T10-00-${sessionId1.slice(0, 8)}.json`,
      ),
      JSON.stringify(session1, null, 2),
    );

    const sessionSelector = new SessionSelector(config);

    await expect(
      sessionSelector.resolveSession('invalid-uuid'),
    ).rejects.toThrow(SessionError);

    await expect(sessionSelector.resolveSession('999')).rejects.toThrow(
      SessionError,
    );
  });

  it('should throw SessionError with NO_SESSIONS_FOUND when resolving latest with no sessions', async () => {
    // Empty chats directory — no session files
    const chatsDir = path.join(tmpDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    const emptyConfig = {
      storage: {
        getProjectTempDir: () => tmpDir,
      },
      getSessionId: () => 'current-session-id',
    } as Partial<Config> as Config;

    const sessionSelector = new SessionSelector(emptyConfig);

    await expect(sessionSelector.resolveSession('latest')).rejects.toSatisfy(
      (error) => {
        expect(error).toBeInstanceOf(SessionError);
        expect((error as SessionError).code).toBe('NO_SESSIONS_FOUND');
        return true;
      },
    );
  });

  it('should not list sessions with only system messages', async () => {
    const sessionIdWithUser = randomUUID();
    const sessionIdSystemOnly = randomUUID();

    // Create test session files
    const chatsDir = path.join(tmpDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    // Session with user message - should be listed
    const sessionWithUser = {
      sessionId: sessionIdWithUser,
      projectHash: 'test-hash',
      startTime: '2024-01-01T10:00:00.000Z',
      lastUpdated: '2024-01-01T10:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'Hello world',
          id: 'msg1',
          timestamp: '2024-01-01T10:00:00.000Z',
        },
      ],
    };

    // Session with only system messages - should NOT be listed
    const sessionSystemOnly = {
      sessionId: sessionIdSystemOnly,
      projectHash: 'test-hash',
      startTime: '2024-01-01T11:00:00.000Z',
      lastUpdated: '2024-01-01T11:30:00.000Z',
      messages: [
        {
          type: 'info',
          content: 'Session started',
          id: 'msg1',
          timestamp: '2024-01-01T11:00:00.000Z',
        },
        {
          type: 'error',
          content: 'An error occurred',
          id: 'msg2',
          timestamp: '2024-01-01T11:01:00.000Z',
        },
      ],
    };

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T10-00-${sessionIdWithUser.slice(0, 8)}.json`,
      ),
      JSON.stringify(sessionWithUser, null, 2),
    );

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T11-00-${sessionIdSystemOnly.slice(0, 8)}.json`,
      ),
      JSON.stringify(sessionSystemOnly, null, 2),
    );

    const sessionSelector = new SessionSelector(config);
    const sessions = await sessionSelector.listSessions();

    // Should only list the session with user message
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe(sessionIdWithUser);
  });

  it('should list session with gemini message even without user message', async () => {
    const sessionIdGeminiOnly = randomUUID();

    // Create test session files
    const chatsDir = path.join(tmpDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    // Session with only gemini message - should be listed
    const sessionGeminiOnly = {
      sessionId: sessionIdGeminiOnly,
      projectHash: 'test-hash',
      startTime: '2024-01-01T10:00:00.000Z',
      lastUpdated: '2024-01-01T10:30:00.000Z',
      messages: [
        {
          type: 'gemini',
          content: 'Hello, how can I help?',
          id: 'msg1',
          timestamp: '2024-01-01T10:00:00.000Z',
        },
      ],
    };

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T10-00-${sessionIdGeminiOnly.slice(0, 8)}.json`,
      ),
      JSON.stringify(sessionGeminiOnly, null, 2),
    );

    const sessionSelector = new SessionSelector(config);
    const sessions = await sessionSelector.listSessions();

    // Should list the session with gemini message
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe(sessionIdGeminiOnly);
  });

  it('should not list sessions marked as subagent', async () => {
    const mainSessionId = randomUUID();
    const subagentSessionId = randomUUID();

    // Create test session files
    const chatsDir = path.join(tmpDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    // Main session - should be listed
    const mainSession = {
      sessionId: mainSessionId,
      projectHash: 'test-hash',
      startTime: '2024-01-01T10:00:00.000Z',
      lastUpdated: '2024-01-01T10:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'Hello world',
          id: 'msg1',
          timestamp: '2024-01-01T10:00:00.000Z',
        },
      ],
      kind: 'main',
    };

    // Subagent session - should NOT be listed
    const subagentSession = {
      sessionId: subagentSessionId,
      projectHash: 'test-hash',
      startTime: '2024-01-01T11:00:00.000Z',
      lastUpdated: '2024-01-01T11:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'Internal subagent task',
          id: 'msg1',
          timestamp: '2024-01-01T11:00:00.000Z',
        },
      ],
      kind: 'subagent',
    };

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T10-00-${mainSessionId.slice(0, 8)}.json`,
      ),
      JSON.stringify(mainSession, null, 2),
    );

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T11-00-${subagentSessionId.slice(0, 8)}.json`,
      ),
      JSON.stringify(subagentSession, null, 2),
    );

    const sessionSelector = new SessionSelector(config);
    const sessions = await sessionSelector.listSessions();

    // Should only list the main session
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe(mainSessionId);
  });

  it('should find global sessions', async () => {
    const sessionId = randomUUID();
    const alias = 'global-alias';

    // Setup other project's session
    const otherProjectDir = path.join(path.dirname(tmpDir), 'other-project');
    const otherChatsDir = path.join(otherProjectDir, 'chats');
    await fs.mkdir(otherChatsDir, { recursive: true });

    const session = {
      sessionId,
      projectHash: 'other-hash',
      alias,
      startTime: '2024-01-01T10:00:00.000Z',
      lastUpdated: '2024-01-01T10:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'Global message',
          id: 'msg1',
          timestamp: '2024-01-01T10:00:00.000Z',
        },
      ],
    };

    await fs.writeFile(
      path.join(
        otherChatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T10-00-${sessionId.slice(0, 8)}.json`,
      ),
      JSON.stringify(session, null, 2),
    );

    const sessionSelector = new SessionSelector(config);

    // Search by alias
    const matchesByAlias = await sessionSelector.findGlobalSessions(alias);
    expect(matchesByAlias.length).toBe(1);
    expect(matchesByAlias[0].session.id).toBe(sessionId);
    expect(matchesByAlias[0].projectIdentifier).toBe('other-project');

    // Search by UUID
    const matchesByUuid = await sessionSelector.findGlobalSessions(sessionId);
    expect(matchesByUuid.length).toBe(1);
    expect(matchesByUuid[0].session.id).toBe(sessionId);
  });

  it('should import session from another workspace', async () => {
    const sessionId = randomUUID();
    const fileName = `${SESSION_FILE_PREFIX}2024-01-01T10-00-${sessionId.slice(0, 8)}.json`;

    // Setup other project's session
    const otherProjectDir = path.join(path.dirname(tmpDir), 'other-project');
    const otherChatsDir = path.join(otherProjectDir, 'chats');
    await fs.mkdir(otherChatsDir, { recursive: true });

    const session = {
      sessionId,
      projectHash: 'other-hash',
      startTime: '2024-01-01T10:00:00.000Z',
      lastUpdated: '2024-01-01T10:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'Global message',
          id: 'msg1',
          timestamp: '2024-01-01T10:00:00.000Z',
        },
      ],
    };

    await fs.writeFile(
      path.join(otherChatsDir, fileName),
      JSON.stringify(session, null, 2),
    );

    // Setup other project's logs
    const otherLogsDir = path.join(otherProjectDir, 'logs');
    await fs.mkdir(otherLogsDir, { recursive: true });
    await fs.writeFile(
      path.join(otherLogsDir, `session-${sessionId}.jsonl`),
      '{"log":"entry"}\n',
    );

    const sessionSelector = new SessionSelector(config);
    const match = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session: { id: sessionId, fileName } as unknown as any,
      projectPath: '/path/to/other',
      projectIdentifier: 'other-project',
    };

    const imported = await sessionSelector.importSession(match);

    // Verify session file copied
    const targetPath = path.join(tmpDir, 'chats', fileName);
    const targetContent = JSON.parse(await fs.readFile(targetPath, 'utf8'));
    expect(targetContent.sessionId).toBe(sessionId);

    // Verify log file copied
    const targetLogPath = path.join(
      tmpDir,
      'logs',
      `session-${sessionId}.jsonl`,
    );
    const logExists = await fs
      .stat(targetLogPath)
      .then(() => true)
      .catch(() => false);
    expect(logExists).toBe(true);

    expect(imported.id).toBe(sessionId);
  });
});

describe('extractFirstUserMessage', () => {
  it('should extract first non-resume user message', () => {
    const messages = [
      {
        type: 'user',
        content: '/resume',
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
      {
        type: 'user',
        content: 'Hello world',
        id: 'msg2',
        timestamp: '2024-01-01T10:01:00.000Z',
      },
    ] as MessageRecord[];

    expect(extractFirstUserMessage(messages)).toBe('Hello world');
  });

  it('should not truncate long messages', () => {
    const longMessage = 'a'.repeat(150);
    const messages = [
      {
        type: 'user',
        content: longMessage,
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
    ] as MessageRecord[];

    const result = extractFirstUserMessage(messages);
    expect(result).toBe(longMessage);
  });

  it('should return "Empty conversation" for no user messages', () => {
    const messages = [
      {
        type: 'gemini',
        content: 'Hello',
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
    ] as MessageRecord[];

    expect(extractFirstUserMessage(messages)).toBe('Empty conversation');
  });
});

describe('hasUserOrAssistantMessage', () => {
  it('should return true when session has user message', () => {
    const messages = [
      {
        type: 'user',
        content: 'Hello',
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
    ] as MessageRecord[];

    expect(hasUserOrAssistantMessage(messages)).toBe(true);
  });

  it('should return true when session has gemini message', () => {
    const messages = [
      {
        type: 'gemini',
        content: 'Hello, how can I help?',
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
    ] as MessageRecord[];

    expect(hasUserOrAssistantMessage(messages)).toBe(true);
  });

  it('should return true when session has both user and gemini messages', () => {
    const messages = [
      {
        type: 'user',
        content: 'Hello',
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
      {
        type: 'gemini',
        content: 'Hi there!',
        id: 'msg2',
        timestamp: '2024-01-01T10:01:00.000Z',
      },
    ] as MessageRecord[];

    expect(hasUserOrAssistantMessage(messages)).toBe(true);
  });

  it('should return false when session only has info messages', () => {
    const messages = [
      {
        type: 'info',
        content: 'Session started',
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
    ] as MessageRecord[];

    expect(hasUserOrAssistantMessage(messages)).toBe(false);
  });

  it('should return false when session only has error messages', () => {
    const messages = [
      {
        type: 'error',
        content: 'An error occurred',
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
    ] as MessageRecord[];

    expect(hasUserOrAssistantMessage(messages)).toBe(false);
  });

  it('should return false when session only has warning messages', () => {
    const messages = [
      {
        type: 'warning',
        content: 'Warning message',
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
    ] as MessageRecord[];

    expect(hasUserOrAssistantMessage(messages)).toBe(false);
  });

  it('should return false when session only has system messages (mixed)', () => {
    const messages = [
      {
        type: 'info',
        content: 'Session started',
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
      {
        type: 'error',
        content: 'An error occurred',
        id: 'msg2',
        timestamp: '2024-01-01T10:01:00.000Z',
      },
      {
        type: 'warning',
        content: 'Warning message',
        id: 'msg3',
        timestamp: '2024-01-01T10:02:00.000Z',
      },
    ] as MessageRecord[];

    expect(hasUserOrAssistantMessage(messages)).toBe(false);
  });

  it('should return true when session has user message among system messages', () => {
    const messages = [
      {
        type: 'info',
        content: 'Session started',
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
      {
        type: 'user',
        content: 'Hello',
        id: 'msg2',
        timestamp: '2024-01-01T10:01:00.000Z',
      },
      {
        type: 'error',
        content: 'An error occurred',
        id: 'msg3',
        timestamp: '2024-01-01T10:02:00.000Z',
      },
    ] as MessageRecord[];

    expect(hasUserOrAssistantMessage(messages)).toBe(true);
  });

  it('should return false for empty messages array', () => {
    const messages: MessageRecord[] = [];
    expect(hasUserOrAssistantMessage(messages)).toBe(false);
  });
});

describe('formatRelativeTime', () => {
  it('should format time correctly', () => {
    const now = new Date();

    // 5 minutes ago
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    expect(formatRelativeTime(fiveMinutesAgo.toISOString())).toBe(
      '5 minutes ago',
    );

    // 1 minute ago
    const oneMinuteAgo = new Date(now.getTime() - 1 * 60 * 1000);
    expect(formatRelativeTime(oneMinuteAgo.toISOString())).toBe('1 minute ago');

    // 2 hours ago
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    expect(formatRelativeTime(twoHoursAgo.toISOString())).toBe('2 hours ago');

    // 1 hour ago
    const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    expect(formatRelativeTime(oneHourAgo.toISOString())).toBe('1 hour ago');

    // 3 days ago
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(threeDaysAgo.toISOString())).toBe('3 days ago');

    // 1 day ago
    const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(oneDayAgo.toISOString())).toBe('1 day ago');

    // Just now (within 60 seconds)
    const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);
    expect(formatRelativeTime(thirtySecondsAgo.toISOString())).toBe('Just now');
  });
});
