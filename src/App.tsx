import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import LandingPage from "./pages/LandingPage";
import HomePage from "./pages/HomePage";
import ActivitiesPage from "./pages/ActivitiesPage";
import ProfilePage from "./pages/ProfilePage";
import ParentLoginPage from "./pages/ParentLoginPage";
import ChildLoginPage from "./pages/ChildLoginPage";
import ParentSignUpPage from "./pages/ParentSignUpPage";
import ChildSignUpPage from "./pages/ChildSignUpPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import VerifyOTPPage from "./pages/VerifyOTPPage";
import StoryPage from "./pages/StoryPage";
import BreathingPage from "./pages/BreathingPage";
import GratitudeJournalPage from "./pages/GratitudeJournalPage";
import EmojiMatchPage from "./pages/EmojiMatchPage";
import EmotionWheelPage from "./pages/EmotionWheelPage";
import DrawMoodPage from "./pages/DrawMoodPage";
import ClassroomMazePage from "./pages/ClassroomMazePage";
import ConflictRolePlayPage from "./pages/ConflictRolePlayPage";
import EQQuizPage from "./pages/EQQuizPage";
import PeerPressureSimPage from "./pages/PeerPressureSimPage";
import PeerPressureGuidePage from "./pages/PeerPressureGuidePage";
import ParentHomePage from "./pages/ParentHomePage";
import ParentRolePlayPage from "./pages/ParentRolePlayPage";
import ParentQuizzesPage from "./pages/ParentQuizzesPage";
import ParentJournalPage from "./pages/ParentJournalPage";
import ParentMiniGamesPage from "./pages/ParentMiniGamesPage";
import ParentArticlesPage from "./pages/ParentArticlesPage";
import ParentingGuidesPage from "./pages/ParentingGuidesPage";
import ChildProgressPage from "./pages/ChildProgressPage";
import BadgesPage from "./pages/BadgesPage";
import EmoPage from "./pages/EmoPage";
import SelActivitiesGuidePage from "./pages/SelActivitiesGuidePage";
import NotFound from "./pages/NotFound";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { ChildAuthProvider, useChildAuth } from "./hooks/useChildAuth";
import ChildAuthGuard from "./components/ChildAuthGuard";

const queryClient = new QueryClient();

// Router component that handles role-based routing
const AppRouter = () => {
  const { user, role, loading } = useAuth();
  const { childSession, childLoading } = useChildAuth();

  // Wait for both auth systems to resolve before rendering routes.
  // This prevents redirect loops caused by transiently null state.
  if (loading || childLoading) {
    return (
      <div className="min-h-screen bg-gradient-background flex items-center justify-center">
        <div className="text-2xl font-comic">Loading...</div>
      </div>
    );
  }

  return (
    <Layout>
      <Routes>
        {/* Public routes */}
        <Route path="/welcome" element={<LandingPage />} />
        
        {/* Separate login / signup pages */}
        <Route path="/parent/login" element={!user ? <ParentLoginPage /> : <Navigate to="/parent" replace />} />
        {/* Child login: redirect away if child already has a session */}
        <Route path="/child/login" element={!childSession ? <ChildLoginPage /> : <Navigate to="/child" replace />} />
        <Route path="/parent/signup" element={!user ? <ParentSignUpPage /> : <Navigate to="/parent" replace />} />
        <Route path="/child/signup" element={<ChildSignUpPage />} />
        
        {/* OTP and password routes */}
        <Route path="/verify-otp" element={<VerifyOTPPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        
        {/* Root: child session wins → /child; parent session → /parent; else landing */}
        <Route path="/" element={
          childSession
            ? <Navigate to="/child" replace />
            : (user && role === 'parent')
              ? <Navigate to="/parent" replace />
              : <LandingPage />
        } />
        
        {/* Child routes — protected by ChildAuthGuard (uses localStorage JWT, not Supabase) */}
        <Route path="/child" element={<ChildAuthGuard><HomePage /></ChildAuthGuard>} />
        <Route path="/activities" element={<ChildAuthGuard><ActivitiesPage /></ChildAuthGuard>} />
        <Route path="/activities/story" element={<ChildAuthGuard><StoryPage /></ChildAuthGuard>} />
        <Route path="/activities/draw" element={<ChildAuthGuard><DrawMoodPage /></ChildAuthGuard>} />
        <Route path="/activities/breathing" element={<ChildAuthGuard><BreathingPage /></ChildAuthGuard>} />
        <Route path="/activities/gratitude" element={<ChildAuthGuard><GratitudeJournalPage /></ChildAuthGuard>} />
        <Route path="/activities/emoji-match" element={<ChildAuthGuard><EmojiMatchPage /></ChildAuthGuard>} />
        <Route path="/activities/emotion-wheel" element={<ChildAuthGuard><EmotionWheelPage /></ChildAuthGuard>} />
        <Route path="/activities/classroom-maze" element={<ChildAuthGuard><ClassroomMazePage /></ChildAuthGuard>} />
        <Route path="/activities/conflict-roleplay" element={<ChildAuthGuard><ConflictRolePlayPage /></ChildAuthGuard>} />
        <Route path="/activities/eq-quiz" element={<ChildAuthGuard><EQQuizPage /></ChildAuthGuard>} />
        <Route path="/activities/peer-pressure-sim" element={<ChildAuthGuard><PeerPressureSimPage /></ChildAuthGuard>} />
        <Route path="/activities/peer-pressure-guide" element={<ChildAuthGuard><PeerPressureGuidePage /></ChildAuthGuard>} />
        <Route path="/child-progress" element={<ChildAuthGuard><ChildProgressPage /></ChildAuthGuard>} />
        
        {/* Parent routes - only accessible by parents */}
        <Route path="/parent" element={user && role === 'parent' ? <ParentHomePage /> : <Navigate to="/parent/login" replace />} />
        <Route path="/parent/role-play" element={user && role === 'parent' ? <ParentRolePlayPage /> : <Navigate to="/parent/login" replace />} />
        <Route path="/parent/quizzes" element={user && role === 'parent' ? <ParentQuizzesPage /> : <Navigate to="/parent/login" replace />} />
        <Route path="/parent/journal" element={user && role === 'parent' ? <ParentJournalPage /> : <Navigate to="/parent/login" replace />} />
        <Route path="/parent/mini-games" element={user && role === 'parent' ? <ParentMiniGamesPage /> : <Navigate to="/parent/login" replace />} />
        <Route path="/parent/articles" element={user && role === 'parent' ? <ParentArticlesPage /> : <Navigate to="/parent/login" replace />} />
        <Route path="/parent/guide-library" element={user && role === 'parent' ? <ParentingGuidesPage /> : <Navigate to="/parent/login" replace />} />
        <Route path="/parent/sel-activities-guide" element={user && role === 'parent' ? <SelActivitiesGuidePage /> : <Navigate to="/parent/login" replace />} />
        <Route path="/parent/child-progress" element={user && role === 'parent' ? <ChildProgressPage /> : <Navigate to="/parent/login" replace />} />
        
        {/* Shared routes */}
        <Route path="/progress" element={user ? <ChildProgressPage /> : <Navigate to="/welcome" replace />} />
        <Route path="/profile" element={user ? <ProfilePage /> : <Navigate to="/welcome" replace />} />
        <Route path="/badges" element={user ? <BadgesPage /> : <Navigate to="/welcome" replace />} />
        <Route path="/emo" element={user ? <EmoPage /> : <Navigate to="/welcome" replace />} />
        
        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          {/* ChildAuthProvider is independent of AuthProvider.
              It manages the localStorage-based child session. */}
          <ChildAuthProvider>
            <AppRouter />
          </ChildAuthProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;