/**
 * child-data — Child progress data gateway
 *
 * All child data writes (activities, mood, XP, badges) are routed through
 * this function instead of being written directly from the frontend.
 * This is necessary because children do NOT have Supabase auth.users rows,
 * so they cannot pass Supabase RLS checks.
 *
 * Authentication:
 *   Every request MUST include a child session JWT in the Authorization header.
 *   Format: Authorization: Bearer <child_session_token>
 *   The token is issued by the child-auth function and verified here using
 *   CHILD_SESSION_SECRET (HMAC-SHA256, same secret as child-auth).
 *
 * Actions (body field: "action"):
 *   record_activity  — record an activity completion
 *   save_mood        — upsert a mood entry for a date
 *   get_progress     — fetch activity completions + mood entries
 *   award_xp         — award XP to child (updates child_xp, checks badges)
 *   get_gamification — fetch XP + earned badges
 *
 * Required env vars:
 *   SUPABASE_URL            — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service_role key (server-side DB access)
 *   CHILD_SESSION_SECRET    — 32+ char secret (shared with child-auth)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")             ?? "";
const SERVICE_ROLE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SESSION_SECRET     = Deno.env.get("CHILD_SESSION_SECRET")     ?? "";

// ---------------------------------------------------------------------------
// Badge definitions (must stay in sync with src/data/gamificationData.ts)
// These are the child-applicable badges checked after each XP award.
// ---------------------------------------------------------------------------
const CHILD_BADGE_CHECKS: Array<{
  id: string;
  xpRequired?: number;
  completionsRequired?: number;
  streakRequired?: number;
}> = [
  { id: "first-step",         completionsRequired: 1   },
  { id: "explorer",           completionsRequired: 5   },
  { id: "adventurer",         completionsRequired: 10  },
  { id: "emotion-master",     completionsRequired: 25  },
  { id: "xp-starter",        xpRequired: 50            },
  { id: "xp-climber",        xpRequired: 200           },
  { id: "xp-champion",       xpRequired: 500           },
  { id: "streak-starter",    streakRequired: 3          },
  { id: "streak-warrior",    streakRequired: 7          },
  { id: "streak-legend",     streakRequired: 30         },
];

// ---------------------------------------------------------------------------
// Supabase admin client (service_role — bypasses RLS)
// ---------------------------------------------------------------------------
function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// JWT verification helpers
// ---------------------------------------------------------------------------
async function getSigningKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

interface ChildClaims {
  childId:     string;
  parentId:    string;
  username:    string;
  displayName: string | null;
}

/**
 * Verify a child session JWT (signed with CHILD_SESSION_SECRET, HS256).
 * Returns null if invalid, expired, or wrong role.
 */
async function verifyChildToken(token: string): Promise<ChildClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, claimsB64, sigB64] = parts;

  try {
    // Decode claims first (no signature yet) to check expiry quickly
    const padded    = claimsB64.replace(/-/g, "+").replace(/_/g, "/");
    const claimsRaw = atob(padded.padEnd(padded.length + (4 - padded.length % 4) % 4, "="));
    const claims    = JSON.parse(claimsRaw) as {
      sub: string; parent_id: string; username: string;
      display_name: string | null; role: string; exp: number;
    };

    if (claims.role !== "child") return null;
    if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) return null;

    // Verify HMAC signature
    const key       = await getSigningKey();
    const sigInput  = `${headerB64}.${claimsB64}`;
    const sigPadded = sigB64.replace(/-/g, "+").replace(/_/g, "/");
    const sigBytes  = Uint8Array.from(
      atob(sigPadded.padEnd(sigPadded.length + (4 - sigPadded.length % 4) % 4, "=")),
      (c) => c.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(sigInput)
    );

    if (!valid) return null;

    return {
      childId:     claims.sub,
      parentId:    claims.parent_id,
      username:    claims.username,
      displayName: claims.display_name ?? null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------
function ok(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify({ success: true, ...data }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400): Response {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Action: record_activity
// ---------------------------------------------------------------------------
async function handleRecordActivity(
  claims: ChildClaims,
  body: Record<string, unknown>
): Promise<Response> {
  const activityName = typeof body.activityName === "string" ? body.activityName.trim() : null;
  const activityType = typeof body.activityType === "string" ? body.activityType.trim() : "general";
  const eqTrait      = typeof body.eqTrait      === "string" ? body.eqTrait.trim()      : null;
  const notes        = typeof body.notes        === "string" ? body.notes.trim()        : null;

  if (!activityName) return err("activityName is required");

  const admin = adminClient();

  const { data, error } = await admin
    .from("activity_completions")
    .insert({
      child_account_id: claims.childId,
      user_id:          claims.parentId, // keep user_id populated for parent-viewing queries
      activity_name:    activityName,
      activity_type:    activityType,
      eq_trait:         eqTrait,
      notes:            notes,
      completed_at:     new Date().toISOString(),
    })
    .select("id, activity_name, activity_type, completed_at")
    .single();

  if (error) {
    console.error("child-data record_activity error:", error);
    return err("Failed to record activity", 500);
  }

  return ok({ completion: data });
}

// ---------------------------------------------------------------------------
// Action: save_mood
// ---------------------------------------------------------------------------
async function handleSaveMood(
  claims: ChildClaims,
  body: Record<string, unknown>
): Promise<Response> {
  const date      = typeof body.date      === "string" ? body.date      : null;
  const moodEmoji = typeof body.moodEmoji === "string" ? body.moodEmoji : null;
  const notes     = typeof body.notes     === "string" ? body.notes     : null;

  if (!date || !moodEmoji) return err("date and moodEmoji are required");

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err("date must be YYYY-MM-DD");

  const admin = adminClient();

  const { data, error } = await admin
    .from("mood_entries")
    .upsert(
      {
        child_account_id: claims.childId,
        user_id:          claims.parentId,
        date,
        mood_emoji:       moodEmoji,
        notes,
      },
      { onConflict: "child_account_id,date" }
    )
    .select("id, date, mood_emoji")
    .single();

  if (error) {
    console.error("child-data save_mood error:", error);
    return err("Failed to save mood", 500);
  }

  return ok({ entry: data });
}

// ---------------------------------------------------------------------------
// Action: get_progress
// ---------------------------------------------------------------------------
async function handleGetProgress(claims: ChildClaims): Promise<Response> {
  const admin = adminClient();

  const [activitiesRes, moodsRes] = await Promise.all([
    admin
      .from("activity_completions")
      .select("id, activity_name, activity_type, eq_trait, completed_at, notes")
      .eq("child_account_id", claims.childId)
      .order("completed_at", { ascending: false }),
    admin
      .from("mood_entries")
      .select("id, date, mood_emoji, notes, created_at")
      .eq("child_account_id", claims.childId)
      .order("date", { ascending: false }),
  ]);

  if (activitiesRes.error) {
    console.error("child-data get_progress activities error:", activitiesRes.error);
    return err("Failed to load activity progress", 500);
  }
  if (moodsRes.error) {
    console.error("child-data get_progress moods error:", moodsRes.error);
    return err("Failed to load mood data", 500);
  }

  return ok({
    activities: activitiesRes.data ?? [],
    moods:      moodsRes.data      ?? [],
  });
}

// ---------------------------------------------------------------------------
// Action: award_xp
// ---------------------------------------------------------------------------
async function handleAwardXP(
  claims: ChildClaims,
  body: Record<string, unknown>
): Promise<Response> {
  const amount = typeof body.amount === "number" ? Math.max(0, Math.floor(body.amount)) : 0;
  if (amount <= 0) return err("amount must be a positive integer");

  const admin = adminClient();

  // Upsert child_xp row — increment total_xp, handle streak
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // Fetch existing row
  const { data: existing } = await admin
    .from("child_xp")
    .select("total_xp, current_streak, longest_streak, last_active_date")
    .eq("child_account_id", claims.childId)
    .maybeSingle();

  const prevXP     = existing?.total_xp          ?? 0;
  const prevStreak = existing?.current_streak     ?? 0;
  const prevLong   = existing?.longest_streak     ?? 0;
  const lastDate   = existing?.last_active_date   ?? null;

  // Streak logic: +1 if last_active_date was yesterday, reset if older, keep if today
  let newStreak = prevStreak;
  if (lastDate) {
    const last  = new Date(lastDate);
    const now   = new Date(today);
    const diff  = Math.round((now.getTime() - last.getTime()) / 86400000);
    if (diff === 0)      newStreak = prevStreak;             // same day, no change
    else if (diff === 1) newStreak = prevStreak + 1;         // consecutive
    else                 newStreak = 1;                      // streak broken
  } else {
    newStreak = 1;
  }

  const newTotal  = prevXP + amount;
  const newLong   = Math.max(prevLong, newStreak);

  const xpRow = {
    child_account_id: claims.childId,
    total_xp:         newTotal,
    current_streak:   newStreak,
    longest_streak:   newLong,
    last_active_date: today,
    updated_at:       new Date().toISOString(),
  };

  const { error: upsertErr } = await admin
    .from("child_xp")
    .upsert(xpRow, { onConflict: "child_account_id" });

  if (upsertErr) {
    console.error("child-data award_xp upsert error:", upsertErr);
    return err("Failed to award XP", 500);
  }

  // Check for new badge unlocks (completions count needed)
  const { data: completions } = await admin
    .from("activity_completions")
    .select("id")
    .eq("child_account_id", claims.childId);

  const completionCount = completions?.length ?? 0;

  const { data: existingBadges } = await admin
    .from("child_badges")
    .select("badge_id")
    .eq("child_account_id", claims.childId);

  const earnedIds = new Set((existingBadges ?? []).map((b) => b.badge_id));
  const newBadges: string[] = [];

  for (const badge of CHILD_BADGE_CHECKS) {
    if (earnedIds.has(badge.id)) continue;
    const xpOk         = !badge.xpRequired         || newTotal      >= badge.xpRequired;
    const compOk        = !badge.completionsRequired || completionCount >= badge.completionsRequired;
    const streakOk      = !badge.streakRequired      || newStreak    >= badge.streakRequired;
    if (xpOk && compOk && streakOk) {
      newBadges.push(badge.id);
    }
  }

  if (newBadges.length > 0) {
    await admin.from("child_badges").insert(
      newBadges.map((badge_id) => ({
        child_account_id: claims.childId,
        badge_id,
      }))
    );
  }

  return ok({
    xp: {
      total_xp:        newTotal,
      current_streak:  newStreak,
      longest_streak:  newLong,
      last_active_date: today,
    },
    newBadges,
  });
}

// ---------------------------------------------------------------------------
// Action: get_gamification
// ---------------------------------------------------------------------------
async function handleGetGamification(claims: ChildClaims): Promise<Response> {
  const admin = adminClient();

  const [xpRes, badgesRes] = await Promise.all([
    admin
      .from("child_xp")
      .select("total_xp, current_streak, longest_streak, last_active_date")
      .eq("child_account_id", claims.childId)
      .maybeSingle(),
    admin
      .from("child_badges")
      .select("badge_id, earned_at")
      .eq("child_account_id", claims.childId),
  ]);

  if (xpRes.error) {
    console.error("child-data get_gamification xp error:", xpRes.error);
    return err("Failed to load gamification data", 500);
  }

  return ok({
    xp: xpRes.data ?? {
      total_xp: 0, current_streak: 0, longest_streak: 0, last_active_date: null,
    },
    badges: badgesRes.data ?? [],
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  if (req.method !== "POST") {
    return err("Method not allowed", 405);
  }

  // 1. Validate env
  if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
    console.error("child-data: CHILD_SESSION_SECRET is missing or too short");
    return err("Server configuration error", 500);
  }

  // 2. Verify child session token
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return err("Authorization header with child session token is required", 401);
  }

  const token  = authHeader.slice(7).trim();
  const claims = await verifyChildToken(token);

  if (!claims) {
    return err("Invalid or expired child session token", 401);
  }

  // 3. Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body", 400);
  }

  const action = typeof body.action === "string" ? body.action : "";

  // 4. Dispatch
  try {
    switch (action) {
      case "record_activity":  return await handleRecordActivity(claims, body);
      case "save_mood":        return await handleSaveMood(claims, body);
      case "get_progress":     return await handleGetProgress(claims);
      case "award_xp":         return await handleAwardXP(claims, body);
      case "get_gamification": return await handleGetGamification(claims);
      default:
        return err(`Unknown action: "${action}". Valid actions: record_activity, save_mood, get_progress, award_xp, get_gamification`);
    }
  } catch (e) {
    console.error(`child-data unhandled error in action "${action}":`, e);
    return err("An unexpected error occurred", 500);
  }
});
