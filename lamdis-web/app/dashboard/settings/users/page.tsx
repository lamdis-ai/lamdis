"use client";

import { useState, useEffect, useCallback } from 'react';
import { useOrg } from '@/lib/orgContext';
import Card from '@/components/base/Card';

const isSelfHosted = process.env.NEXT_PUBLIC_LAMDIS_DEPLOYMENT_MODE === 'self_hosted';
import Badge from '@/components/base/Badge';
import { Input } from '@/components/base/Input';
import { 
  FiUsers, FiPlus, FiTrash2, FiMail, FiShield, FiCheck, FiX, 
  FiAlertTriangle, FiInfo, FiToggleLeft, FiToggleRight, FiCreditCard
} from 'react-icons/fi';
import { getTotalSeats } from '@/lib/pricing';

interface Member {
  _id: string;
  email?: string;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'invited';
  licensed: boolean;
  licensedAt?: string;
  licensedBy?: string;
  invitedAt?: string;
  acceptedAt?: string;
  createdAt: string;
}

interface OrgDetails {
  seats?: number;
  currentPlan?: string;
  embodiedPlan?: string;
}

export default function UsersPage() {
  const { currentOrg } = useOrg();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [inviting, setInviting] = useState(false);
  
  // Org details for seat limits
  const [orgDetails, setOrgDetails] = useState<OrgDetails | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!currentOrg?.orgId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch('/api/orgs/members', {
        headers: { 'x-org-id': currentOrg.orgId },
      });
      
      if (!res.ok) {
        throw new Error('Failed to fetch members');
      }
      
      const data = await res.json();
      setMembers(data.members || []);
      
      // Also extract org details from context
      const org = currentOrg.org as any;
      setOrgDetails({
        seats: org?.seats,
        currentPlan: org?.currentPlan,
        embodiedPlan: org?.embodiedPlan,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [currentOrg?.orgId, currentOrg?.org]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Calculate seat usage
  const licensedCount = members.filter(m => m.licensed && m.status === 'active').length;
  const runsPlan = orgDetails?.currentPlan || 'starter';
  const embodiedPlan = orgDetails?.embodiedPlan || null;
  const seatLimit = orgDetails?.seats ?? getTotalSeats(runsPlan);
  const isUnlimited = seatLimit === Infinity;
  const seatsRemaining = isUnlimited ? Infinity : (seatLimit - licensedCount);
  const atLimit = !isUnlimited && licensedCount >= seatLimit;

  const handleInvite = async () => {
    if (!currentOrg?.orgId || !inviteEmail) return;
    
    // Check seat limit before inviting
    if (atLimit) {
      setError('Seat limit reached. Upgrade your plan or remove licenses from existing users.');
      return;
    }
    
    setInviting(true);
    setError(null);
    
    try {
      const res = await fetch('/api/orgs/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': currentOrg.orgId,
        },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          licensed: true, // New invites are licensed by default
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to invite member');
      }
      
      setSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      setShowInviteModal(false);
      await fetchMembers();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setInviting(false);
    }
  };

  const handleToggleLicense = async (member: Member) => {
    if (!currentOrg?.orgId) return;
    
    // Check if enabling license would exceed limit
    if (!member.licensed && atLimit) {
      setError('Seat limit reached. Upgrade your plan to license more users.');
      return;
    }
    
    setError(null);
    
    try {
      const res = await fetch(`/api/orgs/members/${member._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': currentOrg.orgId,
        },
        body: JSON.stringify({
          licensed: !member.licensed,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update license');
      }
      
      setSuccess(member.licensed ? 'License removed' : 'License granted');
      await fetchMembers();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleUpdateRole = async (member: Member, newRole: 'owner' | 'admin' | 'member') => {
    if (!currentOrg?.orgId) return;
    
    setError(null);
    
    try {
      const res = await fetch(`/api/orgs/members/${member._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': currentOrg.orgId,
        },
        body: JSON.stringify({ role: newRole }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update role');
      }
      
      setSuccess('Role updated');
      await fetchMembers();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleRemoveMember = async (member: Member) => {
    if (!currentOrg?.orgId) return;
    
    if (member.role === 'owner') {
      setError('Cannot remove the organization owner');
      return;
    }
    
    if (!confirm(`Remove ${member.email || 'this member'} from the organization?`)) {
      return;
    }
    
    setError(null);
    
    try {
      const res = await fetch(`/api/orgs/members/${member._id}`, {
        method: 'DELETE',
        headers: { 'x-org-id': currentOrg.orgId },
      });
      
      if (!res.ok && res.status !== 204) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove member');
      }
      
      setSuccess('Member removed');
      await fetchMembers();
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Clear messages after delay
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(t);
    }
  }, [success]);

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'owner': return 'primary';
      case 'admin': return 'warning';
      default: return 'default';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FiUsers className="text-fuchsia-400" />
              Users & Licenses
            </h1>
            <p className="text-slate-400 mt-1">Manage team members and license allocation</p>
          </div>
          
          <button
            onClick={() => setShowInviteModal(true)}
            disabled={atLimit}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <FiPlus />
            Invite User
          </button>
        </div>

        {/* License Summary Card */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-fuchsia-600/20 to-sky-600/20">
                <FiCreditCard className="text-2xl text-fuchsia-300" />
              </div>
              <div>
                <div className="text-sm text-slate-400">Licensed Seats</div>
                <div className="text-2xl font-bold">
                  {licensedCount} {isUnlimited ? '' : `/ ${seatLimit}`}
                </div>
                {!isUnlimited && (
                  <div className="text-xs text-slate-500 mt-1">
                    {seatsRemaining > 0 ? `${seatsRemaining} seats available` : 'No seats available'}
                  </div>
                )}
              </div>
            </div>
            
            <div className="text-right">
              <div className="text-sm text-slate-400">Plans</div>
              <div className="text-lg font-medium capitalize">
                {runsPlan.replace('_', ' ')}
                {embodiedPlan && ` + ${embodiedPlan.replace('embodied_', '').replace('_', ' ')}`}
              </div>
              {atLimit && (
                isSelfHosted ? (
                  <a href="mailto:sales@lamdis.ai?subject=License%20Upgrade" className="text-xs text-fuchsia-400 hover:underline">
                    Contact sales for more seats →
                  </a>
                ) : (
                  <a href="/dashboard/settings/billing" className="text-xs text-fuchsia-400 hover:underline">
                    Upgrade for more seats →
                  </a>
                )
              )}
            </div>
          </div>
          
          {/* Progress bar */}
          {!isUnlimited && (
            <div className="mt-4">
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all ${atLimit ? 'bg-red-500' : 'bg-gradient-to-r from-fuchsia-500 to-sky-500'}`}
                  style={{ width: `${Math.min((licensedCount / seatLimit) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}
        </Card>

        {/* Info Box */}
        <div className="p-4 rounded-xl bg-blue-900/20 border border-blue-500/30 text-blue-300 flex items-start gap-3">
          <FiInfo className="mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium mb-1">About Licenses</p>
            <p className="text-blue-200/70">
              {isSelfHosted
                ? 'Licensed users count against your license seat limit. Toggle licenses off for inactive users to stay within your limits. Unlicensed users cannot access the dashboard.'
                : 'Only licensed users count against your Auth0 MAU quota. Toggle licenses off for inactive users to reduce costs while keeping their account for future access. Unlicensed users cannot access the dashboard.'}
            </p>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="p-4 rounded-xl bg-red-900/30 border border-red-500/30 text-red-300 flex items-center justify-between">
            <span className="flex items-center gap-2"><FiAlertTriangle />{error}</span>
            <button onClick={() => setError(null)}><FiX /></button>
          </div>
        )}
        
        {success && (
          <div className="p-4 rounded-xl bg-green-900/30 border border-green-500/30 text-green-300 flex items-center gap-2">
            <FiCheck />{success}
          </div>
        )}

        {/* Members Table */}
        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading members...</div>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr className="text-left text-xs text-slate-400 uppercase tracking-wider">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Licensed</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No members yet. Invite someone to get started.
                    </td>
                  </tr>
                ) : (
                  members.map((member) => (
                    <tr key={member._id} className="hover:bg-slate-800/30 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-fuchsia-500 to-sky-500 flex items-center justify-center text-white text-sm font-medium">
                            {member.email?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div>
                            <div className="font-medium">{member.email || 'Unknown'}</div>
                            <div className="text-xs text-slate-500">
                              Joined {new Date(member.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {member.role === 'owner' ? (
                          <Badge variant="info" className="flex items-center gap-1 w-fit">
                            <FiShield size={12} />Owner
                          </Badge>
                        ) : (
                          <select
                            value={member.role}
                            onChange={(e) => handleUpdateRole(member, e.target.value as any)}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
                          >
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {member.status === 'invited' ? (
                          <Badge variant="warning" className="flex items-center gap-1 w-fit">
                            <FiMail size={12} />Invited
                          </Badge>
                        ) : (
                          <Badge variant="success" className="flex items-center gap-1 w-fit">
                            <FiCheck size={12} />Active
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleLicense(member)}
                          disabled={member.role === 'owner'}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition ${
                            member.licensed 
                              ? 'bg-green-900/30 text-green-300 hover:bg-green-900/50' 
                              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                          } ${member.role === 'owner' ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title={member.role === 'owner' ? 'Owner is always licensed' : (member.licensed ? 'Click to remove license' : 'Click to grant license')}
                        >
                          {member.licensed ? (
                            <><FiToggleRight size={18} /> Licensed</>
                          ) : (
                            <><FiToggleLeft size={18} /> Unlicensed</>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {member.role !== 'owner' && (
                          <button
                            onClick={() => handleRemoveMember(member)}
                            className="p-2 rounded-lg hover:bg-red-900/30 text-red-400 transition"
                            title="Remove member"
                          >
                            <FiTrash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        )}

        {/* Invite Modal */}
        {showInviteModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full">
              <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Invite User</h2>
                <button onClick={() => setShowInviteModal(false)} className="p-2 hover:bg-slate-800 rounded-lg">
                  <FiX />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                {atLimit && (
                  <div className="p-3 rounded-lg bg-amber-900/30 border border-amber-500/30 text-amber-300 text-sm flex items-start gap-2">
                    <FiAlertTriangle className="mt-0.5 flex-shrink-0" />
                    <div>
                      Seat limit reached. <a href="/dashboard/settings/billing" className="underline">Upgrade your plan</a> to invite more users.
                    </div>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Email Address</label>
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    disabled={atLimit}
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    disabled={atLimit}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                  >
                    <option value="member">Member - Standard access</option>
                    <option value="admin">Admin - Full management access</option>
                  </select>
                </div>
                
                <div className="text-xs text-slate-500">
                  The invited user will receive an email to join your organization. 
                  They will be assigned a license automatically.
                </div>
              </div>
              
              <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleInvite}
                  disabled={!inviteEmail || inviting || atLimit}
                  className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {inviting ? 'Sending...' : 'Send Invite'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}