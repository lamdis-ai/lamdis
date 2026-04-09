"use client";
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Card from '@/components/base/Card';
import Button from '@/components/base/Button';
import Input from '@/components/base/Input';

/**
 * Join Organization Page
 * 
 * Handles the flow for users to join an organization via:
 * 1. Join code (entered manually or from URL)
 * 2. Creating a new organization
 * 
 * If user already has an org, redirects to dashboard.
 */
export default function JoinPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [mode, setMode] = useState<'choose' | 'join' | 'create'>('choose');
  const [code, setCode] = useState(searchParams?.get('code') || '');
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeInfo, setCodeInfo] = useState<{ orgName: string; auth0OrgId: string; invitationId: string } | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Check if user is logged in and if they already have an org
  useEffect(() => {
    (async () => {
      try {
        const me = await fetch('/api/me', { cache: 'no-store' }).then(r => r.json());
        
        if (!me?.user) {
          // Not logged in
          setIsLoggedIn(false);
          setCheckingAuth(false);
          return;
        }
        
        setIsLoggedIn(true);
        
        // Check if user already has an org
        if (me?.orgs?.length > 0) {
          router.push('/dashboard');
          return;
        }
        
        setCheckingAuth(false);
      } catch {
        setCheckingAuth(false);
      }
    })();
  }, [router]);

  // If code is in URL, automatically validate it
  useEffect(() => {
    if (code && code.length >= 4) {
      validateCode();
    }
  }, []);

  async function validateCode() {
    if (!code || code.length < 4) return;
    
    setError(null);
    setLoading(true);
    
    try {
      const res = await fetch(`/api/auth0-orgs/join/${encodeURIComponent(code.toUpperCase())}`);
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Invalid or expired join code');
        setCodeInfo(null);
        return;
      }
      
      setCodeInfo(data);
      setMode('join');
    } catch (e) {
      setError('Failed to validate code');
    } finally {
      setLoading(false);
    }
  }

  async function joinWithCode() {
    if (!codeInfo) return;
    
    setError(null);
    setLoading(true);
    
    if (!isLoggedIn) {
      // Need to log in first with org context
      const loginUrl = `/api/auth/login?organization=${codeInfo.auth0OrgId}&invitation=${codeInfo.invitationId}&screen_hint=signup&returnTo=/join?code=${code}`;
      window.location.href = loginUrl;
      return;
    }
    
    try {
      // Mark code as used and create local membership
      const res = await fetch(`/api/auth0-orgs/join/${encodeURIComponent(code.toUpperCase())}/use`, {
        method: 'POST',
      });
      
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to join organization');
        return;
      }
      
      // Success! Redirect to dashboard
      router.push('/dashboard');
    } catch (e) {
      setError('Failed to join organization');
    } finally {
      setLoading(false);
    }
  }

  async function createOrg() {
    if (!orgName.trim()) {
      setError('Please enter an organization name');
      return;
    }
    
    if (!isLoggedIn) {
      // Need to log in first
      window.location.href = `/api/auth/login?returnTo=/join?create=1&name=${encodeURIComponent(orgName)}`;
      return;
    }
    
    setError(null);
    setLoading(true);
    
    try {
      const res = await fetch('/api/auth0-orgs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName.trim() }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Failed to create organization');
        return;
      }
      
      // Success! Redirect to dashboard
      router.push('/dashboard');
    } catch (e) {
      setError('Failed to create organization');
    } finally {
      setLoading(false);
    }
  }

  // Handle returning from login with create=1 in URL
  useEffect(() => {
    const createParam = searchParams?.get('create');
    const nameParam = searchParams?.get('name');
    if (createParam === '1' && nameParam && isLoggedIn) {
      setOrgName(nameParam);
      setMode('create');
    }
  }, [searchParams, isLoggedIn]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Welcome to Lamdis</h1>
          <p className="text-slate-400">
            {mode === 'choose' && 'Join an existing organization or create your own'}
            {mode === 'join' && codeInfo && `You're joining ${codeInfo.orgName}`}
            {mode === 'create' && 'Create your organization'}
          </p>
        </div>
        
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-800/50 rounded-md text-red-300 text-sm">
            {error}
          </div>
        )}
        
        {mode === 'choose' && (
          <div className="space-y-4">
            {/* Join with code */}
            <Card className="p-5 space-y-4">
              <div>
                <h2 className="text-lg font-medium text-white mb-1">Have an invite code?</h2>
                <p className="text-sm text-slate-400">Enter the code shared by your team admin</p>
              </div>
              <div className="flex gap-2">
                <Input
                  className="flex-1 uppercase font-mono"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  maxLength={10}
                />
                <Button onClick={validateCode} disabled={loading || code.length < 4}>
                  {loading ? 'Checking...' : 'Join'}
                </Button>
              </div>
            </Card>
            
            {/* Create new org */}
            <Card className="p-5 space-y-4">
              <div>
                <h2 className="text-lg font-medium text-white mb-1">Create a new organization</h2>
                <p className="text-sm text-slate-400">Start fresh with your own team</p>
              </div>
              <Button variant="outline" onClick={() => setMode('create')} className="w-full">
                Create Organization
              </Button>
            </Card>
            
            {isLoggedIn ? (
              <div className="text-center text-sm text-slate-500">
                <a href="/api/auth/logout" className="text-slate-400 hover:text-slate-300">
                  Logout
                </a>
              </div>
            ) : (
              <div className="text-center text-sm text-slate-500">
                Already have an account?{' '}
                <a href="/api/auth/login" className="text-sky-400 hover:text-sky-300">
                  Sign in
                </a>
              </div>
            )}
          </div>
        )}
        
        {mode === 'join' && codeInfo && (
          <Card className="p-5 space-y-4">
            <div className="text-center">
              <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🏢</span>
              </div>
              <h2 className="text-xl font-medium text-white mb-1">{codeInfo.orgName}</h2>
              <p className="text-sm text-slate-400">You've been invited to join this organization</p>
            </div>
            
            <Button onClick={joinWithCode} disabled={loading} className="w-full">
              {loading ? 'Joining...' : isLoggedIn ? 'Join Organization' : 'Sign in & Join'}
            </Button>
            
            <button
              onClick={() => { setMode('choose'); setCodeInfo(null); setCode(''); }}
              className="w-full text-sm text-slate-400 hover:text-slate-300"
            >
              Use a different code
            </button>
            {isLoggedIn && (
              <a href="/api/auth/logout" className="block w-full text-center text-sm text-slate-500 hover:text-slate-300">
                Logout
              </a>
            )}
          </Card>
        )}
        
        {mode === 'create' && (
          <Card className="p-5 space-y-4">
            <div>
              <h2 className="text-lg font-medium text-white mb-1">Name your organization</h2>
              <p className="text-sm text-slate-400">You can change this later in settings</p>
            </div>
            
            <Input
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              placeholder="Acme Inc."
              maxLength={100}
            />
            
            <Button onClick={createOrg} disabled={loading || !orgName.trim()} className="w-full">
              {loading ? 'Creating...' : isLoggedIn ? 'Create Organization' : 'Sign in & Create'}
            </Button>
            
            <button
              onClick={() => setMode('choose')}
              className="w-full text-sm text-slate-400 hover:text-slate-300"
            >
              Back
            </button>
            {isLoggedIn && (
              <a href="/api/auth/logout" className="block w-full text-center text-sm text-slate-500 hover:text-slate-300">
                Logout
              </a>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
