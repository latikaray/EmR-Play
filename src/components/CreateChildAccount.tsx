/**
 * CreateChildAccount — Parent-side component for managing child accounts.
 *
 * Replaces LinkChildAccount on ParentHomePage. Parents create child accounts
 * here by calling the child-auth edge function (which bcrypt-hashes the
 * password server-side and inserts into child_accounts).
 *
 * Visual style matches LinkChildAccount exactly: same card classes, same
 * font-comic typography, same shadow-fun / hover-lift aesthetic.
 *
 * Phase C scope:
 *   - Create child (username + display name + password)
 *   - List existing children (reads safe columns from child_accounts)
 *   - Duplicate username shows a clear error (409 from edge function)
 *
 * Phase D will add: edit child, reset child password, delete child.
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  UserPlus,
  Eye,
  EyeOff,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

// ─── Constants ───────────────────────────────────────────────────────────────

const EDGE_URL =
  'https://ecaimdsdugxouzaeyfub.supabase.co/functions/v1/child-auth';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChildAccount {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

const CreateChildAccount = () => {
  const { user } = useAuth();

  const [children, setChildren] = useState<ChildAccount[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    username: '',
    displayName: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [usernameError, setUsernameError] = useState('');

  // ── Fetch child list ────────────────────────────────────────────────────

  const fetchChildren = useCallback(async () => {
    if (!user) return;
    setLoadingChildren(true);
    const { data, error } = await supabase
      .from('child_accounts')
      .select('id, username, display_name, avatar_url, created_at')
      .eq('parent_user_id', user.id)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setChildren(data as ChildAccount[]);
    }
    setLoadingChildren(false);
  }, [user]);

  useEffect(() => {
    fetchChildren();
  }, [fetchChildren]);

  // ── Username validation ─────────────────────────────────────────────────

  const validateUsername = (value: string) => {
    if (value.length < 3) return 'Must be at least 3 characters';
    if (value.length > 30) return 'Must be at most 30 characters';
    if (!/^[a-zA-Z0-9_]+$/.test(value))
      return 'Only letters, numbers, and underscores allowed';
    return '';
  };

  const handleUsernameChange = (value: string) => {
    setForm((f) => ({ ...f, username: value }));
    setUsernameError(validateUsername(value));
  };

  // ── Submit ──────────────────────────────────────────────────────────────

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    const uErr = validateUsername(form.username);
    if (uErr) { setUsernameError(uErr); return; }
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }

    // Retrieve the parent access token from the current Supabase session
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      toast.error('Session expired. Please sign in again.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: 'create_child',
          username: form.username.trim().toLowerCase(),
          password: form.password,
          displayName: form.displayName.trim() || null,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        toast.error(
          `A child named "${form.username.toLowerCase()}" already exists. Choose a different username.`
        );
        return;
      }

      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Failed to create child account. Please try again.');
        return;
      }

      toast.success(
        `Child account "${data.child.username}" created! 🎉 Share the username and password with your child.`
      );
      setForm({ username: '', displayName: '', password: '', confirmPassword: '' });
      setShowForm(false);
      fetchChildren();
    } catch {
      toast.error('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  const passwordMismatch =
    form.confirmPassword.length > 0 && form.password !== form.confirmPassword;

  return (
    <Card className="shadow-fun bg-card/80 backdrop-blur border-2 border-primary/20">
      <CardHeader>
        <CardTitle className="font-comic flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Child Accounts
        </CardTitle>
        <CardDescription className="font-comic">
          Create and manage your children's accounts. Each child signs in with
          their username and your email address.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ── Child list ─────────────────────────────────────────────── */}
        {loadingChildren ? (
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : children.length === 0 ? (
          <p className="text-sm text-muted-foreground font-comic text-center py-2">
            No child accounts yet. Create one below!
          </p>
        ) : (
          <div className="space-y-2">
            <h4 className="font-comic font-semibold text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Your Children ({children.length})
            </h4>
            <div className="space-y-2">
              {children.map((child) => (
                <div
                  key={child.id}
                  className="flex items-center justify-between p-3 bg-secondary/20 rounded-lg"
                >
                  <div>
                    <p className="font-comic font-medium">
                      {child.display_name ?? child.username}
                    </p>
                    <p className="text-xs text-muted-foreground font-comic">
                      @{child.username} · joined{' '}
                      {new Date(child.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="secondary" className="font-comic">
                    Active
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Create form toggle ─────────────────────────────────────── */}
        <Button
          variant="fun"
          className="w-full"
          onClick={() => setShowForm((v) => !v)}
          type="button"
        >
          {showForm ? (
            <>
              <ChevronUp className="h-4 w-4 mr-2" />
              Hide Form
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Child Account
            </>
          )}
        </Button>

        {/* ── Create form ────────────────────────────────────────────── */}
        {showForm && (
          <form onSubmit={handleCreate} className="space-y-4 pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground font-comic">
              Your child will log in with their username + your email address.
            </p>

            {/* Username */}
            <div className="space-y-1">
              <Label htmlFor="child-username" className="font-comic text-foreground">
                Username <span className="text-destructive">*</span>
              </Label>
              <Input
                id="child-username"
                type="text"
                placeholder="e.g. alex_123"
                value={form.username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                className="font-comic"
                required
                autoComplete="off"
              />
              {usernameError && (
                <p className="text-xs text-destructive font-comic">{usernameError}</p>
              )}
              <p className="text-xs text-muted-foreground font-comic">
                3–30 characters, letters / numbers / underscores only
              </p>
            </div>

            {/* Display name */}
            <div className="space-y-1">
              <Label htmlFor="child-displayname" className="font-comic text-foreground">
                Display Name (optional)
              </Label>
              <Input
                id="child-displayname"
                type="text"
                placeholder="e.g. Alex"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                className="font-comic"
                autoComplete="off"
              />
            </div>

            {/* Password */}
            <div className="space-y-1">
              <Label htmlFor="child-password" className="font-comic text-foreground">
                Password <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="child-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="pr-10 font-comic"
                  required
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Confirm password */}
            <div className="space-y-1">
              <Label htmlFor="child-confirm" className="font-comic text-foreground">
                Confirm Password <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="child-confirm"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Repeat password"
                  value={form.confirmPassword}
                  onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  className="pr-10 font-comic"
                  required
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {passwordMismatch && (
                <p className="text-xs text-destructive font-comic">Passwords don't match</p>
              )}
            </div>

            <Button
              type="submit"
              variant="fun"
              size="lg"
              className="w-full"
              disabled={
                submitting ||
                !!usernameError ||
                passwordMismatch ||
                form.password.length < 8
              }
            >
              {submitting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Creating Account...
                </>
              ) : (
                'Create Child Account 🚀'
              )}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
};

export default CreateChildAccount;
