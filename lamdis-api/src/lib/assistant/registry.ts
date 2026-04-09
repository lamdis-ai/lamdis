import { builderAssistant } from './builder.js';
import { lamdisAssistant } from './lamdis.js';
import { lamdisReadOnlyAssistant } from './lamdis-readonly.js';
import { AssistantRegistry, AssistantInvocation, AssistantModuleResult } from './types.js';

/**
 * Central registry of assistant modules.
 * Adding a new assistant is a *data change* (append to this object) – no
 * router edits required. The HTTP endpoint selects the module by key.
 */

export const assistantRegistry: AssistantRegistry = {
  [builderAssistant.id]: builderAssistant,
  [lamdisAssistant.id]: lamdisAssistant,
  [lamdisReadOnlyAssistant.id]: lamdisReadOnlyAssistant,
  // lamdis-readonly: Secure read-only assistant (no write/update/delete capabilities)
  // future: integration, analytics, support, etc.
};

/**
 * Check if an assistant module is read-only (no write capabilities)
 */
export function isReadOnlyAssistant(id?: string): boolean {
  return id === 'lamdis-readonly';
}

/** Resolve a module by id (fallback to default 'lamdis-readonly' for security). */
export function getAssistant(id?: string) {
  if (id && assistantRegistry[id]) return assistantRegistry[id];
  // Default to read-only for security
  return assistantRegistry['lamdis-readonly'];
}

/**
 * Invoke an assistant module with the given invocation params.
 * This is a convenience function that combines getAssistant + run.
 */
export async function invokeAssistant(params: {
  orgId: string;
  moduleId?: string;
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<AssistantModuleResult> {
  const assistant = getAssistant(params.moduleId);
  const invocation: AssistantInvocation = {
    orgId: params.orgId,
    message: params.message,
    history: params.history || [],
  };
  return assistant.run(invocation);
}
