/**
 * Workspace Manager
 *
 * Manages persistent code workspaces — each objective can get a directory
 * where the agent writes code, runs CLI commands, and deploys services.
 *
 * Workspaces persist across sessions and restarts. Think of each workspace
 * as the agent having its own machine with a shell — like running Claude Code.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { spawn, type ChildProcess } from 'child_process';
import { db } from '../../db.js';
import { workspaces, workspaceFiles } from '@lamdis/db/schema';
import { eq, and } from 'drizzle-orm';
import { env } from '../../lib/env.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateWorkspaceOpts {
  outcomeInstanceId?: string;
  name: string;
  envVars?: Record<string, string>;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface DeployServiceOpts {
  name: string;
  command: string;
  port?: number;
  healthUrl?: string;
}

export interface ServiceInfo {
  name: string;
  command: string;
  pid?: number;
  port?: number;
  healthUrl?: string;
  status: 'running' | 'stopped' | 'error';
  startedAt?: string;
}

interface FileEntry {
  path: string;
  isDirectory: boolean;
  sizeBytes: number;
  mimeType?: string;
  modifiedAt: string;
}

// Track running service processes
const runningProcesses = new Map<string, Map<string, ChildProcess>>();

// ---------------------------------------------------------------------------
// Workspace CRUD
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = path.resolve(env.WORKSPACE_ROOT || './data/workspaces');

/**
 * Create a new persistent workspace directory.
 */
export async function createWorkspace(orgId: string, opts: CreateWorkspaceOpts) {
  const workspaceId = crypto.randomUUID();
  const rootPath = path.join(WORKSPACE_ROOT, orgId, workspaceId);

  // Create directory structure
  fs.mkdirSync(rootPath, { recursive: true });
  fs.mkdirSync(path.join(rootPath, 'src'), { recursive: true });

  // Write a README
  fs.writeFileSync(path.join(rootPath, 'README.md'),
    `# ${opts.name}\n\nWorkspace for objective. Agent writes code and runs commands here.\n`);

  // Write .env if provided
  if (opts.envVars && Object.keys(opts.envVars).length > 0) {
    const envContent = Object.entries(opts.envVars)
      .map(([k, v]) => `${k}=${v}`).join('\n');
    fs.writeFileSync(path.join(rootPath, '.env'), envContent);
  }

  // Insert DB record
  const [workspace] = await db.insert(workspaces).values({
    id: workspaceId,
    orgId,
    outcomeInstanceId: opts.outcomeInstanceId || undefined,
    name: opts.name,
    status: 'active',
    rootPath,
    envVars: opts.envVars || {},
    lastActivityAt: new Date(),
  } as any).returning();

  return workspace;
}

/**
 * Get workspace by ID.
 */
export async function getWorkspace(workspaceId: string) {
  const [workspace] = await db.select().from(workspaces)
    .where(eq(workspaces.id, workspaceId)).limit(1);
  return workspace || null;
}

/**
 * Get workspace for an outcome instance (creates one if needed).
 */
export async function getOrCreateWorkspaceForInstance(orgId: string, instanceId: string, name: string) {
  const [existing] = await db.select().from(workspaces)
    .where(and(eq(workspaces.orgId, orgId), eq(workspaces.outcomeInstanceId, instanceId)))
    .limit(1);

  if (existing) return existing;

  return createWorkspace(orgId, {
    outcomeInstanceId: instanceId,
    name,
  });
}

/**
 * Archive a workspace (marks as archived, does NOT delete files).
 */
export async function archiveWorkspace(workspaceId: string) {
  // Stop all running services first
  await stopAllServices(workspaceId);

  await db.update(workspaces).set({
    status: 'archived',
    updatedAt: new Date(),
  } as any).where(eq(workspaces.id, workspaceId));
}

/**
 * Delete a workspace (removes files and DB record). Use with caution.
 */
export async function deleteWorkspace(workspaceId: string) {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return;

  await stopAllServices(workspaceId);

  // Remove directory
  if (fs.existsSync(workspace.rootPath)) {
    fs.rmSync(workspace.rootPath, { recursive: true, force: true });
  }

  // Remove file index
  await db.delete(workspaceFiles).where(eq(workspaceFiles.workspaceId, workspaceId));
  // Remove workspace record
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
}

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------

/**
 * Write a file to the workspace. Creates parent directories as needed.
 */
export async function writeFile(workspaceId: string, filePath: string, content: string | Buffer): Promise<void> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  const fullPath = resolveSafePath(workspace.rootPath, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });

  const data = typeof content === 'string' ? Buffer.from(content) : content;
  fs.writeFileSync(fullPath, data);

  // Update file index
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  const existing = await db.select().from(workspaceFiles)
    .where(and(eq(workspaceFiles.workspaceId, workspaceId), eq(workspaceFiles.path, filePath)))
    .limit(1);

  if (existing.length > 0) {
    await db.update(workspaceFiles).set({
      contentHash: hash,
      sizeBytes: data.length,
      version: (existing[0].version || 1) + 1,
      updatedAt: new Date(),
    } as any).where(eq(workspaceFiles.id, existing[0].id));
  } else {
    await db.insert(workspaceFiles).values({
      workspaceId,
      orgId: workspace.orgId,
      path: filePath,
      contentHash: hash,
      sizeBytes: data.length,
      mimeType: guessMimeType(filePath),
      createdBy: 'agent',
    } as any);
  }

  // Update workspace activity
  await db.update(workspaces).set({
    lastActivityAt: new Date(),
    updatedAt: new Date(),
  } as any).where(eq(workspaces.id, workspaceId));
}

/**
 * Read a file from the workspace.
 */
export async function readFile(workspaceId: string, filePath: string): Promise<string> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  const fullPath = resolveSafePath(workspace.rootPath, filePath);
  if (!fs.existsSync(fullPath)) throw new Error(`File not found: ${filePath}`);
  return fs.readFileSync(fullPath, 'utf-8');
}

/**
 * List files in a workspace directory.
 */
export async function listFiles(workspaceId: string, dirPath = '.'): Promise<FileEntry[]> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  const fullPath = resolveSafePath(workspace.rootPath, dirPath);
  if (!fs.existsSync(fullPath)) return [];

  const entries: FileEntry[] = [];
  const items = fs.readdirSync(fullPath, { withFileTypes: true });

  for (const item of items) {
    // Skip node_modules and .git for cleaner listings
    if (item.name === 'node_modules' || item.name === '.git') continue;

    const itemPath = path.join(dirPath === '.' ? '' : dirPath, item.name);
    const stat = fs.statSync(path.join(fullPath, item.name));

    entries.push({
      path: itemPath,
      isDirectory: item.isDirectory(),
      sizeBytes: stat.size,
      mimeType: item.isFile() ? guessMimeType(item.name) : undefined,
      modifiedAt: stat.mtime.toISOString(),
    });
  }

  return entries.sort((a, b) => {
    // Directories first, then alphabetical
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.path.localeCompare(b.path);
  });
}

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

const COMMAND_DENYLIST = ['rm -rf /', 'mkfs', 'dd if=/dev/zero', ':(){:|:&};:'];
const MAX_EXEC_TIMEOUT = 300000; // 5 minutes

/**
 * Execute a shell command in the workspace directory.
 */
export async function execInWorkspace(
  workspaceId: string,
  command: string,
  opts?: { timeoutMs?: number; env?: Record<string, string> },
): Promise<ExecResult> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  // Safety check
  for (const denied of COMMAND_DENYLIST) {
    if (command.includes(denied)) {
      return { stdout: '', stderr: `Command blocked: contains dangerous pattern`, exitCode: 1, durationMs: 0 };
    }
  }

  const timeout = Math.min(opts?.timeoutMs || 60000, MAX_EXEC_TIMEOUT);
  const startTime = Date.now();

  return new Promise<ExecResult>((resolve) => {
    const proc = spawn('bash', ['-c', command], {
      cwd: workspace.rootPath,
      env: {
        ...process.env,
        ...(workspace.envVars as Record<string, string> || {}),
        ...opts?.env,
        HOME: workspace.rootPath,
      },
      timeout,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => { stdout += data.toString(); });
    proc.stderr?.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', async (code) => {
      const durationMs = Date.now() - startTime;

      // Truncate output to prevent memory issues
      stdout = stdout.slice(0, 50000);
      stderr = stderr.slice(0, 50000);

      // Update workspace activity
      try {
        await db.update(workspaces).set({
          lastExecAt: new Date(),
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        } as any).where(eq(workspaces.id, workspaceId));
      } catch { /* non-critical */ }

      resolve({ stdout, stderr, exitCode: code ?? 1, durationMs });
    });

    proc.on('error', (err) => {
      resolve({
        stdout: '',
        stderr: err.message,
        exitCode: 1,
        durationMs: Date.now() - startTime,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Service deployment
// ---------------------------------------------------------------------------

/**
 * Deploy a long-running process in the workspace.
 */
export async function deployService(
  workspaceId: string,
  opts: DeployServiceOpts,
): Promise<ServiceInfo> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  // Stop existing service with same name if running
  await stopService(workspaceId, opts.name);

  const proc = spawn('bash', ['-c', opts.command], {
    cwd: workspace.rootPath,
    env: {
      ...process.env,
      ...(workspace.envVars as Record<string, string> || {}),
      PORT: opts.port?.toString() || '',
    },
    detached: true,
    stdio: 'ignore',
  });

  proc.unref();

  // Track the process
  if (!runningProcesses.has(workspaceId)) {
    runningProcesses.set(workspaceId, new Map());
  }
  runningProcesses.get(workspaceId)!.set(opts.name, proc);

  const serviceInfo: ServiceInfo = {
    name: opts.name,
    command: opts.command,
    pid: proc.pid,
    port: opts.port,
    healthUrl: opts.healthUrl,
    status: 'running',
    startedAt: new Date().toISOString(),
  };

  // Update deployed services in DB
  const services = ((workspace.deployedServices || []) as ServiceInfo[])
    .filter(s => s.name !== opts.name);
  services.push(serviceInfo);

  await db.update(workspaces).set({
    deployedServices: services,
    lastActivityAt: new Date(),
    updatedAt: new Date(),
  } as any).where(eq(workspaces.id, workspaceId));

  return serviceInfo;
}

/**
 * Stop a deployed service.
 */
export async function stopService(workspaceId: string, serviceName: string): Promise<void> {
  const procs = runningProcesses.get(workspaceId);
  const proc = procs?.get(serviceName);

  if (proc && proc.pid) {
    try {
      process.kill(-proc.pid, 'SIGTERM');
    } catch { /* already dead */ }
    procs?.delete(serviceName);
  }

  // Update DB
  const workspace = await getWorkspace(workspaceId);
  if (workspace) {
    const services = ((workspace.deployedServices || []) as ServiceInfo[])
      .map(s => s.name === serviceName ? { ...s, status: 'stopped' as const, pid: undefined } : s);

    await db.update(workspaces).set({
      deployedServices: services,
      updatedAt: new Date(),
    } as any).where(eq(workspaces.id, workspaceId));
  }
}

/**
 * Stop all services in a workspace.
 */
async function stopAllServices(workspaceId: string): Promise<void> {
  const procs = runningProcesses.get(workspaceId);
  if (procs) {
    for (const [name] of procs) {
      await stopService(workspaceId, name);
    }
    runningProcesses.delete(workspaceId);
  }
}

/**
 * Get status of all services in a workspace.
 */
export async function getServices(workspaceId: string): Promise<ServiceInfo[]> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return [];
  return (workspace.deployedServices || []) as ServiceInfo[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a file path safely within the workspace root (prevent traversal).
 */
function resolveSafePath(workspaceRoot: string, filePath: string): string {
  const resolved = path.resolve(workspaceRoot, filePath);
  if (!resolved.startsWith(path.resolve(workspaceRoot))) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

function guessMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.js': 'application/javascript', '.ts': 'application/typescript',
    '.json': 'application/json', '.html': 'text/html', '.css': 'text/css',
    '.py': 'text/x-python', '.rb': 'text/x-ruby', '.go': 'text/x-go',
    '.rs': 'text/x-rust', '.java': 'text/x-java', '.sh': 'text/x-shellscript',
    '.yml': 'text/yaml', '.yaml': 'text/yaml', '.toml': 'text/toml',
    '.md': 'text/markdown', '.txt': 'text/plain', '.csv': 'text/csv',
    '.xml': 'text/xml', '.sql': 'text/x-sql', '.tf': 'text/x-terraform',
    '.dockerfile': 'text/x-dockerfile', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
  };
  return mimeMap[ext] || 'application/octet-stream';
}
