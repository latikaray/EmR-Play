import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Send,
  X,
  Sparkles,
  Heart,
  Activity,
  BarChart3,
  User,
  Award,
  BookOpen,
  Smile,
  Wind,
  Gamepad2,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export interface EmoMessage {
  role: "user" | "assistant";
  content: string;
}

const SUPABASE_URL = "https://ecaimdsdugxouzaeyfub.supabase.co";

const WELCOME: EmoMessage = {
  role: "assistant",
  content:
    "Hi! I'm **Emo** 💛 your little EMR Play helper. Ask me what this app does, or where to find any activity!",
};

const SUGGESTIONS = [
  "What is EMR Play?",
  "How do I track my mood?",
  "Where are the parenting guides?",
  "How do I earn badges?",
];

interface EmoChatProps {
  variant?: "floating" | "page";
  className?: string;
  onNavigate?: () => void;
}

type QuickAction = {
  label: string;
  to: string;
  icon: LucideIcon;
  tone: string;
};

const CHILD_ACTIONS: QuickAction[] = [
  { label: "Start an activity", to: "/activities", icon: Activity, tone: "bg-fun-teal/15 text-fun-teal border-fun-teal/30" },
  { label: "Log my mood", to: "/activities/draw", icon: Smile, tone: "bg-fun-pink/15 text-fun-pink border-fun-pink/30" },
  { label: "Breathing", to: "/activities/breathing", icon: Wind, tone: "bg-primary/10 text-primary border-primary/30" },
  { label: "My progress", to: "/child-progress", icon: BarChart3, tone: "bg-accent/15 text-accent border-accent/30" },
  { label: "Badges & XP", to: "/badges", icon: Award, tone: "bg-fun-yellow/20 text-foreground border-fun-yellow/40" },
  { label: "Update profile", to: "/profile", icon: User, tone: "bg-muted text-foreground border-border" },
];

const PARENT_ACTIONS: QuickAction[] = [
  { label: "Guide library", to: "/parent/guide-library", icon: BookOpen, tone: "bg-primary/10 text-primary border-primary/30" },
  { label: "Parenting quizzes", to: "/parent/quizzes", icon: Sparkles, tone: "bg-accent/15 text-accent border-accent/30" },
  { label: "Mini-games", to: "/parent/mini-games", icon: Gamepad2, tone: "bg-fun-teal/15 text-fun-teal border-fun-teal/30" },
  { label: "Journal", to: "/parent/journal", icon: BookOpen, tone: "bg-fun-pink/15 text-fun-pink border-fun-pink/30" },
  { label: "Child progress", to: "/parent/child-progress", icon: BarChart3, tone: "bg-fun-yellow/20 text-foreground border-fun-yellow/40" },
  { label: "Update profile", to: "/profile", icon: User, tone: "bg-muted text-foreground border-border" },
];

export const EmoChat = ({ variant = "page", className, onNavigate }: EmoChatProps) => {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<EmoMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const quickActions = useMemo<QuickAction[]>(
    () => (role === "parent" ? PARENT_ACTIONS : CHILD_ACTIONS),
    [role],
  );

  const goTo = (to: string) => {
    navigate(to);
    onNavigate?.();
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = async (text: string) => {
    const userMessage: EmoMessage = { role: "user", content: text };
    const history = [...messages, userMessage];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: "assistant",
            content: "Please sign in to chat with Emo. 💛",
          };
          return next;
        });
        return;
      }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/emo-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          role,
          messages: history
            .slice(-20)
            .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Something went wrong." }));
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: "assistant",
            content: data.error || "Emo had a hiccup. Please try again. 💔",
          };
          return next;
        });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              assistantText += delta;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: "assistant", content: assistantText };
                return next;
              });
            }
          } catch {
            // ignore non-JSON keepalives
          }
        }
      }
    } catch (err) {
      console.error("Emo chat error", err);
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: "assistant",
          content: "I couldn't reach my brain right now. Please try again in a moment. 💔",
        };
        return next;
      });
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = input.trim();
    if (!value || loading) return;
    send(value);
  };

  return (
    <div
      className={cn(
        "flex flex-col bg-card/95 backdrop-blur border-2 border-primary/30 rounded-3xl shadow-fun overflow-hidden",
        variant === "floating" ? "h-[520px] w-[360px] max-w-[calc(100vw-2rem)]" : "h-[70vh] min-h-[480px]",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-primary text-primary-foreground">
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-2xl">
          🤖
        </div>
        <div className="flex-1">
          <h3 className="font-comic font-bold text-lg leading-tight">Emo</h3>
          <p className="font-comic text-xs opacity-90">Your EMR Play helper</p>
        </div>
        <Sparkles className="h-5 w-5 animate-pulse" />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-background/40">
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
        {loading && messages[messages.length - 1]?.content === "" && (
          <div className="flex items-center gap-2 text-muted-foreground font-comic text-sm">
            <span className="inline-flex gap-1">
              <span className="w-2 h-2 rounded-full bg-primary animate-bounce" />
              <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.15s" }} />
              <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.3s" }} />
            </span>
            Emo is thinking...
          </div>
        )}
      </div>

      {/* Quick actions - always visible, role-aware */}
      <div className="px-3 pt-2 pb-1 border-t border-border/50 bg-card/60">
        <p className="text-[10px] uppercase tracking-wide font-comic text-muted-foreground mb-1.5 px-1">
          Quick jump
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
          {quickActions.map((a) => (
            <button
              key={a.to}
              onClick={() => goTo(a.to)}
              className={cn(
                "flex items-center gap-1.5 shrink-0 snap-start text-xs font-comic font-semibold px-3 py-1.5 rounded-full border transition-all hover:scale-105 active:scale-95",
                a.tone,
              )}
            >
              <a.icon className="h-3.5 w-3.5" />
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div className="px-3 pb-2 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              disabled={loading}
              className="text-xs font-comic px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 p-3 border-t border-border/50 bg-card">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Emo anything..."
          disabled={loading}
          className="flex-1 px-4 py-2 rounded-full bg-muted/50 border border-border focus:outline-none focus:ring-2 focus:ring-primary font-comic text-sm"
        />
        <Button
          type="submit"
          size="icon"
          disabled={loading || !input.trim()}
          className="rounded-full bg-gradient-primary text-primary-foreground hover:opacity-90"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
};

const MessageBubble = ({ message }: { message: EmoMessage }) => {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] px-4 py-2 rounded-2xl font-comic text-sm whitespace-pre-wrap break-words shadow-sm",
          isUser
            ? "bg-gradient-primary text-primary-foreground rounded-br-sm"
            : "bg-card border border-border text-foreground rounded-bl-sm",
        )}
      >
        <FormattedText text={message.content} />
      </div>
    </div>
  );
};

// Lightweight inline formatter: **bold** and converts /paths into Links.
const FormattedText = ({ text }: { text: string }) => {
  if (!text) return <span className="opacity-60">…</span>;
  // Split by markdown bold
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        // Replace bare /paths with Link components
        const segs = part.split(/(\s\/[a-z0-9/-]+)/g);
        return (
          <span key={i}>
            {segs.map((seg, j) => {
              const m = seg.match(/^\s(\/[a-z0-9/-]+)$/);
              if (m) {
                return (
                  <span key={j}>
                    {" "}
                    <Link to={m[1]} className="underline font-semibold hover:opacity-80">
                      {m[1]}
                    </Link>
                  </span>
                );
              }
              return <span key={j}>{seg}</span>;
            })}
          </span>
        );
      })}
    </>
  );
};

// ---------- Floating bubble wrapper ----------

export const EmoFloatingBubble = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-[60] flex flex-col items-end gap-3">
      {open && (
        <div className="animate-bounce-in">
          <EmoChat variant="floating" onNavigate={() => setOpen(false)} />
        </div>
      )}
      <Button
        onClick={() => setOpen((v) => !v)}
        size="icon"
        aria-label={open ? "Close Emo" : "Open Emo help"}
        className={cn(
          "w-14 h-14 rounded-full shadow-fun bg-gradient-primary text-primary-foreground hover:scale-110 transition-transform text-2xl",
        )}
      >
        {open ? <X className="h-6 w-6" /> : <span aria-hidden>🤖</span>}
      </Button>
      {!open && (
        <span className="hidden md:block absolute right-16 bottom-3 px-3 py-1 rounded-full bg-card border border-border shadow-sm text-xs font-comic flex items-center gap-1">
          <Heart className="h-3 w-3 text-fun-pink" /> Need help? Ask Emo!
        </span>
      )}
    </div>
  );
};

export default EmoChat;