/**
 * useGamification — Phase D update
 *
 * Child path: fetches via child-data `get_gamification`, awards XP via `award_xp`.
 * Parent path: unchanged — reads from user_xp/user_badges via Supabase, calls award_xp RPC.
 *
 * This hook is used on both child pages (HomePage, BadgesPage, ProfilePage)
 * and the parent page (ParentHomePage). The isChild flag picks the right path.
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useChildAuth } from "./useChildAuth";
import { useToast } from "./use-toast";
import {
  BADGES,
  UNLOCKABLE_AVATARS,
  getLevel,
  getXPForNextLevel,
  type GamificationStats,
  type BadgeDefinition,
} from "@/data/gamificationData";

const CHILD_DATA_URL =
  "https://ecaimdsdugxouzaeyfub.supabase.co/functions/v1/child-data";

interface UserXP {
  total_xp:        number;
  current_streak:  number;
  longest_streak:  number;
  last_active_date: string | null;
}

interface UserBadge {
  badge_id:  string;
  earned_at: string;
}

interface UnlockedAvatar {
  avatar_id:    string;
  unlocked_at:  string;
}

const EMPTY_XP: UserXP = {
  total_xp: 0, current_streak: 0, longest_streak: 0, last_active_date: null
};

export const useGamification = () => {
  const [userXP, setUserXP]                     = useState<UserXP>(EMPTY_XP);
  const [earnedBadges, setEarnedBadges]         = useState<UserBadge[]>([]);
  const [unlockedAvatars, setUnlockedAvatars]   = useState<UnlockedAvatar[]>([]);
  const [loading, setLoading]                   = useState(true);
  const { user, role }                          = useAuth();
  const { childSession }                        = useChildAuth();
  const { toast }                               = useToast();

  const isChild = !!childSession;

  // ── Fetch gamification data ─────────────────────────────────────────────────

  const fetchGamificationData = useCallback(async () => {
    setLoading(true);
    try {
      if (isChild) {
        // ── Child path: call child-data edge function ──
        const res = await fetch(CHILD_DATA_URL, {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${childSession!.token}`,
          },
          body: JSON.stringify({ action: "get_gamification" }),
        });
        const data = await res.json();
        if (data.success) {
          setUserXP(data.xp ?? EMPTY_XP);
          setEarnedBadges(data.badges ?? []);
          // Children don't have avatar unlocks in Phase D; placeholder empty array
          setUnlockedAvatars([]);
        }
      } else if (user) {
        // ── Parent / Supabase path (unchanged) ──
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
          setUserXP(EMPTY_XP);
        }

        setEarnedBadges((badgesRes.data || []) as unknown as UserBadge[]);
        setUnlockedAvatars((avatarsRes.data || []) as unknown as UnlockedAvatar[]);
      }
    } catch (error) {
      console.error('Error fetching gamification data:', error);
    } finally {
      setLoading(false);
    }
  }, [isChild, childSession, user]);

  useEffect(() => {
    fetchGamificationData();
  }, [fetchGamificationData]);

  // Streak update is server-side (award_xp handles it)
  const checkAndUpdateStreak = useCallback(async () => { return; }, []);

  // ── Award XP ────────────────────────────────────────────────────────────────

  const awardXP = useCallback(async (amount: number, reason: string) => {
    try {
      if (isChild) {
        // ── Child path ──
        const res = await fetch(CHILD_DATA_URL, {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${childSession!.token}`,
          },
          body: JSON.stringify({ action: "award_xp", amount }),
        });
        const data = await res.json();
        if (!data.success) {
          console.error("child award_xp failed:", data.error);
          return;
        }

        if (data.xp) {
          setUserXP(data.xp);
        }

        toast({ title: `+${amount} XP! ✨`, description: reason });

        // Announce newly unlocked badges
        if (Array.isArray(data.newBadges) && data.newBadges.length > 0) {
          const allChildBadges = BADGES.filter(b => b.category === 'child' || b.category === 'both');
          for (const badgeId of data.newBadges) {
            const def = allChildBadges.find(b => b.id === badgeId);
            if (def) {
              toast({
                title: `🏅 Badge Earned!`,
                description: `${def.emoji} ${def.name} — ${def.description}`,
              });
            }
          }
          setEarnedBadges(prev => [
            ...prev,
            ...data.newBadges.map((bid: string) => ({ badge_id: bid, earned_at: new Date().toISOString() })),
          ]);
        }
      } else {
        // ── Parent / Supabase path (unchanged) ──
        if (!user) return;

        const { data, error } = await supabase.rpc('award_xp', { p_amount: amount });
        if (error) {
          console.error('award_xp failed:', error);
          return;
        }
        const row      = data as unknown as UserXP | null;
        const newTotal = row?.total_xp ?? userXP.total_xp + amount;
        if (row) setUserXP(row);

        toast({ title: `+${amount} XP! ✨`, description: reason });

        // Check for new avatar unlocks
        const newAvatars = UNLOCKABLE_AVATARS.filter(
          a => a.xpRequired <= newTotal && !unlockedAvatars.find(u => u.avatar_id === a.id)
        );
        for (const avatar of newAvatars) {
          const { data: unlocked } = await supabase.rpc('unlock_avatar', {
            p_avatar_id:   avatar.id,
            p_xp_required: avatar.xpRequired,
          });
          if (unlocked) {
            toast({ title: `🎉 New Avatar Unlocked!`, description: `You unlocked "${avatar.name}" ${avatar.emoji}` });
          }
        }
        if (newAvatars.length > 0) {
          setUnlockedAvatars(prev => [
            ...prev,
            ...newAvatars.map(a => ({ avatar_id: a.id, unlocked_at: new Date().toISOString() })),
          ]);
        }

        await checkBadges(newTotal);
      }
    } catch (error) {
      console.error('awardXP error:', error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChild, childSession, user, userXP, unlockedAvatars, toast]);

  // ── Check badges (parent path only — child badges are checked server-side) ─

  const checkBadges = useCallback(async (currentXP?: number) => {
    if (!user || isChild) return;

    const [completionsRes, journalRes, moodRes] = await Promise.all([
      supabase.from('activity_completions').select('activity_name').eq('user_id', user.id),
      supabase.from('journal_entries').select('id').eq('user_id', user.id),
      supabase.from('mood_entries').select('id').eq('user_id', user.id),
    ]);

    const completions = completionsRes.data || [];
    const stats: GamificationStats = {
      totalXP:          currentXP ?? userXP.total_xp,
      totalCompletions: completions.length,
      uniqueActivities: new Set(completions.map(c => (c as any).activity_name)).size,
      currentStreak:    userXP.current_streak,
      longestStreak:    userXP.longest_streak,
      journalEntries:   (journalRes.data || []).length,
      moodEntries:      (moodRes.data  || []).length,
      badgeCount:       earnedBadges.length,
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
      setEarnedBadges(prev => [
        ...prev,
        ...newBadges.map(b => ({ badge_id: b.id, earned_at: new Date().toISOString() })),
      ]);
    }
  }, [isChild, user, userXP, earnedBadges, role, toast]);

  // ── Badge/avatar lists filtered by role ────────────────────────────────────
  // For children use 'child' category; for parents use 'parent'.
  const effectiveRole = isChild ? 'child' : (role ?? 'child');

  return {
    userXP,
    earnedBadges,
    unlockedAvatars,
    loading,
    level:           getLevel(userXP.total_xp),
    levelProgress:   getXPForNextLevel(userXP.total_xp),
    awardXP,
    checkAndUpdateStreak,
    checkBadges,
    refreshData:     fetchGamificationData,
    allBadges:       BADGES.filter(b => b.category === effectiveRole || b.category === 'both'),
    allAvatars:      UNLOCKABLE_AVATARS,
  };
};
