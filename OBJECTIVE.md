# Objective: Persona Adoption for Main Agent

The goal of this experiment is to allow the Gemini CLI main agent to "become" a
specific subagent (adopting its identity, rules, and toolset) while remaining in
the interactive main session.

## Analysis of Current State

- **Main Agent Prompting:** Handled by `getCoreSystemPrompt` in
  `packages/core/src/core/prompts.ts`. It currently aggregates `GEMINI.md` and
  standard system rules.
- **Subagent Logic:** Handled by `AgentRegistry` (discovery) and
  `LocalAgentExecutor` (isolated execution).
- **Client Lifecycle:** `GeminiClient` (in `client.ts`) manages the active
  session and supports `updateSystemInstruction()`.
- **Skills:** Currently used as "mixins" rather than complete persona overrides.

## Implementation Plan

### Phase 1: Research & Core Integration

The goal is to allow the `Config` object to hold an "Active Persona" state that
overrides the default main agent behavior.

- **Modify `packages/core/src/config/config.ts`**:
  - Add `activePersona: AgentDefinition | null` state.
  - Implement `setActivePersona(agent: AgentDefinition | null)` and
    `getActivePersona()`.
  - Trigger `updateSystemInstructionIfInitialized()` on persona change.
- **Modify `packages/core/src/core/prompts.ts`**:
  - Update `getCoreSystemPrompt` to prioritize the active persona's
    `system_prompt`.
  - Use `GEMINI.md` as supporting project context rather than the primary
    instruction.

### Phase 2: CLI & Command Implementation

Provide a way for users to switch personas dynamically.

- **Modify `packages/cli/src/ui/commands/agentsCommand.ts`**:
  - Implement `/agents adopt <name>` to switch to a persona.
  - Implement `/agents reset` to return to the default main agent.
- **Modify Startup Logic (`packages/cli/src/index.ts`)**:
  - Add `--agent <name>` (or `-a <name>`) CLI flag to start with a specific
    persona.

### Phase 3: Toolset & Environment Synchronization

Ensure the main agent follows the persona's tool constraints.

- **Modify `packages/core/src/core/client.ts`**:
  - Update `setTools()` to respect `config.getActivePersona()?.tools`.
  - Handle toolset re-registration when switching personas mid-session.
- **Safety Checks**:
  - Ensure persona adoption respects `experimental.enableAgents` setting.

## Expected Workflow

1. **Startup:** `gemini --agent vibe-checker`
   - Starts a main session with the "Vibe Checker" persona.
   - All interactions follow the Vibe Checker's rules and toolset.
2. **In-Session Switching:** `/agents adopt senior-architect`
   - Dynamically updates the system instruction and available tools.
   - The agent's "voice" and "capabilities" shift immediately.
