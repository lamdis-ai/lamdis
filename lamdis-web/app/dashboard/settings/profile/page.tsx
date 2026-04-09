"use client";
import { useEffect, useState } from 'react';
import Card from '@/components/base/Card';
import { useOrg } from '@/lib/orgContext';
import { FiUser, FiCheck, FiAlertCircle } from 'react-icons/fi';

type UserProfile = {
  _id: string;
  userSub: string;
  email?: string;
  displayName?: string;
  employeeUuid?: string;
  name: string;
};

export default function SettingsPage() {
  const { currentOrg, loading: orgLoading } = useOrg();
  
  // User Profile state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [employeeUuid, setEmployeeUuid] = useState('');
  

  async function loadProfile() {
    try {
      setProfileLoading(true);
      const r = await fetch('/api/user-profile');
      if (r.ok) {
        const data = await r.json();
        setProfile(data);
        setDisplayName(data.displayName || '');
        setEmployeeUuid(data.employeeUuid || '');
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setProfileLoading(false);
    }
  }

  async function saveProfile() {
    setProfileMessage(null);
    setProfileSaving(true);
    try {
      const r = await fetch('/api/user-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim() || null,
          employeeUuid: employeeUuid.trim() || null,
        }),
      });
      const data = await r.json();
      if (r.ok) {
        setProfile(data);
        setProfileMessage({ type: 'success', text: 'Profile updated successfully' });
      } else {
        setProfileMessage({ type: 'error', text: data.error || 'Failed to save profile' });
      }
    } catch (err) {
      setProfileMessage({ type: 'error', text: 'Failed to save profile' });
    } finally {
      setProfileSaving(false);
    }
  }

  useEffect(()=>{ 
    loadProfile();
  }, []);

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-semibold">Settings</h1>
      
      {/* User Profile Section */}
      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <FiUser className="text-lg text-slate-400" />
          <div className="text-sm font-medium">User Profile</div>
        </div>
        <div className="text-xs text-slate-400">
          Set your display name and employee UUID. This information is used in comments, audit logs, and compliance tracking.
        </div>
        
        {profileLoading ? (
          <div className="text-xs text-gray-500">Loading profile...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Display Name</label>
                <input 
                  value={displayName} 
                  onChange={e => setDisplayName(e.target.value)} 
                  placeholder="Your name for comments and audit" 
                  className="w-full border rounded px-3 py-2 bg-slate-950/50 dark:border-slate-600 text-sm"
                />
                <div className="text-[10px] text-slate-500 mt-1">
                  This name will appear in comments and audit logs instead of your email.
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Employee UUID</label>
                <input 
                  value={employeeUuid} 
                  onChange={e => setEmployeeUuid(e.target.value)} 
                  placeholder="e.g., EMP-12345" 
                  className="w-full border rounded px-3 py-2 font-mono bg-slate-950/50 dark:border-slate-600 text-sm"
                />
                <div className="text-[10px] text-slate-500 mt-1">
                  Unique identifier from your HRIS/HR system. Must be unique across all users.
                </div>
              </div>
            </div>
            
            {profile?.email && (
              <div className="text-xs text-slate-500">
                Email: <span className="font-mono">{profile.email}</span>
              </div>
            )}
            
            <div className="flex items-center gap-3">
              <button 
                onClick={saveProfile}
                disabled={profileSaving}
                className="px-3 py-2 rounded-md bg-gradient-to-r from-fuchsia-600 to-sky-600 text-white text-sm shadow hover:brightness-110 disabled:opacity-50"
              >
                {profileSaving ? 'Saving...' : 'Save Profile'}
              </button>
              
              {profileMessage && (
                <span className={`text-xs flex items-center gap-1 ${profileMessage.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>
                  {profileMessage.type === 'success' ? <FiCheck /> : <FiAlertCircle />}
                  {profileMessage.text}
                </span>
              )}
            </div>
          </div>
        )}
      </Card>

    </div>
  );
}