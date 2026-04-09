/**
 * Role-Based Access Control (RBAC) Constants
 *
 * Pure permission definitions, role templates, and helper functions.
 * Extracted from the former Mongoose Role model for use across the codebase.
 */

/**
 * Permission definitions - comprehensive list of all possible permissions
 * Follows the pattern: resource.action
 */
export const PERMISSIONS = {
  // Organization management
  'org.view': { description: 'View organization details', category: 'organization' },
  'org.update': { description: 'Update organization settings', category: 'organization' },
  'org.delete': { description: 'Delete organization', category: 'organization' },

  // Member management
  'member.view': { description: 'View organization members', category: 'members' },
  'member.invite': { description: 'Invite new members', category: 'members' },
  'member.remove': { description: 'Remove members', category: 'members' },
  'member.role.change': { description: 'Change member roles', category: 'members' },

  // Role management
  'role.view': { description: 'View roles and permissions', category: 'roles' },
  'role.create': { description: 'Create custom roles', category: 'roles' },
  'role.update': { description: 'Update custom roles', category: 'roles' },
  'role.delete': { description: 'Delete custom roles', category: 'roles' },
  'role.assign': { description: 'Assign roles to members', category: 'roles' },

  // Action management
  'action.view': { description: 'View actions', category: 'actions' },
  'action.create': { description: 'Create actions', category: 'actions' },
  'action.update': { description: 'Update actions', category: 'actions' },
  'action.delete': { description: 'Delete actions', category: 'actions' },
  'action.test': { description: 'Test actions', category: 'actions' },

  // Environment management
  'environment.view': { description: 'View environments', category: 'environments' },
  'environment.create': { description: 'Create environments', category: 'environments' },
  'environment.update': { description: 'Update environments', category: 'environments' },
  'environment.delete': { description: 'Delete environments', category: 'environments' },

  // Variable/Secret management
  'variable.view': { description: 'View variable metadata', category: 'variables' },
  'variable.create': { description: 'Create variables', category: 'variables' },
  'variable.update': { description: 'Update variable values', category: 'variables' },
  'variable.delete': { description: 'Delete variables', category: 'variables' },
  'variable.reveal': { description: 'Reveal secret values', category: 'variables' },

  // Connection management
  'connection.view': { description: 'View connections', category: 'connections' },
  'connection.create': { description: 'Create connections', category: 'connections' },
  'connection.update': { description: 'Update connections', category: 'connections' },
  'connection.delete': { description: 'Delete connections', category: 'connections' },
  'connection.apikey.set': { description: 'Set API keys', category: 'connections' },
  'connection.apikey.delete': { description: 'Delete API keys', category: 'connections' },

  // Action binding management
  'binding.view': { description: 'View action bindings', category: 'bindings' },
  'binding.create': { description: 'Create action bindings', category: 'bindings' },
  'binding.update': { description: 'Update action bindings', category: 'bindings' },
  'binding.delete': { description: 'Delete action bindings', category: 'bindings' },

  // Test management
  'test.view': { description: 'View tests', category: 'testing' },
  'test.create': { description: 'Create tests', category: 'testing' },
  'test.update': { description: 'Update tests', category: 'testing' },
  'test.delete': { description: 'Delete tests', category: 'testing' },

  // Suite management
  'suite.view': { description: 'View test suites', category: 'testing' },
  'suite.create': { description: 'Create test suites', category: 'testing' },
  'suite.update': { description: 'Update test suites', category: 'testing' },
  'suite.delete': { description: 'Delete test suites', category: 'testing' },

  // Setup management
  'setup.view': { description: 'View setups', category: 'testing' },
  'setup.create': { description: 'Create setups', category: 'testing' },
  'setup.update': { description: 'Update setups', category: 'testing' },
  'setup.delete': { description: 'Delete setups', category: 'testing' },

  // Test run management
  'run.view': { description: 'View test runs', category: 'testing' },
  'run.create': { description: 'Execute test runs', category: 'testing' },
  'run.cancel': { description: 'Cancel test runs', category: 'testing' },
  'run.export': { description: 'Export test results', category: 'testing' },

  // Persona management
  'persona.view': { description: 'View personas', category: 'testing' },
  'persona.create': { description: 'Create personas', category: 'testing' },
  'persona.update': { description: 'Update personas', category: 'testing' },
  'persona.delete': { description: 'Delete personas', category: 'testing' },

  // Assistant management
  'assistant.view': { description: 'View assistants', category: 'assistants' },
  'assistant.create': { description: 'Create assistants', category: 'assistants' },
  'assistant.update': { description: 'Update assistants', category: 'assistants' },
  'assistant.delete': { description: 'Delete assistants', category: 'assistants' },
  'assistant.chat': { description: 'Chat with assistants', category: 'assistants' },

  // Knowledge management
  'knowledge.view': { description: 'View knowledge articles', category: 'knowledge' },
  'knowledge.create': { description: 'Create knowledge articles', category: 'knowledge' },
  'knowledge.update': { description: 'Update knowledge articles', category: 'knowledge' },
  'knowledge.delete': { description: 'Delete knowledge articles', category: 'knowledge' },

  // Audit log access
  'audit.view': { description: 'View audit logs', category: 'audit' },
  'audit.export': { description: 'Export audit logs', category: 'audit' },
  'audit.view.full': { description: 'View full audit details including IP/user-agent', category: 'audit' },

  // Analytics
  'analytics.view': { description: 'View analytics dashboard', category: 'analytics' },
  'analytics.export': { description: 'Export analytics data', category: 'analytics' },

  // Billing
  'billing.view': { description: 'View billing information', category: 'billing' },
  'billing.manage': { description: 'Manage billing and subscriptions', category: 'billing' },

  // API keys
  'apikey.view': { description: 'View API keys', category: 'apikeys' },
  'apikey.create': { description: 'Create API keys', category: 'apikeys' },
  'apikey.revoke': { description: 'Revoke API keys', category: 'apikeys' },

  // AOS: Workspaces
  'workspace.view': { description: 'View workspaces', category: 'workspaces' },
  'workspace.create': { description: 'Create workspaces', category: 'workspaces' },
  'workspace.exec': { description: 'Execute commands in workspaces', category: 'workspaces' },
  'workspace.delete': { description: 'Delete workspaces', category: 'workspaces' },

  // AOS: Dynamic Tools
  'tool.view': { description: 'View dynamic tools', category: 'tools' },
  'tool.create': { description: 'Create dynamic tools', category: 'tools' },
  'tool.test': { description: 'Test dynamic tools', category: 'tools' },
  'tool.promote': { description: 'Promote tool scope (objective to org)', category: 'tools' },
  'tool.delete': { description: 'Delete dynamic tools', category: 'tools' },

  // AOS: Identities
  'identity.view': { description: 'View agent identities', category: 'identities' },
  'identity.create': { description: 'Create agent identities', category: 'identities' },
  'identity.update': { description: 'Update agent identities', category: 'identities' },
  'identity.suspend': { description: 'Suspend agent identities', category: 'identities' },

  // AOS: Credentials
  'credential.view': { description: 'View credential metadata', category: 'credentials' },
  'credential.create': { description: 'Store credentials', category: 'credentials' },
  'credential.rotate': { description: 'Rotate credentials', category: 'credentials' },
  'credential.delete': { description: 'Revoke credentials', category: 'credentials' },
  'credential.fulfill': { description: 'Fulfill credential requests from agent', category: 'credentials' },

  // AOS: Communication
  'communication.view': { description: 'View channels and messages', category: 'communication' },
  'communication.send': { description: 'Send messages via channels', category: 'communication' },
  'communication.configure': { description: 'Configure communication channels', category: 'communication' },

  // AOS: Scheduling
  'schedule.view': { description: 'View agent schedules', category: 'scheduling' },
  'schedule.create': { description: 'Create agent schedules', category: 'scheduling' },
  'schedule.modify': { description: 'Modify agent schedules', category: 'scheduling' },
} as const;

export type Permission = keyof typeof PERMISSIONS;

/**
 * Permission categories for grouping in UI
 */
export const PERMISSION_CATEGORIES = {
  organization: { label: 'Organization', description: 'Organization management' },
  members: { label: 'Members', description: 'Team member management' },
  roles: { label: 'Roles', description: 'Role and permission management' },
  actions: { label: 'Actions', description: 'API action management' },
  environments: { label: 'Environments', description: 'Environment configuration' },
  variables: { label: 'Variables', description: 'Secret and variable management' },
  connections: { label: 'Connections', description: 'Provider connection management' },
  bindings: { label: 'Bindings', description: 'Action binding management' },
  testing: { label: 'Testing', description: 'Test management and execution' },
  assistants: { label: 'Assistants', description: 'AI assistant management' },
  knowledge: { label: 'Knowledge', description: 'Knowledge base management' },
  audit: { label: 'Audit', description: 'Audit log access' },
  analytics: { label: 'Analytics', description: 'Analytics and reporting' },
  billing: { label: 'Billing', description: 'Billing and subscription management' },
  apikeys: { label: 'API Keys', description: 'API key management' },
  workspaces: { label: 'Workspaces', description: 'Agent code workspace management' },
  tools: { label: 'Dynamic Tools', description: 'Agent-created tool management' },
  identities: { label: 'Identities', description: 'Agent identity management' },
  credentials: { label: 'Credentials', description: 'Credential vault management' },
  communication: { label: 'Communication', description: 'Multi-channel communication' },
  scheduling: { label: 'Scheduling', description: 'Agent schedule management' },
} as const;

/**
 * Default role templates
 */
export const DEFAULT_ROLES = {
  owner: {
    name: 'Owner',
    description: 'Full access to all organization features',
    isSystem: true,
    permissions: Object.keys(PERMISSIONS) as Permission[],
  },
  admin: {
    name: 'Admin',
    description: 'Administrative access with some restrictions',
    isSystem: true,
    permissions: Object.keys(PERMISSIONS).filter(p =>
      !p.startsWith('org.delete') &&
      !p.startsWith('billing.manage') &&
      !p.startsWith('role.delete')
    ) as Permission[],
  },
  developer: {
    name: 'Developer',
    description: 'Access to development features',
    isSystem: true,
    permissions: [
      'org.view',
      'member.view',
      'action.view', 'action.create', 'action.update', 'action.delete', 'action.test',
      'environment.view', 'environment.create', 'environment.update',
      'variable.view', 'variable.create', 'variable.update',
      'connection.view', 'connection.create', 'connection.update',
      'binding.view', 'binding.create', 'binding.update', 'binding.delete',
      'test.view', 'test.create', 'test.update', 'test.delete',
      'suite.view', 'suite.create', 'suite.update', 'suite.delete',
      'setup.view', 'setup.create', 'setup.update', 'setup.delete',
      'run.view', 'run.create', 'run.export',
      'persona.view', 'persona.create', 'persona.update',
      'assistant.view', 'assistant.chat',
      'knowledge.view',
      'audit.view',
      'analytics.view',
    ] as Permission[],
  },
  tester: {
    name: 'Tester',
    description: 'Access to testing features',
    isSystem: true,
    permissions: [
      'org.view',
      'member.view',
      'action.view', 'action.test',
      'environment.view',
      'variable.view',
      'connection.view',
      'binding.view',
      'test.view', 'test.create', 'test.update',
      'suite.view', 'suite.create', 'suite.update',
      'setup.view',
      'run.view', 'run.create', 'run.export',
      'persona.view', 'persona.create', 'persona.update',
      'assistant.view', 'assistant.chat',
      'knowledge.view',
      'audit.view',
      'analytics.view',
    ] as Permission[],
  },
  viewer: {
    name: 'Viewer',
    description: 'Read-only access',
    isSystem: true,
    permissions: [
      'org.view',
      'member.view',
      'action.view',
      'environment.view',
      'variable.view',
      'connection.view',
      'binding.view',
      'test.view',
      'suite.view',
      'setup.view',
      'run.view',
      'persona.view',
      'assistant.view',
      'knowledge.view',
      'audit.view',
      'analytics.view',
    ] as Permission[],
  },
  compliance: {
    name: 'Compliance Officer',
    description: 'Access to audit and compliance features',
    isSystem: true,
    permissions: [
      'org.view',
      'member.view',
      'role.view',
      'audit.view', 'audit.export', 'audit.view.full',
      'analytics.view', 'analytics.export',
      'run.view', 'run.export',
    ] as Permission[],
  },
  member: {
    name: 'Member',
    description: 'Basic organization member',
    isSystem: true,
    permissions: [
      'org.view',
      'member.view',
      'action.view',
      'environment.view',
      'variable.view',
      'connection.view',
      'binding.view',
      'test.view',
      'suite.view',
      'setup.view',
      'run.view',
      'persona.view',
      'assistant.view', 'assistant.chat',
      'knowledge.view',
      'audit.view',
      'analytics.view',
    ] as Permission[],
  },
} as const;

export type DefaultRoleName = keyof typeof DEFAULT_ROLES;

/**
 * Helper function to get all permissions for a list of roles
 */
export function resolvePermissions(roles: any[]): Set<Permission> {
  const permissions = new Set<Permission>();
  const denied = new Set<string>();

  const sorted = [...roles].sort((a, b) => (a.priority || 0) - (b.priority || 0));

  for (const role of sorted) {
    if (role.inheritsFrom && DEFAULT_ROLES[role.inheritsFrom as DefaultRoleName]) {
      for (const perm of DEFAULT_ROLES[role.inheritsFrom as DefaultRoleName].permissions) {
        if (!denied.has(perm)) {
          permissions.add(perm);
        }
      }
    }

    for (const perm of role.permissions || []) {
      if (!denied.has(perm)) {
        permissions.add(perm as Permission);
      }
    }

    for (const perm of role.deniedPermissions || []) {
      denied.add(perm);
      permissions.delete(perm as Permission);
    }
  }

  return permissions;
}

/**
 * Check if a set of permissions includes a specific permission
 */
export function hasPermission(permissions: Set<Permission> | Permission[], permission: Permission): boolean {
  const permSet = permissions instanceof Set ? permissions : new Set(permissions);
  return permSet.has(permission);
}

/**
 * Check if a set of permissions includes any of the given permissions
 */
export function hasAnyPermission(permissions: Set<Permission> | Permission[], required: Permission[]): boolean {
  const permSet = permissions instanceof Set ? permissions : new Set(permissions);
  return required.some(p => permSet.has(p));
}

/**
 * Check if a set of permissions includes all of the given permissions
 */
export function hasAllPermissions(permissions: Set<Permission> | Permission[], required: Permission[]): boolean {
  const permSet = permissions instanceof Set ? permissions : new Set(permissions);
  return required.every(p => permSet.has(p));
}
