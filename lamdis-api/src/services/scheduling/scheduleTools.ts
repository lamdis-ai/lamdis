/**
 * Schedule Agent Tools
 *
 * Tools that let the agent control its own check frequency.
 */

import type { AgentTool, AgentToolResult } from '../automation/agentTools.js';
import * as scheduler from './agentSchedulerService.js';

let _schedContext: { orgId: string; instanceId: string } | null = null;

export function setScheduleContext(orgId: string, instanceId: string) {
  _schedContext = { orgId, instanceId };
}

const setScheduleTool: AgentTool = {
  name: 'set_schedule',
  description: 'Set how often you check in on this objective. Use "adaptive" for automatic frequency adjustment, "cron" for fixed schedules (e.g., "0 9 * * 1" = every Monday 9am), or "polling" for a fixed interval.',
  inputSchema: {
    type: 'object',
    properties: {
      type: { type: 'string', description: '"polling" | "cron" | "adaptive"' },
      intervalMs: { type: 'number', description: 'Check interval in ms (for polling/adaptive base)' },
      cronExpression: { type: 'string', description: 'Cron expression (for cron type)' },
      minIntervalMs: { type: 'number', description: 'Minimum interval for adaptive mode (default 10000)' },
      maxIntervalMs: { type: 'number', description: 'Maximum interval for adaptive mode (default 3600000)' },
    },
    required: ['type'],
  },
  async execute(input): Promise<AgentToolResult> {
    if (!_schedContext) return { ok: false, error: 'No schedule context' };
    try {
      const schedType = input.type as string;
      const schedule = await scheduler.setSchedule(_schedContext.orgId, _schedContext.instanceId, {
        scheduleType: schedType,
        intervalMs: input.intervalMs as number || 30000,
        cronExpression: input.cronExpression as string,
        adaptiveConfig: schedType === 'adaptive' ? {
          baseIntervalMs: (input.intervalMs as number) || 30000,
          minIntervalMs: (input.minIntervalMs as number) || 10000,
          maxIntervalMs: (input.maxIntervalMs as number) || 3600000,
        } : undefined,
      });
      return { ok: true, result: { scheduleId: schedule.id, type: schedType, intervalMs: schedule.intervalMs } };
    } catch (err: any) {
      return { ok: false, error: err?.message };
    }
  },
};

const getScheduleTool: AgentTool = {
  name: 'get_schedule',
  description: 'View the current check-in schedule for this objective.',
  inputSchema: { type: 'object', properties: {}, required: [] },
  async execute(): Promise<AgentToolResult> {
    if (!_schedContext) return { ok: false, error: 'No schedule context' };
    try {
      const schedule = await scheduler.getSchedule(_schedContext.orgId, _schedContext.instanceId);
      if (!schedule) return { ok: true, result: { hasSchedule: false, message: 'Using default 30s polling' } };
      return { ok: true, result: { ...schedule } };
    } catch (err: any) {
      return { ok: false, error: err?.message };
    }
  },
};

export function getScheduleTools(): AgentTool[] {
  return [setScheduleTool, getScheduleTool];
}
