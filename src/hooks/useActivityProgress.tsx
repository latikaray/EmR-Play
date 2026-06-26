/**
 * useActivityProgress — Phase D update
 *
 * Child path: fetches/writes via child-data edge function using childSession token.
 * Parent path: unchanged — reads/writes directly via Supabase with user.id.
 *
 * The hook auto-detects which path to use based on which auth context is active.
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useChildAuth } from "./useChildAuth";
import { useToast } from "./use-toast";

const CHILD_DATA_URL =
  "https://ecaimdsdugxouzaeyfub.supabase.co/functions/v1/child-data";

export interface ActivityCompletion {
  id: string;
  activity_name: string;
  activity_type: string;
  eq_trait?: string;
  completed_at: string;
  notes?: string;
  user_id?: string;
  child_user_id?: string;
  child_account_id?: string;
}

export interface ActivityProgress {
  activityId: string;
  activityName: string;
  completions: number;
  lastCompleted?: string;
  progress: number; // percentage based on expected completions
}

export const useActivityProgress = (childUserId?: string) => {
  const [activityCompletions, setActivityCompletions] = useState<ActivityCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, role } = useAuth();
  const { childSession } = useChildAuth();
  const { toast } = useToast();

  // Determine which auth path we are on
  const isChild        = !!childSession;
  const targetUserId   = childUserId || user?.id;
  const isParentViewing = role === 'parent' && childUserId;

  // ── Fetch ───────────────────────────────────────────────────────────────────

  const fetchActivityCompletions = useCallback(async () => {
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
          body: JSON.stringify({ action: "get_progress" }),
        });
        const data = await res.json();
        if (data.success) {
          setActivityCompletions(data.activities ?? []);
        }
      } else if (targetUserId) {
        // ── Parent / Supabase path (unchanged) ──
        let query = supabase
          .from('activity_completions')
          .select('*')
          .order('completed_at', { ascending: false });

        if (isParentViewing) {
          query = query.eq('child_user_id', childUserId);
        } else {
          query = query.eq('user_id', targetUserId);
        }

        const { data, error } = await query;
        if (error) throw error;
        setActivityCompletions(data || []);
      }
    } catch (error) {
      console.error('Error fetching activity completions:', error);
      toast({
        title: "Error",
        description: "Failed to load activity progress",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [isChild, childSession, targetUserId, isParentViewing, childUserId, toast]);

  // ── Record completion ───────────────────────────────────────────────────────

  const recordActivityCompletion = useCallback(async (
    activityName: string,
    activityType: string,
    eqTrait?: string,
    notes?: string
  ) => {
    if (!isChild && !user) return { error: "User not authenticated" };

    try {
      if (isChild) {
        // ── Child path ──
        const res = await fetch(CHILD_DATA_URL, {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${childSession!.token}`,
          },
          body: JSON.stringify({
            action: "record_activity",
            activityName,
            activityType,
            eqTrait:  eqTrait  || null,
            notes:    notes    || null,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error ?? "Failed to record activity");

        toast({
          title: "Great job! 🎉",
          description: `${activityName} completed successfully!`,
        });

        // Refresh local state
        await fetchActivityCompletions();
        return { success: true };
      } else {
        // ── Parent / Supabase path (unchanged) ──
        const completionData = {
          user_id:       user!.id,
          child_user_id: role === 'parent' ? childUserId : null,
          activity_name: activityName,
          activity_type: activityType,
          eq_trait:      eqTrait || null,
          notes:         notes   || null,
          completed_at:  new Date().toISOString()
        };

        const { error } = await supabase
          .from('activity_completions')
          .insert([completionData]);

        if (error) throw error;

        toast({
          title: "Great job! 🎉",
          description: `${activityName} completed successfully!`,
        });

        await fetchActivityCompletions();

        // XP is awarded separately via useGamification hook in components
        return { success: true };
      }
    } catch (error) {
      console.error('Error recording activity completion:', error);
      toast({
        title: "Error",
        description: "Failed to record activity completion",
        variant: "destructive"
      });
      return { error: "Failed to record completion" };
    }
  }, [isChild, childSession, user, role, childUserId, toast, fetchActivityCompletions]);

  // ── Derived stats ───────────────────────────────────────────────────────────

  const getActivityProgress = useCallback((activityId: string): ActivityProgress => {
    const relevantCompletions = activityCompletions.filter(
      completion => completion.activity_name.toLowerCase().replace(/\s+/g, '-') === activityId
    );

    const completions   = relevantCompletions.length;
    const lastCompleted = relevantCompletions[0]?.completed_at;
    const progress      = Math.min((completions * 20), 100);

    return {
      activityId,
      activityName: relevantCompletions[0]?.activity_name || activityId,
      completions,
      lastCompleted,
      progress
    };
  }, [activityCompletions]);

  const getTotalStats = useCallback(() => {
    const totalCompletions  = activityCompletions.length;
    const uniqueActivities  = new Set(activityCompletions.map(a => a.activity_name)).size;
    const uniqueEQTraits    = new Set(
      activityCompletions.map(a => a.eq_trait).filter(Boolean)
    ).size;

    return { totalCompletions, uniqueActivities, uniqueEQTraits };
  }, [activityCompletions]);

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isChild && !targetUserId) return;

    fetchActivityCompletions();

    // Real-time subscription only for parent/Supabase path.
    // Child path uses manual refresh after writes (edge fn doesn't emit Realtime events).
    if (!isChild && targetUserId) {
      const channel = supabase
        .channel('activity-progress-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'activity_completions',
            filter: isParentViewing
              ? `child_user_id=eq.${childUserId}`
              : `user_id=eq.${targetUserId}`
          },
          () => { fetchActivityCompletions(); }
        )
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [fetchActivityCompletions, isChild, targetUserId, isParentViewing, childUserId]);

  return {
    activityCompletions,
    loading,
    recordActivityCompletion,
    getActivityProgress,
    getTotalStats,
    refreshData: fetchActivityCompletions
  };
};