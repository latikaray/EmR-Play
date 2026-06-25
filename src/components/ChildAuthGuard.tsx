/**
 * ChildAuthGuard — Route protection for child-only pages.
 *
 * Replaces the old `user && role === 'child'` inline checks in App.tsx.
 * Uses useChildAuth (localStorage JWT session) instead of useAuth (Supabase).
 *
 * Usage in App.tsx:
 *   <Route path="/child" element={<ChildAuthGuard><HomePage /></ChildAuthGuard>} />
 */

import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useChildAuth } from '@/hooks/useChildAuth';

interface ChildAuthGuardProps {
  children: ReactNode;
}

const ChildAuthGuard = ({ children }: ChildAuthGuardProps) => {
  const { childSession, childLoading } = useChildAuth();

  if (childLoading) {
    // Same loading spinner pattern as AppRouter in App.tsx
    return (
      <div className="min-h-screen bg-gradient-background flex items-center justify-center">
        <div className="text-2xl font-comic">Loading...</div>
      </div>
    );
  }

  if (!childSession) {
    return <Navigate to="/child/login" replace />;
  }

  return <>{children}</>;
};

export default ChildAuthGuard;
