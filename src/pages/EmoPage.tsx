import { EmoChat } from "@/components/EmoChat";
import { Card } from "@/components/ui/card";
import { Sparkles, MessageCircle, Compass } from "lucide-react";

const EmoPage = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <header className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-primary text-3xl shadow-fun mb-2">
          🤖
        </div>
        <h1 className="text-4xl font-bold font-comic bg-gradient-fun bg-clip-text text-transparent">
          Meet Emo
        </h1>
        <p className="text-muted-foreground font-comic max-w-xl mx-auto">
          Your friendly EMR Play guide. Ask Emo anything about the app — features, activities,
          how to track your mood, where to find parenting guides, and more.
        </p>
      </header>

      <div className="grid md:grid-cols-3 gap-3">
        <Card className="p-4 text-center bg-card/70">
          <Compass className="h-6 w-6 mx-auto mb-2 text-primary" />
          <p className="font-comic text-sm">Navigate the app</p>
        </Card>
        <Card className="p-4 text-center bg-card/70">
          <Sparkles className="h-6 w-6 mx-auto mb-2 text-accent" />
          <p className="font-comic text-sm">Discover features</p>
        </Card>
        <Card className="p-4 text-center bg-card/70">
          <MessageCircle className="h-6 w-6 mx-auto mb-2 text-fun-pink" />
          <p className="font-comic text-sm">Ask anything</p>
        </Card>
      </div>

      <EmoChat variant="page" />

      <p className="text-center text-xs text-muted-foreground font-comic">
        Chats with Emo are not saved — your conversation resets when you leave this page.
      </p>
    </div>
  );
};

export default EmoPage;