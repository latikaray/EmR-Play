/**
 * CreateChildAccount — Parent-side child account management.
 *
 * Features:
 *   - Create child account (username + display name + password)
 *   - After creation: show a dismissible credentials card so the parent can
 *     hand off login details to their child
 *   - List existing children
 *   - Reset a child's password inline
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
  Copy,
  Check,
  KeyRound,
  X,
  Gamepad2,
  Mail,
  Lock,
  User,
  PartyPopper,
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

interface CreatedCredentials {
  displayName: string;
  username: string;
  parentEmail: string;
  password: string;
}

// ─── Small helper: copy-to-clipboard button ──────────────────────────────────

const CopyButton = ({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 w-7 p-0 shrink-0"
      onClick={handleCopy}
      aria-label="Copy"
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <Copy className="h-4 w-4 text-muted-foreground" />
      )}
    </Button>
  );
};

// ─── Credentials Card ────────────────────────────────────────────────────────

const CredentialsCard = ({
  creds,
  onDismiss,
}: {
  creds: CreatedCredentials;
  onDismiss: () => void;
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const loginUrl = `${window.location.origin}/child/login?parentEmail=${encodeURIComponent(creds.parentEmail)}`;

  return (
    <div className="rounded-xl border-2 border-green-500/40 bg-green-50/80 dark:bg-green-950/30 p-4 space-y-4 relative animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Dismiss */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 h-7 w-7 p-0"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </Button>

      {/* Header */}
      <div className="flex items-center gap-2">
        <PartyPopper className="h-5 w-5 text-green-600" />
        <p className="font-comic font-bold text-green-800 dark:text-green-200">
          Account created! Share these details with {creds.displayName || creds.username}
        </p>
      </div>

      {/* Credential rows */}
      <div className="space-y-2 text-sm font-comic">
        {/* Username */}
        <div className="flex items-center gap-2 bg-white/60 dark:bg-black/20 rounded-lg px-3 py-2">
          <User className="h-4 w-4 text-primary shrink-0" />
          <span className="text-muted-foreground w-28 shrink-0">Username:</span>
          <span className="font-bold flex-1">{creds.username}</span>
          <CopyButton value={creds.username} />
        </div>

        {/* Parent email */}
        <div className="flex items-center gap-2 bg-white/60 dark:bg-black/20 rounded-lg px-3 py-2">
          <Mail className="h-4 w-4 text-primary shrink-0" />
          <span className="text-muted-foreground w-28 shrink-0">Parent email:</span>
          <span className="font-bold flex-1 break-all">{creds.parentEmail}</span>
          <CopyButton value={creds.parentEmail} />
        </div>

        {/* Password */}
        <div className="flex items-center gap-2 bg-white/60 dark:bg-black/20 rounded-lg px-3 py-2">
          <Lock className="h-4 w-4 text-primary shrink-0" />
          <span className="text-muted-foreground w-28 shrink-0">Password:</span>
          <span className="font-bold flex-1 font-mono tracking-wider">
            {showPassword ? creds.password : '••••••••'}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
          <CopyButton value={creds.password} />
        </div>
      </div>

      {/* Quick-login link */}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground font-comic">
          Or share this link — it pre-fills the parent email:
        </p>
        <div className="flex items-center gap-2 bg-white/60 dark:bg-black/20 rounded-lg px-3 py-2">
          <Gamepad2 className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs font-mono flex-1 break-all text-muted-foreground">{loginUrl}</span>
          <CopyButton value={loginUrl} />
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full font-comic border-green-500/40 text-green-700 hover:bg-green-100 dark:text-green-300"
        onClick={onDismiss}
      >
        <Check className="h-4 w-4 mr-2" /> Done, I've shared these details
      </Button>
    </div>
  );
};

// ─── Reset Password Form ─────────────────────────────────────────────────────

const ResetPasswordForm = ({
  child,
  onClose,
}: {
  child: ChildAccount;
  onClose: () => void;
}) => {
  const [newPassword, setNewPassword]       = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew]               = useState(false);
  const [submitting, setSubmitting]         = useState(false);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const disabled = submitting || newPassword.length < 8 || mismatch || !confirmPassword;

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;

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
          action: 'update_password',
          childId: child.id,
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to update password');
        return;
      }

      toast.success(`Password updated for ${child.display_name ?? child.username}! 🔑`);
      onClose();
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleReset}
      className="mt-2 space-y-3 p-3 bg-secondary/20 rounded-lg border border-border/50"
    >
      <p className="text-xs font-comic font-semibold text-foreground flex items-center gap-1">
        <KeyRound className="h-3 w-3" /> Reset password for {child.display_name ?? child.username}
      </p>

      {/* New password */}
      <div className="relative">
        <Input
          type={showNew ? 'text' : 'password'}
          placeholder="New password (min. 8 chars)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="pr-10 font-comic text-sm"
          autoComplete="new-password"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
          onClick={() => setShowNew((v) => !v)}
        >
          {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>

      {/* Confirm */}
      <Input
        type="password"
        placeholder="Confirm new password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        className="font-comic text-sm"
        autoComplete="new-password"
      />
      {mismatch && (
        <p className="text-xs text-destructive font-comic">Passwords don't match</p>
      )}

      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          variant="fun"
          className="flex-1 font-comic"
          disabled={disabled}
        >
          {submitting ? (
            <RefreshCw className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <KeyRound className="h-4 w-4 mr-1" />
          )}
          Update Password
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="font-comic"
          onClick={onClose}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const CreateChildAccount = () => {
  const { user } = useAuth();

  const [children, setChildren]           = useState<ChildAccount[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [showForm, setShowForm]           = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [newCreds, setNewCreds]           = useState<CreatedCredentials | null>(null);
  const [resetChildId, setResetChildId]   = useState<string | null>(null);

  const [form, setForm] = useState({
    username: '',
    displayName: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword]   = useState(false);
  const [showConfirm, setShowConfirm]     = useState(false);
  const [usernameError, setUsernameError] = useState('');

  // ── Fetch children list ──────────────────────────────────────────────────

  const fetchChildren = useCallback(async () => {
    if (!user) return;
    setLoadingChildren(true);
    const { data, error } = await supabase
      .from('child_accounts')
      .select('id, username, display_name, avatar_url, created_at')
      .eq('parent_user_id', user.id)
      .order('created_at', { ascending: true });

    if (!error && data) setChildren(data as ChildAccount[]);
    setLoadingChildren(false);
  }, [user]);

  useEffect(() => {
    fetchChildren();
  }, [fetchChildren]);

  // ── Username validation ──────────────────────────────────────────────────

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

  // ── Submit create ────────────────────────────────────────────────────────

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

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken  = sessionData?.session?.access_token;
    const parentEmail  = sessionData?.session?.user?.email ?? '';
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

      // Show credentials card
      setNewCreds({
        displayName: form.displayName.trim() || data.child.username,
        username:    data.child.username,
        parentEmail,
        password:    form.password,
      });

      setForm({ username: '', displayName: '', password: '', confirmPassword: '' });
      setShowForm(false);
      fetchChildren();
    } catch {
      toast.error('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const passwordMismatch =
    form.confirmPassword.length > 0 && form.password !== form.confirmPassword;

  return (
    <Card className="shadow-fun bg-card/80 backdrop-blur border-2 border-primary/20 mb-8">
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

      <CardContent className="space-y-4">
        {/* ── Credentials handoff card ─────────────────────────────────── */}
        {newCreds && (
          <CredentialsCard creds={newCreds} onDismiss={() => setNewCreds(null)} />
        )}

        {/* ── Child list ───────────────────────────────────────────────── */}
        {loadingChildren ? (
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : children.length === 0 ? (
          <div className="text-center py-6 space-y-2">
            <div className="text-4xl">👶</div>
            <p className="text-sm text-muted-foreground font-comic">
              No child accounts yet. Create one below!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <h4 className="font-comic font-semibold text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Your Children ({children.length})
            </h4>
            <div className="space-y-2">
              {children.map((child) => (
                <div key={child.id} className="space-y-0">
                  <div className="flex items-center justify-between p-3 bg-secondary/20 rounded-lg">
                    <div>
                      <p className="font-comic font-medium">
                        {child.display_name ?? child.username}
                      </p>
                      <p className="text-xs text-muted-foreground font-comic">
                        @{child.username} · joined{' '}
                        {new Date(child.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="font-comic text-xs h-7 px-2"
                        onClick={() =>
                          setResetChildId((id) => (id === child.id ? null : child.id))
                        }
                        aria-label={`Reset password for ${child.username}`}
                      >
                        <KeyRound className="h-3 w-3 mr-1" />
                        {resetChildId === child.id ? 'Cancel' : 'Reset Password'}
                      </Button>
                      <Badge variant="secondary" className="font-comic">
                        Active
                      </Badge>
                    </div>
                  </div>
                  {resetChildId === child.id && (
                    <ResetPasswordForm
                      child={child}
                      onClose={() => setResetChildId(null)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Add child toggle ─────────────────────────────────────────── */}
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

        {/* ── Create form ──────────────────────────────────────────────── */}
        {showForm && (
          <form
            onSubmit={handleCreate}
            className="space-y-4 pt-2 border-t border-border/50"
          >
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
                onChange={(e) =>
                  setForm((f) => ({ ...f, displayName: e.target.value }))
                }
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
                  onChange={(e) =>
                    setForm((f) => ({ ...f, password: e.target.value }))
                  }
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
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
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
                  onChange={(e) =>
                    setForm((f) => ({ ...f, confirmPassword: e.target.value }))
                  }
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
                  {showConfirm ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {passwordMismatch && (
                <p className="text-xs text-destructive font-comic">
                  Passwords don't match
                </p>
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
