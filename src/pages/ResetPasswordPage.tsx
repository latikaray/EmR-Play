import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sparkles, Heart, Star, Lock, ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ResetPasswordPage = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // PHASE A FIX: Listen for Supabase's PASSWORD_RECOVERY event, which fires
    // when the user clicks the reset link in their email. The SDK automatically
    // exchanges the one-time token in the URL for a session; we just wait for
    // that event here. The previous ts-ignore workaround is removed.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === 'PASSWORD_RECOVERY') {
          // Session is now active. The updateUser call below will work.
          // No navigation needed here — we stay on this page so the user
          // can type their new password.
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Password updated! Please sign in with your new password.");
        navigate("/parent/login");
      }
    } catch (err) {
      toast.error("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-background flex items-center justify-center p-4">
      {/* Floating Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <Sparkles className="absolute top-20 left-20 h-6 w-6 text-fun-yellow animate-float" />
        <Heart className="absolute top-32 right-32 h-5 w-5 text-fun-pink animate-float" style={{ animationDelay: '1s' }} />
        <Star className="absolute bottom-40 left-40 h-4 w-4 text-accent animate-float" style={{ animationDelay: '2s' }} />
        <Sparkles className="absolute bottom-20 right-20 h-7 w-7 text-fun-teal animate-float" style={{ animationDelay: '0.5s' }} />
      </div>

      <div className="w-full max-w-md space-y-6">
        <Card className="shadow-fun bg-card/80 backdrop-blur border-2 border-primary/20 hover-lift">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-comic text-foreground">Set a New Password</CardTitle>
            <CardDescription className="font-comic">Please enter and confirm your new password</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password" className="font-comic text-foreground">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 font-comic" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm" className="font-comic text-foreground">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="pl-10 font-comic" required />
                </div>
              </div>
              <Button type="submit" variant="fun" size="lg" className="w-full" disabled={loading}>
                {loading ? "Updating..." : "Update Password"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center">
          <Link to="/parent/login" className="inline-flex items-center gap-2 text-primary hover:underline font-comic">
            <ArrowLeft className="h-4 w-4" />
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
