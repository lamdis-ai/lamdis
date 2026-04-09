"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { setGlobalAuthErrorCallback } from './authFetch';

interface AuthContextType {
  /** Whether the user is currently in an unauthorized state (401 received) */
  unauthorized: boolean;
  /** Call this when a 401 error is received to show the login prompt */
  setUnauthorized: (value: boolean) => void;
  /** Trigger unauthorized state - convenience method */
  triggerReauth: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [unauthorized, setUnauthorized] = useState(false);

  const triggerReauth = useCallback(() => {
    setUnauthorized(true);
  }, []);

  // Register the callback with authFetch so any 401 triggers the overlay
  useEffect(() => {
    setGlobalAuthErrorCallback(triggerReauth);
    return () => {
      setGlobalAuthErrorCallback(null);
    };
  }, [triggerReauth]);

  return (
    <AuthContext.Provider value={{ unauthorized, setUnauthorized, triggerReauth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Return a no-op context if used outside provider (e.g., in marketing pages)
    return {
      unauthorized: false,
      setUnauthorized: () => {},
      triggerReauth: () => {},
    };
  }
  return ctx;
}

/**
 * Hook to get the login URL with return path
 */
export function useLoginUrl(): string {
  if (typeof window === 'undefined') return '/api/auth/login';
  const currentPath = window.location.pathname + window.location.search;
  return `/api/auth/login?returnTo=${encodeURIComponent(currentPath)}`;
}
