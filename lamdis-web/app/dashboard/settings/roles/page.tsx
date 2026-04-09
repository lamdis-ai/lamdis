"use client";

import { useState, useEffect, useCallback } from 'react';
import { useOrg } from '@/lib/orgContext';
import { FiPlus, FiEdit2, FiTrash2, FiShield, FiCheck, FiX, FiUsers, FiChevronDown, FiChevronRight, FiInfo } from 'react-icons/fi';
import { Input } from '@/components/base/Input';
import { Textarea } from '@/components/base/Textarea';

interface Permission {
  key: string;
  description: string;
  category: string;
}

interface Category {
  key: string;
  label: string;
  description: string;
  permissions: { permission: string; description: string }[];
}

interface Role {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isSystem: boolean;
  permissions: string[];
  deniedPermissions?: string[];
  inheritsFrom?: string;
  createdAt: string;
  updatedAt?: string;
}

export default function RolesPage() {
  const { currentOrg } = useOrg();
  const [roles, setRoles] = useState<Role[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  
  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPermissions, setFormPermissions] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    if (!currentOrg?.orgId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Fetch roles and permissions in parallel
      const [rolesRes, permsRes] = await Promise.all([
        fetch(`/api/orgs/roles`, {
          headers: { 'x-org-id': currentOrg.orgId },
        }),
        fetch(`/api/orgs/permissions`, {
          headers: { 'x-org-id': currentOrg.orgId },
        }),
      ]);
      
      if (!rolesRes.ok || !permsRes.ok) {
        throw new Error('Failed to fetch data');
      }
      
      const [rolesData, permsData] = await Promise.all([
        rolesRes.json(),
        permsRes.json(),
      ]);
      
      setRoles(rolesData.roles || []);
      setCategories(permsData.categories || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [currentOrg?.orgId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreateModal = () => {
    setEditingRole(null);
    setFormName('');
    setFormDescription('');
    setFormPermissions(new Set());
    setShowCreateModal(true);
  };

  const openEditModal = (role: Role) => {
    setEditingRole(role);
    setFormName(role.name);
    setFormDescription(role.description || '');
    setFormPermissions(new Set(role.permissions || []));
    setShowCreateModal(true);
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setEditingRole(null);
  };

  const togglePermission = (perm: string) => {
    const newPerms = new Set(formPermissions);
    if (newPerms.has(perm)) {
      newPerms.delete(perm);
    } else {
      newPerms.add(perm);
    }
    setFormPermissions(newPerms);
  };

  const toggleCategory = (cat: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(cat)) {
      newExpanded.delete(cat);
    } else {
      newExpanded.add(cat);
    }
    setExpandedCategories(newExpanded);
  };

  const handleSaveRole = async () => {
    if (!currentOrg?.orgId || !formName) return;
    
    try {
      const url = editingRole
        ? `/api/orgs/roles/${editingRole.id}`
        : `/api/orgs/roles`;
      
      const method = editingRole ? 'PATCH' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': currentOrg.orgId,
        },
        body: JSON.stringify({
          name: formName,
          description: formDescription,
          permissions: Array.from(formPermissions),
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save role');
      }
      
      await fetchData();
      closeModal();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDeleteRole = async (role: Role) => {
    if (!currentOrg?.orgId) return;
    if (role.isSystem) {
      setError('Cannot delete system roles');
      return;
    }
    
    if (!confirm(`Are you sure you want to delete the "${role.name}" role?`)) {
      return;
    }
    
    try {
      const res = await fetch(`/api/orgs/roles/${role.id}`, {
        method: 'DELETE',
        headers: { 'x-org-id': currentOrg.orgId },
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete role');
      }
      
      await fetchData();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Roles & Permissions</h1>
            <p className="text-slate-400 mt-1">Manage access control for your organization</p>
          </div>
          
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 transition"
          >
            <FiPlus />
            Create Role
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-900/30 border border-red-500/30 text-red-300 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}><FiX /></button>
          </div>
        )}

        {/* Info Box */}
        <div className="mb-6 p-4 rounded-xl bg-blue-900/20 border border-blue-500/30 text-blue-300 flex items-start gap-3">
          <FiInfo className="mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium mb-1">About Roles & Permissions</p>
            <p className="text-blue-200/70">
              Roles define what users can do within your organization. System roles (Owner, Admin, Developer, etc.) cannot be modified. 
              Create custom roles to grant specific permissions for compliance, security, or operational needs.
            </p>
          </div>
        </div>

        {/* Loading */}
        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading roles...</div>
        ) : (
          /* Roles Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((role) => (
              <div
                key={role.id}
                className="rounded-xl bg-slate-900 border border-slate-800 p-4 hover:border-slate-700 transition"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${role.isSystem ? 'bg-fuchsia-500/20' : 'bg-slate-800'}`}>
                      <FiShield className={role.isSystem ? 'text-fuchsia-300' : 'text-slate-400'} />
                    </div>
                    <div>
                      <h3 className="font-medium">{role.name}</h3>
                      {role.isSystem && (
                        <span className="text-xs text-fuchsia-300">System Role</span>
                      )}
                    </div>
                  </div>
                  
                  {!role.isSystem && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(role)}
                        className="p-2 rounded-lg hover:bg-slate-800 transition"
                      >
                        <FiEdit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteRole(role)}
                        className="p-2 rounded-lg hover:bg-slate-800 text-red-400 transition"
                      >
                        <FiTrash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
                
                {role.description && (
                  <p className="text-sm text-slate-400 mb-3">{role.description}</p>
                )}
                
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <FiUsers />
                  <span>{role.permissions?.length || 0} permissions</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create/Edit Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {editingRole ? 'Edit Role' : 'Create Role'}
                </h2>
                <button onClick={closeModal} className="p-2 hover:bg-slate-800 rounded-lg">
                  <FiX />
                </button>
              </div>
              
              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* Basic Info */}
                <div className="mb-6 space-y-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Role Name</label>
                    <Input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g., QA Engineer"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Description</label>
                    <Textarea
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      placeholder="Describe what this role can do..."
                      rows={2}
                      className="resize-none"
                    />
                  </div>
                </div>
                
                {/* Permissions */}
                <div>
                  <h3 className="text-sm font-medium mb-3">Permissions</h3>
                  <div className="space-y-2">
                    {categories.map((cat) => {
                      const expanded = expandedCategories.has(cat.key);
                      const selectedCount = cat.permissions.filter(p => formPermissions.has(p.permission)).length;
                      
                      return (
                        <div key={cat.key} className="border border-slate-700 rounded-lg overflow-hidden">
                          <button
                            onClick={() => toggleCategory(cat.key)}
                            className="w-full px-4 py-3 flex items-center justify-between bg-slate-800/50 hover:bg-slate-800 transition"
                          >
                            <div className="flex items-center gap-3">
                              {expanded ? <FiChevronDown /> : <FiChevronRight />}
                              <span className="font-medium">{cat.label}</span>
                              {selectedCount > 0 && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-500/20 text-fuchsia-300">
                                  {selectedCount}/{cat.permissions.length}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-slate-500">{cat.description}</span>
                          </button>
                          
                          {expanded && (
                            <div className="p-3 space-y-1">
                              {cat.permissions.map((perm) => {
                                const checked = formPermissions.has(perm.permission);
                                return (
                                  <label
                                    key={perm.permission}
                                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/50 cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => togglePermission(perm.permission)}
                                      className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-fuchsia-500 focus:ring-fuchsia-500"
                                    />
                                    <div className="flex-1">
                                      <span className="text-sm font-mono">{perm.permission}</span>
                                      <span className="text-xs text-slate-500 ml-2">{perm.description}</span>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              
              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-end gap-3">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRole}
                  disabled={!formName || formPermissions.size === 0}
                  className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {editingRole ? 'Save Changes' : 'Create Role'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
