// Phase A: Child self-signup has been replaced with a parent-managed creation
// flow (Phase B+). This page now shows a clear notice directing parents to
// sign up first. The visual structure (layout, animations, styles) is preserved.
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Heart, Star, Gamepad2, Users } from "lucide-react";
import { Link } from "react-router-dom";

const ChildSignUpPage = () => {
  return (
    <div className="min-h-screen bg-gradient-background flex items-center justify-center p-4">
      {/* Floating Elements — preserved as-is */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <Sparkles className="absolute top-20 left-20 h-6 w-6 text-fun-yellow animate-float" />
        <Heart className="absolute top-32 right-32 h-5 w-5 text-fun-pink animate-float" style={{ animationDelay: '1s' }} />
        <Star className="absolute bottom-40 left-40 h-4 w-4 text-accent animate-float" style={{ animationDelay: '2s' }} />
        <Sparkles className="absolute bottom-20 right-20 h-7 w-7 text-fun-teal animate-float" style={{ animationDelay: '0.5s' }} />
      </div>

      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center shadow-fun animate-bounce-in">
              <Gamepad2 className="h-6 w-6 text-primary-foreground" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-fun bg-clip-text text-transparent font-comic">
              Kids Zone
            </h1>
          </div>
          <p className="text-lg text-muted-foreground font-comic">
            Start your emotional adventure today! 🌟
          </p>
        </div>

        {/* Notice Card — replaces the old signup form */}
        <Card className="shadow-fun bg-card/80 backdrop-blur border-2 border-primary/20 hover-lift">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-comic text-foreground">
              Create Kid Account
            </CardTitle>
            <CardDescription className="font-comic">
              Kid accounts are set up by a parent or guardian
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 text-center">
            <div className="flex items-center justify-center">
              <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center shadow-fun">
                <Users className="h-8 w-8 text-primary-foreground" />
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-foreground font-comic font-semibold">
                Ask your parent to set up your account! 🎮
              </p>
              <p className="text-sm text-muted-foreground font-comic">
                Your parent creates your username and password from their account.
                Once it&apos;s ready, you can sign in with just your username!
              </p>
            </div>
            <div className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground font-comic">
                Is your parent new to EMR Play?
              </p>
              <Button variant="fun" size="lg" className="w-full" asChild>
                <Link to="/parent/signup">
                  Parent Sign Up 🚀
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Sign In Link */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground font-comic">
            Already have a kid account?{" "}
            <Link
              to="/child/login"
              className="text-primary hover:underline font-bold"
            >
              Sign in here
            </Link>
          </p>
        </div>

        {/* Fun Notice */}
        <Card className="bg-gradient-primary text-primary-foreground shadow-fun">
          <CardContent className="p-4 text-center">
            <h4 className="font-bold font-comic mb-2">🎮 Fun &amp; Safe</h4>
            <p className="text-sm opacity-90 font-comic">
              Learn about emotions through fun games and activities!
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ChildSignUpPage;