/**
 * child-auth — Supabase Edge Function
 *
 * Handles all DB-backed child account operations. Children do NOT live in
 * auth.users. This function is the only trusted write path for child_accounts.
 *
 * Supported actions:
 *   create_child  — parent creates a child account (requires parent JWT)
 *   login         — child logs in with username + parentEmail + password
 *
 * Security model:
 *   - Uses SUPABASE_SERVICE_ROLE_KEY to call private.* SQL helpers
 *     (bypasses RLS; never exposed to client)
 *   - password_hash is computed here via bcrypt; raw password never stored
 *   - Child session tokens are signed JWTs using CHILD_SESSION_SECRET
 *   - Parent JWT is validated manually via supabase-js for create_child
 *
 * Phase B note:
 *   This function is NOT yet wired to the frontend (Phase C does that).
 *   It is deployed as parallel infrastructure and can be smoke-tested
 *   directly via curl / Supabase function invocations.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

// ---------------------------------------------------------------------------
// CORS — same policy as emo-chat
// ---------------------------------------------------------------------------
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY   = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SESSION_SECRET      = Deno.env.get("CHILD_SESSION_SECRET")!;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a Supabase admin client that bypasses RLS. */
function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/** Build a Supabase anon client to validate a caller's JWT. */
function anonClient(authHeader: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}

/** Derive a CryptoKey from the session secret for HS256 JWT signing. */
async function getSigningKey(): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(SESSION_SECRET);
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Sign a child session JWT.
 *
 * Claims:
 *   sub          child_accounts.id
 *   parent_id    parent auth.users.id
 *   username     child username
 *   display_name child display name (may be null)
 *   role         "child" (literal)
 *   iat          issued-at (epoch seconds)
 *   exp          expiry (7 days from now)
 */
async function signChildToken(payload: {
  childId: string;
  parentId: string;
  username: string;
  displayName: string | null;
}): Promise<string> {
  const key = await getSigningKey();
  const now = Math.floor(Date.now() / 1000);

  return create(
    { alg: "HS256", typ: "JWT" },
    {
      sub:          payload.childId,
      parent_id:    payload.parentId,
      username:     payload.username,
      display_name: payload.displayName ?? null,
      role:         "child",
      iat:          now,
      exp:          getNumericDate(60 * 60 * 24 * 7), // 7 days
    },
    key
  );
}

/** Consistent JSON error response. */
function err(message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status, headers: { ...CORS, "Content-Type": "application/json" } }
  );
}

/** Consistent JSON success response. */
function ok(data: unknown, status = 200): Response {
  return new Response(
    JSON.stringify({ success: true, ...data }),
    { status, headers: { ...CORS, "Content-Type": "application/json" } }
  );
}

// ---------------------------------------------------------------------------
// Action: create_child
// ---------------------------------------------------------------------------
/**
 * Creates a new child account under the calling parent.
 *
 * Required body fields:
 *   action       "create_child"
 *   username     3–30 chars, [a-zA-Z0-9_]
 *   password     8+ chars (plain text; hashed here, never stored raw)
 *   displayName  optional display name
 *
 * Requires:
 *   Authorization: Bearer <parent Supabase JWT>
 *
 * The parent JWT is validated against Supabase; the caller's uid becomes
 * the parent_user_id for the new child row.
 */
async function handleCreateChild(
  req: Request,
  body: Record<string, unknown>
): Promise<Response> {
  // 1. Validate parent JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return err("Authorization header with parent JWT is required", 401);
  }

  const parentClient = anonClient(authHeader);
  const token = authHeader.slice(7).trim();
  const { data: { user: parentUser }, error: authErr } =
    await parentClient.auth.getUser(token);

  if (authErr || !parentUser) {
    return err("Invalid or expired parent token", 401);
  }

  // 2. Confirm the caller is actually a parent (check user_roles)
  const admin = adminClient();
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", parentUser.id)
    .maybeSingle();

  if (!roleRow || roleRow.role !== "parent") {
    return err("Only parent accounts can create child accounts", 403);
  }

  // 3. Parse and validate inputs
  const username    = typeof body.username    === "string" ? body.username.trim()    : null;
  const password    = typeof body.password    === "string" ? body.password           : null;
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : null;

  if (!username || username.length < 3 || username.length > 30) {
    return err("username must be 3–30 characters");
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return err("username may only contain letters, numbers, and underscores");
  }
  if (!password || password.length < 8) {
    return err("password must be at least 8 characters");
  }

  // 4. Hash password with bcrypt (cost 12)
  const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt(12));

  // 5. Insert via private helper (service_role)
  const { data: rows, error: insertErr } = await admin.rpc(
    // We call the private function directly from the admin client.
    // Supabase exposes private.* RPCs only to service_role.
    "create_child_account" as never,
    {
      p_parent_user_id: parentUser.id,
      p_username:       username.toLowerCase(),
      p_display_name:   displayName,
      p_password_hash:  passwordHash,
    } as never,
    // Use the private schema prefix
  );

  // Fallback: call via raw SQL if the RPC alias doesn't work
  // (private-schema RPCs aren't always auto-exposed by PostgREST).
  // We use the admin client's from() + rpc() targeting private directly.
  if (insertErr) {
    // Try direct table insert as the admin client bypasses RLS
    const { data: inserted, error: directErr } = await admin
      .from("child_accounts")
      .insert({
        parent_user_id: parentUser.id,
        username:       username.toLowerCase(),
        display_name:   displayName,
        password_hash:  passwordHash,
      })
      .select("id, parent_user_id, username, display_name, avatar_url, created_at")
      .single();

    if (directErr) {
      // 23505 = unique_violation (duplicate username under same parent)
      if (directErr.code === "23505") {
        return err(
          `A child named "${username.toLowerCase()}" already exists under your account. Please choose a different username.`,
          409
        );
      }
      console.error("child-auth create_child error:", directErr);
      return err("Failed to create child account", 500);
    }

    return ok({
      child: {
        id:          inserted.id,
        parentId:    inserted.parent_user_id,
        username:    inserted.username,
        displayName: inserted.display_name,
        avatarUrl:   inserted.avatar_url,
        createdAt:   inserted.created_at,
      },
    }, 201);
  }

  // Success via RPC path
  const child = Array.isArray(rows) ? rows[0] : rows;
  return ok({
    child: {
      id:          child.id,
      parentId:    child.parent_user_id,
      username:    child.username,
      displayName: child.display_name,
      avatarUrl:   child.avatar_url,
      createdAt:   child.created_at,
    },
  }, 201);
}

// ---------------------------------------------------------------------------
// Action: login
// ---------------------------------------------------------------------------
/**
 * Logs in a child using username + parentEmail + password.
 *
 * Login identifier strategy: username + parentEmail
 *
 * Rationale: usernames are unique PER PARENT, not globally. If two parents
 * both create a child named "alex", a plain username lookup is ambiguous.
 * The cleanest scope discriminator that a child already knows is their
 * parent's email address (the parent told them their login details when
 * setting up the account). This avoids any new UI concept while being
 * unambiguous.
 *
 * Required body fields:
 *   action       "login"
 *   username     child's username
 *   parentEmail  parent's registered email (used to resolve parent_user_id)
 *   password     plain text (verified server-side; never stored or returned)
 *
 * No Authorization header required — this is an unauthenticated login
 * endpoint (the function itself is the trust boundary).
 *
 * On success returns a signed child session token and safe child metadata.
 */
async function handleLogin(body: Record<string, unknown>): Promise<Response> {
  const username    = typeof body.username    === "string" ? body.username.trim().toLowerCase() : null;
  const parentEmail = typeof body.parentEmail === "string" ? body.parentEmail.trim().toLowerCase() : null;
  const password    = typeof body.password    === "string" ? body.password : null;

  // Validate presence (intentionally vague in error messages to avoid enumeration)
  if (!username || !parentEmail || !password) {
    return err("username, parentEmail, and password are required", 400);
  }

  const admin = adminClient();

  // 1. Resolve parent by email → get their auth.users.id
  //    We query auth.users via the admin client (service_role can access auth schema).
  const { data: parentRow, error: parentErr } = await admin
    .from("users" as never) // admin client hits auth.users via the REST admin API
    .select("id")
    .eq("email", parentEmail)
    .single();

  // If the direct auth.users query fails (PostgREST doesn't expose auth.users),
  // fall back to the private RPC helper.
  let parentId: string | null = null;

  if (!parentErr && parentRow) {
    parentId = (parentRow as { id: string }).id;
  } else {
    // Use our private.resolve_parent_by_email helper via rpc
    // Called with service_role so the private function executes.
    const { data: resolved } = await admin.rpc(
      "resolve_parent_by_email" as never,
      { p_email: parentEmail } as never
    );
    parentId = resolved as string | null;
  }

  if (!parentId) {
    // Vague: don't reveal that the parent email doesn't exist
    return err("Invalid credentials", 401);
  }

  // 2. Fetch child row by (parent_user_id, username) — includes password_hash
  //    The admin client bypasses RLS so it can read password_hash.
  const { data: child, error: childErr } = await admin
    .from("child_accounts")
    .select("*")
    .eq("parent_user_id", parentId)
    .eq("username", username)
    .maybeSingle();

  if (childErr || !child) {
    // Vague: don't reveal whether username or parentEmail was wrong
    return err("Invalid credentials", 401);
  }

  // 3. Verify password with bcrypt (constant-time comparison)
  const passwordValid = await bcrypt.compare(password, child.password_hash);
  if (!passwordValid) {
    return err("Invalid credentials", 401);
  }

  // 4. Issue signed child session token
  const token = await signChildToken({
    childId:     child.id,
    parentId:    child.parent_user_id,
    username:    child.username,
    displayName: child.display_name,
  });

  // 5. Return token + safe metadata (no password_hash)
  return ok({
    session: {
      token,
      childId:     child.id,
      parentId:    child.parent_user_id,
      username:    child.username,
      displayName: child.display_name,
      avatarUrl:   child.avatar_url,
      role:        "child",
    },
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  // Only POST is supported
  if (req.method !== "POST") {
    return err("Method not allowed", 405);
  }

  // Validate required env vars are present at runtime
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    console.error("child-auth: missing required env vars");
    return err("Server misconfigured", 500);
  }
  if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
    console.error("child-auth: CHILD_SESSION_SECRET is missing or too short");
    return err("Server misconfigured", 500);
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Request body must be valid JSON", 400);
  }

  const action = typeof body.action === "string" ? body.action : null;
  if (!action) {
    return err('Missing required field: "action"', 400);
  }

  // Route to action handlers
  try {
    switch (action) {
      case "create_child":
        return await handleCreateChild(req, body);

      case "login":
        return await handleLogin(body);

      default:
        return err(`Unknown action: "${action}"`, 400);
    }
  } catch (e) {
    console.error("child-auth unhandled error:", e);
    return err("An unexpected error occurred", 500);
  }
});
