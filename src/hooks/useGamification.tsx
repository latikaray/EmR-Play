import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";
import { BADGES, UNLOCKABLE_AVATARS, getLevel, getXPForNextLevel, type GamificationStats, type BadgeDefinition } from "@/data/gamificationData";

interface UserXP {
  total_xp: number;
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
}

interface UserBadge {
  badge_id: string;
  earned_at: string;
}

interface UnlockedAvatar {
  avatar_id: string;
  unlocked_at: string;
}

export const useGamification = () => {
  const [userXP, setUserXP] = useState<UserXP>({ total_xp: 0, current_streak: 0, longest_streak: 0, last_active_date: null });
  const [earnedBadges, setEarnedBadges] = useState<UserBadge[]>([]);
  const [unlockedAvatars, setUnlockedAvatars] = useState<UnlockedAvatar[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, role } = useAuth();
  const { toast } = useToast();

  const fetchGamificationData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [xpRes, badgesRes, avatarsRes] = await Promise.all([
        supabase.from('user_xp').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_badges').select('*').eq('user_id', user.id),
        supabase.from('unlocked_avatars').select('*').eq('user_id', user.id),
      ]);

      if (xpRes.data) {
        setUserXP(xpRes.data as unknown as UserXP);
      } else if (!xpRes.error) {
        // Create initial XP row via SECURITY DEFINER function
        await supabase.rpc('ensure_user_xp');
        setUserXP({ total_xp: 0, current_streak: 0, longest_streak: 0, last_active_date: null });
      }

      setEarnedBadges((badgesRes.data || []) as unknown as UserBadge[]);
      setUnlockedAvatars((avatarsRes.data || []) as unknown as UnlockedAvatar[]);
    } catch (error) {
      console.error('Error fetching gamification data:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchGamificationData();
  }, [fetchGamificationData]);

  const checkAndUpdateStreak = useCallback(async () => {
    // Streak is now updated server-side inside award_xp().
    return;
  }, []);

  const awardXP = useCallback(async (amount: number, reason: string) => {
    if (!user) return;

    const { data, error } = await supabase.rpc('award_xp', { p_amount: amount });
    if (error) {
      console.error('award_xp failed:', error);
      return;
    }
    const row = data as unknown as UserXP | null;
    const newTotal = row?.total_xp ?? userXP.total_xp + amount;
    if (row) setUserXP(row);

    toast({
      title: `+${amount} XP! ✨`,
      description: reason,
    });

    // Check for new avatar unlocks (server validates threshold)
    const newAvatars = UNLOCKABLE_AVATARS.filter(
      a => a.xpRequired <= newTotal && !unlockedAvatars.find(u => u.avatar_id === a.id)
    );
    for (const avatar of newAvatars) {
      const { data: unlocked } = await supabase.rpc('unlock_avatar', {
        p_avatar_id: avatar.id,
        p_xp_required: avatar.xpRequired,
      });
      if (unlocked) {
        toast({ title: `🎉 New Avatar Unlocked!`, description: `You unlocked "${avatar.name}" ${avatar.emoji}` });
      }
    }
    if (newAvatars.length > 0) {
      setUnlockedAvatars(prev => [...prev, ...newAvatars.map(a => ({ avatar_id: a.id, unlocked_at: new Date().toISOString() }))]);
    }

    // Check badges
    await checkBadges(newTotal);
  }, [user, userXP, unlockedAvatars, toast]);

  const checkBadges = useCallback(async (currentXP?: number) => {
    if (!user) return;

    // Get current stats
    const [completionsRes, journalRes, moodRes] = await Promise.all([
      supabase.from('activity_completions').select('activity_name').eq('user_id', user.id),
      supabase.from('journal_entries').select('id').eq('user_id', user.id),
      supabase.from('mood_entries').select('id').eq('user_id', user.id),
    ]);

    const completions = completionsRes.data || [];
    const stats: GamificationStats = {
      totalXP: currentXP ?? userXP.total_xp,
      totalCompletions: completions.length,
      uniqueActivities: new Set(completions.map(c => (c as any).activity_name)).size,
      currentStreak: userXP.current_streak,
      longestStreak: userXP.longest_streak,
      journalEntries: (journalRes.data || []).length,
      moodEntries: (moodRes.data || []).length,
      badgeCount: earnedBadges.length,
    };

    const applicableBadges = BADGES.filter(b => b.category === role || b.category === 'both');
    const newBadges: BadgeDefinition[] = [];

    for (const badge of applicableBadges) {
      if (earnedBadges.find(eb => eb.badge_id === badge.id)) continue;
      if (badge.checkFn(stats)) {
        newBadges.push(badge);
        await supabase.rpc('grant_badge', { p_badge_id: badge.id });
        toast({ title: `🏅 Badge Earned!`, description: `${badge.emoji} ${badge.name} — ${badge.description}` });
      }
    }

    if (newBadges.length > 0) {
      setEarnedBadges(prev => [...prev, ...newBadges.map(b => ({ badge_id: b.id, earned_at: new Date().toISOString() }))]);
    }
  }, [user, userXP, earnedBadges, role, toast]);

  return {
    userXP,
    earnedBadges,
    unlockedAvatars,
    loading,
    level: getLevel(userXP.total_xp),
    levelProgress: getXPForNextLevel(userXP.total_xp),
    awardXP,
    checkAndUpdateStreak,
    checkBadges,
    refreshData: fetchGamificationData,
    allBadges: BADGES.filter(b => b.category === role || b.category === 'both'),
    allAvatars: UNLOCKABLE_AVATARS,
  };
};
