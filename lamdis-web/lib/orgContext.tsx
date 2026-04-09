"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface Org {
  orgId: string;
  role: 'owner' | 'admin' | 'member';
  org: {
    _id: string;
    name: string;
    slug?: string;
    auth0OrgId?: string;
    currentPlan?: string | null;
  };
}

/** Check whether the org has a given product active (non-null plan). */
export function orgHasProduct(org: Org | null, product: 'runs'): boolean {
  if (!org?.org) return false;
  return !!org.org.currentPlan;
}

interface OrgContextValue {
  orgs: Org[];
  currentOrg: Org | null;
  setCurrentOrgId: (orgId: string) => void;
  loading: boolean;
  refresh: () => Promise<void>;
}

const OrgContext = createContext<OrgContextValue | null>(null);

const STORAGE_KEY = 'lamdis_current_org_id';

export function OrgProvider({ children }: { children: ReactNode }) {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [currentOrgId, setCurrentOrgIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrgs = async () => {
    try {
      const res = await fetch('/api/me', { cache: 'no-store' });
      if (!res.ok) {
        setOrgs([]);
        return;
      }
      const data = await res.json();
      const isSelfHosted = process.env.NEXT_PUBLIC_LAMDIS_DEPLOYMENT_MODE === 'self_hosted';
      const validOrgs = (data.orgs || []).filter((o: Org) => o.orgId && (isSelfHosted || o.org?.auth0OrgId));
      setOrgs(validOrgs);
      
      // Restore saved org or default to first
      const savedOrgId = localStorage.getItem(STORAGE_KEY);
      if (savedOrgId && validOrgs.some((o: Org) => o.orgId === savedOrgId)) {
        setCurrentOrgIdState(savedOrgId);
        // Sync cookie on restore
        document.cookie = `lamdis_current_org=${savedOrgId}; path=/; max-age=31536000; SameSite=Lax`;
      } else if (validOrgs.length > 0) {
        const firstOrgId = validOrgs[0].orgId;
        setCurrentOrgIdState(firstOrgId);
        // Sync cookie on initial load
        document.cookie = `lamdis_current_org=${firstOrgId}; path=/; max-age=31536000; SameSite=Lax`;
      }
    } catch {
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, []);

  const setCurrentOrgId = (orgId: string) => {
    setCurrentOrgIdState(orgId);
    localStorage.setItem(STORAGE_KEY, orgId);
    // Also set cookie for server-side API routes
    document.cookie = `lamdis_current_org=${orgId}; path=/; max-age=31536000; SameSite=Lax`;
  };

  const currentOrg = orgs.find(o => o.orgId === currentOrgId) || null;

  return (
    <OrgContext.Provider value={{ orgs, currentOrg, setCurrentOrgId, loading, refresh: fetchOrgs }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}
