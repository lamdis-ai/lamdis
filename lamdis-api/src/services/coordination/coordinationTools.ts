/**
 * Coordination Agent Tools
 *
 * Tools for cross-objective coordination: create sub-objectives,
 * read/write shared context, check related status.
 */

import type { AgentTool, AgentToolResult } from '../automation/agentTools.js';
import * as coordination from './crossObjectiveService.js';

let _coordContext: { orgId: string; instanceId: string } | null = null;

export function setCoordinationContext(orgId: string, instanceId: string) {
  _coordContext = { orgId, instanceId };
}

const createSubObjectiveTool: AgentTool = {
  name: 'create_sub_objective',
  description: 'Create a sub-objective linked to the current objective. The sub-objective gets its own agent and task plan.',
  inputSchema: {
    type: 'object',
    properties: {
      goal: { type: 'string', description: 'Goal description for the sub-objective' },
      guidelines: { type: 'object', description: 'Guidelines/constraints for the sub-objective' },
    },
    required: ['goal'],
  },
  async execute(input): Promise<AgentToolResult> {
    if (!_coordContext) return { ok: false, error: 'No coordination context' };
    try {
      const child = await coordination.createSubObjective(_coordContext.orgId, _coordContext.instanceId, {
        goalDescription: input.goal as string,
        guidelines: input.guidelines as Record<string, unknown>,
        agentEnabled: true,
      });
      return { ok: true, result: { subObjectiveId: child.id, status: child.status } };
    } catch (err: any) {
      return { ok: false, error: err?.message };
    }
  },
};

const readSharedContextTool: AgentTool = {
  name: 'read_shared_context',
  description: 'Read shared data from a related objective. Use to coordinate with parent/child/peer objectives.',
  inputSchema: {
    type: 'object',
    properties: {
      targetInstanceId: { type: 'string', description: 'ID of the related objective to read from' },
      key: { type: 'string', description: 'Specific context key to read (omit to read all)' },
    },
    required: ['targetInstanceId'],
  },
  async execute(input): Promise<AgentToolResult> {
    if (!_coordContext) return { ok: false, error: 'No coordination context' };
    try {
      const data = await coordination.readSharedContext(
        _coordContext.orgId, input.targetInstanceId as string, input.key as string | undefined,
      );
      return { ok: true, result: data };
    } catch (err: any) {
      return { ok: false, error: err?.message };
    }
  },
};

const writeSharedContextTool: AgentTool = {
  name: 'write_shared_context',
  description: 'Write data to a related objective\'s shared context. Only works for objectives you\'re related to.',
  inputSchema: {
    type: 'object',
    properties: {
      targetInstanceId: { type: 'string', description: 'ID of the related objective to write to' },
      key: { type: 'string', description: 'Context key' },
      value: { type: 'object', description: 'Value to store' },
    },
    required: ['targetInstanceId', 'key', 'value'],
  },
  async execute(input): Promise<AgentToolResult> {
    if (!_coordContext) return { ok: false, error: 'No coordination context' };
    try {
      await coordination.writeSharedContext(
        _coordContext.orgId, _coordContext.instanceId, input.targetInstanceId as string,
        input.key as string, input.value,
      );
      return { ok: true, result: { written: input.key } };
    } catch (err: any) {
      return { ok: false, error: err?.message };
    }
  },
};

const getRelatedStatusTool: AgentTool = {
  name: 'get_related_status',
  description: 'Get status of all related objectives (parent, children, peers).',
  inputSchema: { type: 'object', properties: {}, required: [] },
  async execute(): Promise<AgentToolResult> {
    if (!_coordContext) return { ok: false, error: 'No coordination context' };
    try {
      const statuses = await coordination.getRelatedStatus(_coordContext.orgId, _coordContext.instanceId);
      return { ok: true, result: { relatedObjectives: statuses } };
    } catch (err: any) {
      return { ok: false, error: err?.message };
    }
  },
};

export function getCoordinationTools(): AgentTool[] {
  return [createSubObjectiveTool, readSharedContextTool, writeSharedContextTool, getRelatedStatusTool];
}
