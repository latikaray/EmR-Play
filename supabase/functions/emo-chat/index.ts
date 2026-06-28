// Emo - friendly AI help assistant for EMR Play
// Streams responses from Google Gemini API back to the browser.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are Emo, the cheerful and warm AI helper inside EMR Play —
a colorful emotional-wellness app for kids (ages 5-16) and their parents.

Your job:
- Help users understand WHAT the app does and HOW to use its features.
- Guide them step-by-step to the right page or activity.
- Keep answers SHORT (2-4 sentences), warm, encouraging, and easy to read.
- Use simple words for children; a slightly more practical tone for parents.
- Use a few emojis (💛 🌟 🎨 🧘 📖) sparingly to feel friendly.
- Never give medical, diagnostic, or crisis advice. If a child seems in danger
  or distress, gently suggest talking to a trusted adult or parent, and (for
  parents) suggest contacting a licensed professional.

About EMR Play:
- Purpose: build emotional intelligence, empathy, self-awareness and healthy
  parent-child connection through games, stories, journaling and reflection.
- Two roles: CHILD and PARENT, each with their own dashboard.

CHILD features (paths start with /activities):
- Draw Your Mood (/activities/draw) — express feelings on a canvas.
- Breathing exercises (/activities/breathing) — calm down with guided breaths.
- Gratitude Journal (/activities/gratitude) — write what you're thankful for.
- Emoji Match (/activities/emoji-match) & Emotion Wheel (/activities/emotion-wheel).
- Panchatantra Stories (/activities/story) — interactive empathy stories.
- Classroom Maze (/activities/classroom-maze).
- For teens (13-16): Conflict Role-Play, EQ Quiz, Peer Pressure Simulator
  and Guide (/activities/conflict-roleplay, /eq-quiz, /peer-pressure-sim,
  /peer-pressure-guide).
- Progress (/child-progress) and Badges/XP/Avatars (/badges).

PARENT features (paths start with /parent):
- /parent — dashboard
- /parent/role-play — empathy chatbot role-play
- /parent/quizzes — parenting quizzes
- /parent/journal — weekly parenting journal
- /parent/mini-games — patience timer & maze
- /parent/articles — interactive articles
- /parent/guide-library — full parenting guide library (ages 5-12 and 13-16)
- /parent/child-progress — view your linked child's progress.

Shared: /profile (avatar, account), /badges (achievements).

When a user asks "where do I find X", reply with: a 1-sentence what-it-does,
then "Tap [Feature Name] on the menu — or go to <path>." Keep paths in plain
text so the app can highlight them.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth: require a valid user JWT ---
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnon) {
      return new Response(
        JSON.stringify({ error: "Server misconfigured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
    const sb = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.slice(7).trim();
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing GEMINI_API_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { messages, role } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "messages must be an array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Input limits ---
    const MAX_MESSAGES = 20;
    const MAX_CONTENT = 2000;
    if (messages.length === 0 || messages.length > MAX_MESSAGES) {
      return new Response(
        JSON.stringify({ error: `messages must have 1-${MAX_MESSAGES} items` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    for (const m of messages) {
      if (
        !m ||
        (m.role !== "user" && m.role !== "assistant" && m.role !== "system") ||
        typeof m.content !== "string" ||
        m.content.length === 0 ||
        m.content.length > MAX_CONTENT
      ) {
        return new Response(
          JSON.stringify({ error: "Invalid message payload" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const roleHint = role === "parent"
      ? "\n\nThe current user is a PARENT. Tailor guidance for parents."
      : role === "child"
        ? "\n\nThe current user is a CHILD. Use simple, warm language."
        : "";

    const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gemini-1.5-flash",
        stream: true,
        messages: [
          { role: "system", content: SYSTEM_PROMPT + roleHint },
          ...messages,
        ],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      const status = upstream.status === 429 ? 429 : 500;
      return new Response(
        JSON.stringify({
          error: status === 429
            ? "Emo is a little tired — please try again in a moment."
            : `AI API error: ${text || upstream.statusText}`,
        }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Forward the SSE stream as-is.
    return new Response(upstream.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    console.error("emo-chat error:", err);
    return new Response(
      JSON.stringify({ error: "Emo had a hiccup. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});