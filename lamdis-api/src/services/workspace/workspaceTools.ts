/**
 * Workspace Agent Tools
 *
 * Tools that give the agent full shell access to its workspace.
 * The agent can write code, run CLI commands (npm, terraform, python, git, etc.),
 * and deploy long-running services.
 */

import type { AgentTool, AgentToolResult } from '../automation/agentTools.js';
import * as workspaceManager from './workspaceManager.js';

// Context holder — set by the orchestrator/conversation engine before tool use
let _workspaceContext: { workspaceId: string; orgId: string } | null = null;

export function setWorkspaceContext(workspaceId: string, orgId: string) {
  _workspaceContext = { workspaceId, orgId };
}

export function clearWorkspaceContext() {
  _workspaceContext = null;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const workspaceWriteFileTool: AgentTool = {
  name: 'workspace_write_file',
  description: 'Write a file to your workspace. Creates parent directories as needed. Use this to write code, configs, scripts, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to workspace root (e.g. "src/server.js", "terraform/main.tf")' },
      content: { type: 'string', description: 'File content to write' },
    },
    required: ['path', 'content'],
  },
  async execute(input): Promise<AgentToolResult> {
    if (!_workspaceContext) return { ok: false, error: 'No workspace context — workspace not yet created' };
    try {
      await workspaceManager.writeFile(_workspaceContext.workspaceId, input.path as string, input.content as string);
      return { ok: true, result: { written: input.path } };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to write file' };
    }
  },
};

const workspaceReadFileTool: AgentTool = {
  name: 'workspace_read_file',
  description: 'Read a file from your workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to workspace root' },
    },
    required: ['path'],
  },
  async execute(input): Promise<AgentToolResult> {
    if (!_workspaceContext) return { ok: false, error: 'No workspace context' };
    try {
      const content = await workspaceManager.readFile(_workspaceContext.workspaceId, input.path as string);
      return { ok: true, result: { path: input.path, content: content.slice(0, 20000) } };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to read file' };
    }
  },
};

const workspaceExecTool: AgentTool = {
  name: 'workspace_exec',
  description: 'Execute a shell command in your workspace directory. You can run any CLI command: npm install, terraform apply, python scripts, git, docker, etc. Commands run with bash.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute (e.g. "npm install express", "python analyze.py", "terraform init && terraform plan")' },
      timeoutMs: { type: 'number', description: 'Timeout in milliseconds (default 60000, max 300000)' },
    },
    required: ['command'],
  },
  async execute(input): Promise<AgentToolResult> {
    if (!_workspaceContext) return { ok: false, error: 'No workspace context' };
    try {
      const result = await workspaceManager.execInWorkspace(
        _workspaceContext.workspaceId,
        input.command as string,
        { timeoutMs: input.timeoutMs as number },
      );
      return {
        ok: result.exitCode === 0,
        result: {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          durationMs: result.durationMs,
        },
        error: result.exitCode !== 0 ? `Command exited with code ${result.exitCode}` : undefined,
      };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to execute command' };
    }
  },
};

const workspaceLsTool: AgentTool = {
  name: 'workspace_ls',
  description: 'List files and directories in your workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path relative to workspace root (default ".")' },
    },
    required: [],
  },
  async execute(input): Promise<AgentToolResult> {
    if (!_workspaceContext) return { ok: false, error: 'No workspace context' };
    try {
      const entries = await workspaceManager.listFiles(_workspaceContext.workspaceId, (input.path as string) || '.');
      return { ok: true, result: { entries } };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to list files' };
    }
  },
};

const workspaceDeployTool: AgentTool = {
  name: 'workspace_deploy',
  description: 'Start a long-running service in your workspace (e.g., a web server, API, or background worker). The process runs detached and survives agent ticks.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Service name (unique within workspace)' },
      command: { type: 'string', description: 'Command to run (e.g. "node server.js", "python -m http.server 8080")' },
      port: { type: 'number', description: 'Port the service listens on (for health checks)' },
      healthUrl: { type: 'string', description: 'URL to check service health (e.g. "http://localhost:8080/health")' },
    },
    required: ['name', 'command'],
  },
  async execute(input): Promise<AgentToolResult> {
    if (!_workspaceContext) return { ok: false, error: 'No workspace context' };
    try {
      const service = await workspaceManager.deployService(_workspaceContext.workspaceId, {
        name: input.name as string,
        command: input.command as string,
        port: input.port as number | undefined,
        healthUrl: input.healthUrl as string | undefined,
      });
      return { ok: true, result: { service } };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to deploy service' };
    }
  },
};

const workspaceStopServiceTool: AgentTool = {
  name: 'workspace_stop_service',
  description: 'Stop a running service in your workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Service name to stop' },
    },
    required: ['name'],
  },
  async execute(input): Promise<AgentToolResult> {
    if (!_workspaceContext) return { ok: false, error: 'No workspace context' };
    try {
      await workspaceManager.stopService(_workspaceContext.workspaceId, input.name as string);
      return { ok: true, result: { stopped: input.name } };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to stop service' };
    }
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Get all workspace tools. Only include these when a workspace exists.
 */
export function getWorkspaceTools(): AgentTool[] {
  return [
    workspaceWriteFileTool,
    workspaceReadFileTool,
    workspaceExecTool,
    workspaceLsTool,
    workspaceDeployTool,
    workspaceStopServiceTool,
  ];
}
