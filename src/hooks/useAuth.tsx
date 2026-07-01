import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Phase A: 'child' remains in the type so existing child routes/guards compile.
// Children will be removed from Supabase Auth in Phase C.
export type UserRole = 'child' | 'parent';

export interface UserProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  role: UserRole | null;
  loading: boolean;
  signIn: (email: string, password: string, expectedRole: UserRole) => Promise<{ error?: any }>;
  // signUp is parent-only from Phase A onward. Child accounts are created by
  // the parent via the child-auth edge function (Phase B+).
  signUp: (email: string, password: string, role: 'parent', displayName?: string) => Promise<{ error?: any }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error?: any }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchUserRole = async (userId: string): Promise<UserRole | null> => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching role:', error);
        return null;
      }

      return data?.role as UserRole | null;
    } catch (error) {
      console.error('Error fetching role:', error);
      return null;
    }
  };

  const fetchUserProfile = async (userId: string, userRole: UserRole | null) => {
    try {
      if (!userRole) {
        setProfile(null);
        return;
      }

      // Phase E: useAuth is parent-only. child_profiles is dropped.
      // Children authenticate via the child-auth edge function (useChildAuth).
      const { data, error } = await supabase
        .from('parent_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        setProfile(null);
        return;
      }

      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
      setProfile(null);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      const userRole = await fetchUserRole(user.id);
      setRole(userRole);
      await fetchUserProfile(user.id, userRole);
    }
  };

  useEffect(() => {
    // PHASE A FIX: onAuthStateChange is the single source of truth for session,
    // role, profile and loading state. getSession() only pre-warms the session
    // object so the listener fires immediately with INITIAL_SESSION; we do NOT
    // duplicate role/profile fetches there to avoid double round-trips and the
    // loading-flicker caused by loading toggling true→false→true→false.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Keep loading true until role + profile are resolved so route guards
          // never see a user without a role (prevents redirect loops).
          setLoading(true);
          const userRole = await fetchUserRole(session.user.id);
          setRole(userRole);
          await fetchUserProfile(session.user.id, userRole);
          setLoading(false);
        } else {
          setProfile(null);
          setRole(null);
          setLoading(false);
        }
      }
    );

    // Trigger the listener above by checking for an existing session.
    // We intentionally do NOT re-fetch role/profile here — the INITIAL_SESSION
    // event emitted by onAuthStateChange handles that exactly once.
    supabase.auth.getSession(); // fire-and-forget; result handled by listener

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string, expectedRole: UserRole) => {
    // Phase A: signIn is parent-only. Child login goes through useChildAuth (Phase C).
    // We keep expectedRole guard here so the parent login page can still verify
    // that the account they're logging into is actually a parent account.
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast({
          title: "Sign In Error",
          description: error.message,
          variant: "destructive",
        });
        return { error };
      }

      // Role-mismatch guard: verify the account is the right type for this login page.
      // We fetch role once here for the guard check. onAuthStateChange will also fire
      // after signInWithPassword and update the role/profile state authoritatively —
      // we do NOT call setRole/setProfile here to avoid the race condition where
      // both this function and the listener set state simultaneously.
      if (data.user) {
        const userRole = await fetchUserRole(data.user.id);

        if (userRole !== expectedRole) {
          await supabase.auth.signOut();
          toast({
            title: "Wrong Account Type",
            description: `This account is registered as a ${userRole}. Please use the ${userRole} login page.`,
            variant: "destructive",
          });
          return { error: { message: 'Wrong account type' } };
        }

        // Role is correct — onAuthStateChange will set state. Show welcome toast.
        toast({
          title: "Welcome back! 🎉",
          description: "Successfully signed in!",
        });
      }

      return { error: null };
    } catch (error) {
      return { error };
    }
  };

  // PHASE A: signUp is now parent-only. The otpEmail/child workaround is removed.
  // Child accounts will be created by the parent via the child-auth edge function
  // in Phase B. The type signature intentionally restricts role to 'parent'.
  const signUp = async (email: string, password: string, role: 'parent', displayName?: string) => {
    // Safety guard: reject any attempt to create a child account through this hook.
    // This should never happen after Phase C, but we guard defensively.
    if ((role as string) === 'child') {
      const err = { message: 'Child accounts must be created by a parent. Use the parent dashboard.' };
      toast({
        title: "Sign Up Error",
        description: err.message,
        variant: "destructive",
      });
      return { error: err };
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/verify-otp?role=parent`,
          data: {
            role: 'parent',
            display_name: displayName || null,
          },
        },
      });

      if (error) {
        toast({
          title: "Sign Up Error",
          description: error.message,
          variant: "destructive",
        });
        return { error };
      }

      toast({
        title: "Verification Code Sent! 📧",
        description: `Check ${email} for your 6-digit code.`,
      });

      return { error: null };
    } catch (error) {
      toast({
        title: "Sign Up Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
      return { error };
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setProfile(null);
      setRole(null);
      toast({
        title: "See you later! 👋",
        description: "Successfully signed out.",
      });
    }
  };

  const deleteAccount = async () => {
    try {
      // First delete all user data using the database function
      const { error: deleteError } = await supabase.rpc('delete_user_account');
      
      if (deleteError) {
        console.error('Error deleting user data:', deleteError);
        toast({
          title: "Error",
          description: "Failed to delete account data. Please try again.",
          variant: "destructive",
        });
        return { error: deleteError };
      }
      
      // Then sign out the user
      await signOut();
      
      toast({
        title: "Account Deleted",
        description: "Your account has been permanently deleted.",
      });
      
      return { error: null };
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete account. Please try again.",
        variant: "destructive",
      });
      return { error };
    }
  };

  const value = {
    user,
    session,
    profile,
    role,
    loading,
    signIn,
    signUp,
    signOut,
    deleteAccount,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};