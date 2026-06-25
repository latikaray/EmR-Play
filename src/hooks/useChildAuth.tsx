/**
 * useChildAuth — Child session management hook
 *
 * Children do NOT have Supabase auth.users rows. Their session is a signed
 * JWT from the child-auth edge function, stored in localStorage under the
 * key "emr_child_session". This context is completely independent of useAuth.
 *
 * Session lifecycle:
 *   - mount: restore from localStorage, validate JWT expiry
 *   - childSignIn: call child-auth edge function → store token → set state
 *   - childSignOut: clear localStorage → clear state
 *   - auto-expires: on mount, if stored JWT exp is in the past → clear it
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'emr_child_session';
const EDGE_URL =
  'https://ecaimdsdugxouzaeyfub.supabase.co/functions/v1/child-auth';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChildSession {
  token: string;
  childId: string;
  parentId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: 'child';
}

interface ChildAuthContextType {
  childSession: ChildSession | null;
  childLoading: boolean;
  childSignIn: (
    username: string,
    parentEmail: string,
    password: string
  ) => Promise<{ error?: string }>;
  childSignOut: () => void;
}

// ─── JWT expiry helper ───────────────────────────────────────────────────────

/**
 * Decode the `exp` claim from a JWT without verifying its signature.
 * Signature verification is the server's job. Client-side we only need to
 * know whether the token has expired so we can proactively clear it.
 *
 * Returns true if the token is still valid (exp > now), false otherwise.
 */
function isTokenValid(token: string): boolean {
  try {
    const [, payloadB64] = token.split('.');
    // JWT uses base64url — replace chars and pad
    const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded);
    const payload = JSON.parse(json) as { exp?: number };
    if (!payload.exp) return false;
    return payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ChildAuthContext = createContext<ChildAuthContextType | undefined>(
  undefined
);

// ─── Provider ────────────────────────────────────────────────────────────────

export const ChildAuthProvider = ({ children }: { children: ReactNode }) => {
  const [childSession, setChildSession] = useState<ChildSession | null>(null);
  const [childLoading, setChildLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: ChildSession = JSON.parse(stored);
        if (parsed.token && isTokenValid(parsed.token)) {
          setChildSession(parsed);
        } else {
          // Token expired — clean up silently
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      // Corrupted storage entry — clear it
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setChildLoading(false);
    }
  }, []);

  const childSignIn = useCallback(
    async (
      username: string,
      parentEmail: string,
      password: string
    ): Promise<{ error?: string }> => {
      try {
        const res = await fetch(EDGE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'login',
            username: username.trim().toLowerCase(),
            parentEmail: parentEmail.trim().toLowerCase(),
            password,
          }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          const message = data.error ?? 'Sign in failed. Please try again.';
          toast.error(message);
          return { error: message };
        }

        // Build the session object from the edge function response
        const session: ChildSession = {
          token:       data.session.token,
          childId:     data.session.childId,
          parentId:    data.session.parentId,
          username:    data.session.username,
          displayName: data.session.displayName ?? null,
          avatarUrl:   data.session.avatarUrl ?? null,
          role:        'child',
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        setChildSession(session);

        toast.success(`Welcome back, ${session.displayName ?? session.username}! 🎮`);
        return {};
      } catch (e) {
        const message = 'Network error. Please check your connection.';
        toast.error(message);
        return { error: message };
      }
    },
    []
  );

  const childSignOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setChildSession(null);
    toast.success('See you later! 👋');
  }, []);

  return (
    <ChildAuthContext.Provider
      value={{ childSession, childLoading, childSignIn, childSignOut }}
    >
      {children}
    </ChildAuthContext.Provider>
  );
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export const useChildAuth = (): ChildAuthContextType => {
  const ctx = useContext(ChildAuthContext);
  if (!ctx) {
    throw new Error('useChildAuth must be used within a ChildAuthProvider');
  }
  return ctx;
};
