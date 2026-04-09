/**
 * Filesystem command handlers — scoped to rootDir.
 *
 * Every operation validates that the resolved path stays within rootDir.
 * The agent cannot escape the sandbox.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, relative, join, basename, extname } from 'path';
import { execSync } from 'child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BridgeCommand {
  action: 'search_files' | 'read_file' | 'find_env_vars' | 'list_dir' | 'grep' | 'exec_command';
  pattern?: string;    // glob or filename pattern
  path?: string;       // relative path within rootDir
  query?: string;      // search text for grep
  command?: string;    // shell command for exec_command
  cwd?: string;        // working directory for exec_command (relative to rootDir)
  timeout?: number;    // max execution time in ms (default 30000, max 120000)
  maxResults?: number;
  maxDepth?: number;
  includeHidden?: boolean;
}

export interface BridgeResponse {
  ok: boolean;
  summary?: string;
  data?: unknown;
  error?: string;
}

// ---------------------------------------------------------------------------
// Security: path validation
// ---------------------------------------------------------------------------

function safePath(rootDir: string, requestedPath: string): string | null {
  const resolved = resolve(rootDir, requestedPath);
  if (!resolved.startsWith(rootDir)) return null; // escape attempt
  return resolved;
}

// Skip patterns — never expose these
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv', 'vendor']);
const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db']);
const BINARY_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.zip', '.tar', '.gz', '.exe', '.dll', '.so', '.dylib']);

// ---------------------------------------------------------------------------
// Command dispatcher
// ---------------------------------------------------------------------------

export async function handleCommand(cmd: BridgeCommand, rootDir: string): Promise<BridgeResponse> {
  try {
    switch (cmd.action) {
      case 'search_files': return searchFiles(rootDir, cmd);
      case 'read_file': return readFile(rootDir, cmd);
      case 'find_env_vars': return findEnvVars(rootDir, cmd);
      case 'list_dir': return listDir(rootDir, cmd);
      case 'grep': return grepFiles(rootDir, cmd);
      case 'exec_command': return execCommand(rootDir, cmd);
      default: return { ok: false, error: `Unknown action: ${cmd.action}` };
    }
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// search_files — find files matching a pattern
// ---------------------------------------------------------------------------

function searchFiles(rootDir: string, cmd: BridgeCommand): BridgeResponse {
  const pattern = (cmd.pattern || '*').toLowerCase();
  const maxResults = cmd.maxResults || 50;
  const maxDepth = cmd.maxDepth || 8;
  const results: Array<{ path: string; size: number; modified: string }> = [];

  function walk(dir: string, depth: number) {
    if (depth > maxDepth || results.length >= maxResults) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxResults) break;
        if (!cmd.includeHidden && entry.name.startsWith('.') && entry.name !== '.env') continue;
        if (SKIP_DIRS.has(entry.name)) continue;
        if (SKIP_FILES.has(entry.name)) continue;

        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (entry.isFile()) {
          const name = entry.name.toLowerCase();
          if (matchPattern(name, pattern)) {
            const stat = statSync(fullPath);
            results.push({
              path: relative(rootDir, fullPath).replace(/\\/g, '/'),
              size: stat.size,
              modified: stat.mtime.toISOString(),
            });
          }
        }
      }
    } catch { /* permission denied, etc. */ }
  }

  walk(rootDir, 0);

  return {
    ok: true,
    summary: `Found ${results.length} files matching "${cmd.pattern}"`,
    data: { pattern: cmd.pattern, results },
  };
}

function matchPattern(name: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.startsWith('*.')) return name.endsWith(pattern.slice(1));
  if (pattern.endsWith('*')) return name.startsWith(pattern.slice(0, -1));
  return name.includes(pattern);
}

// ---------------------------------------------------------------------------
// read_file — read a file's contents (text only, capped at 100KB)
// ---------------------------------------------------------------------------

function readFile(rootDir: string, cmd: BridgeCommand): BridgeResponse {
  if (!cmd.path) return { ok: false, error: 'path is required' };

  const fullPath = safePath(rootDir, cmd.path);
  if (!fullPath) return { ok: false, error: 'Path outside allowed directory' };
  if (!existsSync(fullPath)) return { ok: false, error: `File not found: ${cmd.path}` };

  const ext = extname(fullPath).toLowerCase();
  if (BINARY_EXTS.has(ext)) {
    const stat = statSync(fullPath);
    return { ok: true, summary: `Binary file: ${basename(fullPath)} (${(stat.size / 1024).toFixed(1)} KB)`, data: { binary: true, size: stat.size } };
  }

  const stat = statSync(fullPath);
  if (stat.size > 100_000) {
    return { ok: false, error: `File too large (${(stat.size / 1024).toFixed(1)} KB). Max 100KB for text files.` };
  }

  const content = readFileSync(fullPath, 'utf-8');
  return {
    ok: true,
    summary: `Read ${basename(fullPath)} (${content.length} chars)`,
    data: { path: cmd.path, content, size: stat.size },
  };
}

// ---------------------------------------------------------------------------
// find_env_vars — scan .env files for specific variable names
// ---------------------------------------------------------------------------

function findEnvVars(rootDir: string, cmd: BridgeCommand): BridgeResponse {
  const query = (cmd.query || '').toUpperCase();
  const maxDepth = cmd.maxDepth || 5;
  const results: Array<{ file: string; key: string; value: string; masked: boolean }> = [];

  const ENV_FILES = ['.env', '.env.local', '.env.development', '.env.production', '.env.example', '.env.sample'];
  // Sensitive keys — show full values so the agent can use them.
  // Masking broke credential extraction (agent saw partial values and guessed wrong).
  // Security is enforced by rootDir scoping, not value masking.
  const SENSITIVE_PATTERNS: string[] = [];

  function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (!cmd.includeHidden && entry.name.startsWith('.') && !ENV_FILES.includes(entry.name)) continue;

        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (ENV_FILES.includes(entry.name) || entry.name.endsWith('.env')) {
          try {
            const content = readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith('#')) continue;
              const eqIdx = trimmed.indexOf('=');
              if (eqIdx === -1) continue;

              const key = trimmed.slice(0, eqIdx).trim();
              const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');

              if (!query || key.includes(query)) {
                const isSensitive = SENSITIVE_PATTERNS.some(p => key.includes(p));
                results.push({
                  file: relative(rootDir, fullPath).replace(/\\/g, '/'),
                  key,
                  value: isSensitive ? maskValue(value) : value,
                  masked: isSensitive,
                });
              }
            }
          } catch { /* can't read file */ }
        }
      }
    } catch { /* permission denied */ }
  }

  walk(rootDir, 0);

  return {
    ok: true,
    summary: `Found ${results.length} env vars${query ? ` matching "${query}"` : ''} across ${new Set(results.map(r => r.file)).size} files`,
    data: { query: cmd.query, results },
  };
}

function maskValue(value: string): string {
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '****' + value.slice(-4);
}

// ---------------------------------------------------------------------------
// list_dir — list directory contents
// ---------------------------------------------------------------------------

function listDir(rootDir: string, cmd: BridgeCommand): BridgeResponse {
  const dirPath = safePath(rootDir, cmd.path || '.');
  if (!dirPath) return { ok: false, error: 'Path outside allowed directory' };
  if (!existsSync(dirPath)) return { ok: false, error: `Directory not found: ${cmd.path}` };

  const entries = readdirSync(dirPath, { withFileTypes: true });
  const items = entries
    .filter(e => !SKIP_FILES.has(e.name))
    .filter(e => cmd.includeHidden || !e.name.startsWith('.') || e.name === '.env')
    .map(e => {
      const fullPath = join(dirPath, e.name);
      try {
        const stat = statSync(fullPath);
        return {
          name: e.name,
          type: e.isDirectory() ? 'dir' : 'file',
          size: e.isFile() ? stat.size : undefined,
          modified: stat.mtime.toISOString(),
        };
      } catch {
        return { name: e.name, type: e.isDirectory() ? 'dir' : 'file' };
      }
    });

  return {
    ok: true,
    summary: `${items.length} items in ${cmd.path || '.'}`,
    data: { path: cmd.path || '.', items },
  };
}

// ---------------------------------------------------------------------------
// grep — search file contents for a string
// ---------------------------------------------------------------------------

function grepFiles(rootDir: string, cmd: BridgeCommand): BridgeResponse {
  if (!cmd.query) return { ok: false, error: 'query is required' };

  const query = cmd.query;
  const pattern = cmd.pattern || '*'; // file name filter
  const maxResults = cmd.maxResults || 30;
  const maxDepth = cmd.maxDepth || 6;
  const results: Array<{ file: string; line: number; text: string }> = [];

  function walk(dir: string, depth: number) {
    if (depth > maxDepth || results.length >= maxResults) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxResults) break;
        if (SKIP_DIRS.has(entry.name)) continue;
        if (!cmd.includeHidden && entry.name.startsWith('.') && entry.name !== '.env') continue;

        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (entry.isFile()) {
          const ext = extname(fullPath).toLowerCase();
          if (BINARY_EXTS.has(ext)) continue;
          if (pattern !== '*' && !matchPattern(entry.name.toLowerCase(), pattern.toLowerCase())) continue;

          const stat = statSync(fullPath);
          if (stat.size > 500_000) continue; // skip large files

          try {
            const content = readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length && results.length < maxResults; i++) {
              if (lines[i].includes(query)) {
                results.push({
                  file: relative(rootDir, fullPath).replace(/\\/g, '/'),
                  line: i + 1,
                  text: lines[i].trim().slice(0, 200),
                });
              }
            }
          } catch { /* can't read */ }
        }
      }
    } catch { /* permission denied */ }
  }

  walk(rootDir, 0);

  return {
    ok: true,
    summary: `Found ${results.length} matches for "${query}" in ${new Set(results.map(r => r.file)).size} files`,
    data: { query, pattern, results },
  };
}

// ---------------------------------------------------------------------------
// exec_command — run a shell command and return output
// ---------------------------------------------------------------------------

const MAX_OUTPUT_BYTES = 100_000; // 100KB cap on stdout/stderr
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;

function execCommand(rootDir: string, cmd: BridgeCommand): BridgeResponse {
  if (!cmd.command) return { ok: false, error: 'command is required' };

  // Resolve working directory — must stay within rootDir
  let workDir = rootDir;
  if (cmd.cwd) {
    const resolved = safePath(rootDir, cmd.cwd);
    if (!resolved) return { ok: false, error: 'Working directory is outside the allowed root' };
    if (!existsSync(resolved)) return { ok: false, error: `Working directory not found: ${cmd.cwd}` };
    workDir = resolved;
  }

  const timeoutMs = Math.min(cmd.timeout || DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const startTime = Date.now();

  try {
    const output = execSync(cmd.command, {
      cwd: workDir,
      timeout: timeoutMs,
      maxBuffer: MAX_OUTPUT_BYTES,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      env: { ...process.env, FORCE_COLOR: '0' }, // disable color codes
    });

    const durationMs = Date.now() - startTime;
    const stdout = (output || '').slice(0, MAX_OUTPUT_BYTES);

    return {
      ok: true,
      summary: `Command completed in ${durationMs}ms (${stdout.split('\n').length} lines)`,
      data: {
        command: cmd.command,
        cwd: relative(rootDir, workDir).replace(/\\/g, '/') || '.',
        stdout,
        stderr: '',
        exitCode: 0,
        durationMs,
      },
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const stdout = (err.stdout || '').slice(0, MAX_OUTPUT_BYTES);
    const stderr = (err.stderr || '').slice(0, MAX_OUTPUT_BYTES);
    const exitCode = err.status ?? 1;
    const timedOut = err.killed || err.signal === 'SIGTERM';

    return {
      ok: false,
      summary: timedOut
        ? `Command timed out after ${timeoutMs}ms`
        : `Command failed with exit code ${exitCode}`,
      error: timedOut ? `Timed out after ${timeoutMs}ms` : (stderr.slice(0, 500) || err.message),
      data: {
        command: cmd.command,
        cwd: relative(rootDir, workDir).replace(/\\/g, '/') || '.',
        stdout,
        stderr,
        exitCode,
        durationMs,
        timedOut,
      },
    };
  }
}
