import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ChevronDown, ChevronUp, Lightbulb, Heart, Users, Brain, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Activity {
  id: string;
  name: string;
  emoji: string;
  skill: "Self-Awareness" | "Self-Management" | "Social Awareness" | "Relationship Skills" | "Responsible Decision-Making";
  ages: string;
  time: string;
  materials: string;
  steps: string[];
  tip: string;
}

const skillMeta: Record<Activity["skill"], { icon: typeof Lightbulb; color: string; description: string }> = {
  "Self-Awareness": { icon: Lightbulb, color: "bg-fun-yellow", description: "Recognizing and understanding your own emotions" },
  "Self-Management": { icon: Brain, color: "bg-fun-teal", description: "Regulating emotions and managing stress" },
  "Social Awareness": { icon: Users, color: "bg-fun-pink", description: "Understanding and empathizing with others" },
  "Relationship Skills": { icon: Heart, color: "bg-accent", description: "Communicating, cooperating, and resolving conflict" },
  "Responsible Decision-Making": { icon: Sparkles, color: "bg-secondary", description: "Making caring, constructive choices" },
};

const activities: Activity[] = [
  {
    id: "gratitude-jar",
    name: "The Gratitude Jar",
    emoji: "🫙",
    skill: "Self-Awareness",
    ages: "5–12",
    time: "5 min daily",
    materials: "A jar, paper strips, pen",
    steps: [
      "Place a jar somewhere the family sees it daily.",
      "Each evening, everyone writes one thing they are grateful for.",
      "Fold the strip and drop it into the jar.",
      "At the end of the week, read them aloud together.",
      "Discuss how focusing on good things changed the week."
    ],
    tip: "For younger kids, let them draw their gratitude instead of writing."
  },
  {
    id: "feeling-charades",
    name: "Feeling Charades",
    emoji: "🎭",
    skill: "Self-Awareness",
    ages: "5–12",
    time: "15 min",
    materials: "Emotion cards (or make your own)",
    steps: [
      "Write emotions on slips of paper: happy, sad, frustrated, surprised, worried, excited.",
      "One person picks a card and acts out the emotion without words.",
      "The others guess which emotion it is.",
      "After guessing, ask: 'When do you feel that way?'",
      "Rotate until everyone has had a turn."
    ],
    tip: "Include complex emotions like 'embarrassed' or 'disappointed' for older kids."
  },
  {
    id: "emotion-wheel-checkin",
    name: "Emotion Wheel Check-In",
    emoji: "🎡",
    skill: "Self-Awareness",
    ages: "6–16",
    time: "5 min",
    materials: "Printable emotion wheel or draw one",
    steps: [
      "Print or draw a wheel with core emotions in the center and nuanced ones outside.",
      "Each morning, everyone points to the emotion they feel most.",
      "Share one reason why you feel that way—no pressure, just a sentence.",
      "Keep a weekly log to spot patterns.",
      "Celebrate when kids name subtle emotions like 'overwhelmed' or 'hopeful.'"
    ],
    tip: "Use the Emotion Wheel activity inside EMR Play for an interactive version."
  },
  {
    id: "breathing-buddy",
    name: "Breathing Buddy",
    emoji: "🧸",
    skill: "Self-Management",
    ages: "4–10",
    time: "5 min",
    materials: "A stuffed animal or pillow",
    steps: [
      "Lie down and place a stuffed animal on your belly.",
      "Breathe in slowly through the nose for 4 counts; watch the buddy rise.",
      "Hold for 2 counts.",
      "Breathe out through the mouth for 4 counts; watch the buddy fall.",
      "Repeat 5 times. Talk about how your body feels after."
    ],
    tip: "Name the buddy 'Calm Bear' or 'Breathe Bunny' to make it a ritual."
  },
  {
    id: "calm-down-bottle",
    name: "Calm-Down Bottle",
    emoji: "🍼",
    skill: "Self-Management",
    ages: "4–12",
    time: "20 min to make, 5 min to use",
    materials: "Clear bottle, water, glitter glue, food coloring",
    steps: [
      "Fill a clear bottle 3/4 with warm water.",
      "Add glitter glue and a few drops of food coloring.",
      "Seal tightly with glue or tape.",
      "When upset, shake the bottle and watch the glitter settle.",
      "Breathe slowly until the glitter falls—your mind settles too."
    ],
    tip: "Keep the bottle in a 'calm corner' where kids can retreat when overwhelmed."
  },
  {
    id: "worry-box",
    name: "Worry Box",
    emoji: "📦",
    skill: "Self-Management",
    ages: "6–14",
    time: "10 min",
    materials: "Shoebox, decorations, paper",
    steps: [
      "Decorate a shoebox together as the 'Worry Box.'",
      "When a worry pops up, write or draw it on paper.",
      "Fold it and place it inside the box.",
      "Agree to open the box once a week to review worries together.",
      "Notice which worries faded and which need a plan."
    ],
    tip: "This teaches kids that worries are temporary and sharing lightens the load."
  },
  {
    id: "emotion-thermometer",
    name: "Emotion Thermometer",
    emoji: "🌡️",
    skill: "Self-Management",
    ages: "5–12",
    time: "10 min",
    materials: "Paper, markers, thermometer outline",
    steps: [
      "Draw a thermometer from 1 (cool/blue) to 5 (hot/red).",
      "Label each level with behavior: 1 = calm, 3 = frustrated, 5 = explosive.",
      "When emotions rise, ask: 'What number are you right now?'",
      "Discuss what helps cool down at each level.",
      "Post it on the fridge as a family tool."
    ],
    tip: "Pair each level with a strategy: level 3 = take 5 deep breaths."
  },
  {
    id: "mirror-me",
    name: "Mirror Me",
    emoji: "🪞",
    skill: "Social Awareness",
    ages: "4–10",
    time: "10 min",
    materials: "None",
    steps: [
      "Stand facing your child like a mirror.",
      "One person leads slow movements; the other copies exactly.",
      "Switch leaders every minute.",
      "After 5 minutes, sit and talk: 'How did it feel to lead? To follow?'",
      "Connect it to empathy: 'Understanding others starts with paying attention.'"
    ],
    tip: "Play gentle music to make it feel like a dance, not a drill."
  },
  {
    id: "empathy-walk",
    name: "Empathy Walk",
    emoji: "🚶",
    skill: "Social Awareness",
    ages: "7–16",
    time: "20 min",
    materials: "None",
    steps: [
      "Take a walk around the neighborhood or park.",
      "Point out people, animals, or situations you see.",
      "Ask: 'What might they be feeling right now?'",
      "Discuss why they might feel that way.",
      "End with: 'How can we help someone feel better today?'"
    ],
    tip: "This builds the habit of perspective-taking in everyday life."
  },
  {
    id: "perspective-swap",
    name: "Perspective Swap",
    emoji: "🔄",
    skill: "Social Awareness",
    ages: "8–16",
    time: "15 min",
    materials: "Two chairs facing each other",
    steps: [
      "Pick a mild disagreement or story scenario.",
      "Child argues one side for 2 minutes.",
      "Switch chairs and argue the opposite side sincerely.",
      "Discuss: 'What did you learn from the other view?'",
      "Apply it to a real family situation."
    ],
    tip: "Start with fictional scenarios before real family conflicts."
  },
  {
    id: "kindness-bingo",
    name: "Kindness Bingo",
    emoji: "🎯",
    skill: "Relationship Skills",
    ages: "5–12",
    time: "One week",
    materials: "Bingo card printable or draw a 3×3 grid",
    steps: [
      "Fill squares with kind acts: 'Help a sibling,' 'Say thank you,' 'Share a toy,' 'Give a compliment.'",
      "Each time a child completes an act, they mark the square.",
      "Aim for a line or full card by week's end.",
      "Celebrate with a family reward like a movie night.",
      "Reflect: 'How did being kind make you feel?'"
    ],
    tip: "Let kids help write the bingo squares so they feel ownership."
  },
  {
    id: "compliment-chain",
    name: "Compliment Chain",
    emoji: "⛓️",
    skill: "Relationship Skills",
    ages: "5–14",
    time: "10 min",
    materials: "Paper strips, tape",
    steps: [
      "Cut colorful paper into strips.",
      "Each family member writes a genuine compliment for someone else.",
      "Link the strips into a paper chain.",
      "Hang it across the living room or bedroom.",
      "Add a new link every Sunday."
    ],
    tip: "Encourage specific compliments: 'I love how you helped me with math' beats 'You're nice.'"
  },
  {
    id: "story-sharing-circle",
    name: "Story Sharing Circle",
    emoji: "📖",
    skill: "Relationship Skills",
    ages: "4–14",
    time: "15 min",
    materials: "A small object to pass (a shell, stone, or toy)",
    steps: [
      "Sit in a circle and pass the 'talking object' around.",
      "Only the person holding it speaks; others listen without interrupting.",
      "Prompt: 'Share one thing that made you smile today.'",
      "Next round: 'Share one thing that was hard.'",
      "End with a group hug or high-five."
    ],
    tip: "Use this during dinner or before bedtime to build listening habits."
  },
  {
    id: "cooperation-tower",
    name: "Cooperation Tower",
    emoji: "🏗️",
    skill: "Relationship Skills",
    ages: "4–10",
    time: "15 min",
    materials: "Blocks, cups, or cardboard boxes",
    steps: [
      "Set a timer for 5 minutes.",
      "Two people build a tower together—no talking allowed!",
      "Observe how you communicate without words.",
      "Next round: build again, but this time talk and plan.",
      "Compare: Which tower was taller? Which felt better to build?"
    ],
    tip: "Debrief by asking: 'What was hard about not talking? What helped when you could talk?'"
  },
  {
    id: "active-listening-game",
    name: "Active Listening Game",
    emoji: "👂",
    skill: "Relationship Skills",
    ages: "6–14",
    time: "10 min",
    materials: "None",
    steps: [
      "One person tells a short story (1–2 minutes).",
      "The listener must repeat the story back as accurately as possible.",
      "The speaker corrects gently if details are wrong.",
      "Switch roles.",
      "Discuss: 'What helps you listen better?'"
    ],
    tip: "Start with silly stories to keep it light before trying real feelings."
  },
  {
    id: "conflict-roleplay",
    name: "Conflict Resolution Roleplay",
    emoji: "🤝",
    skill: "Relationship Skills",
    ages: "7–16",
    time: "20 min",
    materials: "None",
    steps: [
      "Pick a common conflict: sharing a toy, choosing a movie, or interrupting.",
      "Act out the scenario the 'wrong' way first (yelling, blaming).",
      "Discuss how it felt to watch and participate.",
      "Act it out again using 'I feel... when...' statements.",
      "Practice the calm version three times so it becomes natural."
    ],
    tip: "Use the Conflict Roleplay tool in EMR Play for guided teen scenarios."
  },
  {
    id: "decision-dice",
    name: "Decision Dice",
    emoji: "🎲",
    skill: "Responsible Decision-Making",
    ages: "6–12",
    time: "15 min",
    materials: "Blank wooden cube or paper cube template",
    steps: [
      "Label the dice with decision helpers: 'List pros & cons,' 'Ask for help,' 'Sleep on it,' 'Think about others,' 'Follow your gut,' 'Try a small step.'",
      "When a child faces a choice, they roll the dice.",
      "Apply the strategy that comes up.",
      "After deciding, reflect: 'Did the strategy help?'",
      "Keep the dice in a visible spot."
    ],
    tip: "This turns decision-making into a game rather than a source of anxiety."
  },
  {
    id: "problem-solving-steps",
    name: "Problem-Solving Steps",
    emoji: "🪜",
    skill: "Responsible Decision-Making",
    ages: "7–14",
    time: "20 min",
    materials: "Poster paper, markers",
    steps: [
      "Create a poster with 4 steps: 1) Name the problem, 2) Brainstorm solutions, 3) Pick one, 4) Try and review.",
      "When a real problem arises, walk through the poster together.",
      "Write possible solutions on sticky notes—no idea is silly.",
      "Vote on the best solution as a family.",
      "After trying it, ask: 'Did it work? What would we change?'"
    ],
    tip: "Post it in the kitchen so it becomes the default response to spills, messes, and squabbles."
  },
  {
    id: "goal-vision-board",
    name: "Goal-Setting Vision Board",
    emoji: "🖼️",
    skill: "Responsible Decision-Making",
    ages: "8–16",
    time: "30 min",
    materials: "Poster board, magazines, scissors, glue",
    steps: [
      "Talk about a goal: academic, emotional, or social.",
      "Find or draw images that represent the goal and the steps to get there.",
      "Arrange them on the board with milestones.",
      "Hang it where the child sees it daily.",
      "Check in monthly: 'What step are you on? What obstacle came up?'"
    ],
    tip: "Include both short-term (this week) and long-term (this year) goals."
  },
  {
    id: "mindful-coloring",
    name: "Mindful Coloring",
    emoji: "🎨",
    skill: "Self-Management",
    ages: "4–14",
    time: "15 min",
    materials: "Coloring pages and crayons or colored pencils",
    steps: [
      "Choose a coloring page together—mandalas work great.",
      "Set a calm mood with soft music or silence.",
      "Focus on the sensation of the pencil and the color choices.",
      "If the mind wanders, gently return attention to the page.",
      "Afterward, share: 'Did your mind feel quieter?'"
    ],
    tip: "Color side-by-side in silence to model mindfulness without lecturing."
  },
  {
    id: "family-feelings-journal",
    name: "Family Feelings Journal",
    emoji: "📓",
    skill: "Self-Awareness",
    ages: "5–16",
    time: "10 min per entry",
    materials: "Blank notebook or binder",
    steps: [
      "Dedicate a notebook as the family feelings journal.",
      "Each evening, anyone can write or draw one feeling and why.",
      "Read entries aloud once a week with curiosity, not judgment.",
      "Look for themes: 'I notice we all felt tired on Tuesdays.'",
      "Use it to plan self-care: 'What would help us all feel better?'"
    ],
    tip: "Parents should write entries too—modeling vulnerability builds trust."
  },
  {
    id: "apology-practice",
    name: "Apology & Forgiveness Practice",
    emoji: "💝",
    skill: "Relationship Skills",
    ages: "5–14",
    time: "10 min",
    materials: "None",
    steps: [
      "Teach the 3-part apology: 'I'm sorry for...' 'I know it hurt you because...' 'Next time I will...'",
      "Roleplay giving and receiving apologies with stuffed animals first.",
      "When a real conflict happens, prompt the 3 parts gently.",
      "Practice accepting apologies with 'Thank you for apologizing. I forgive you.'",
      "Celebrate repair moments: 'Look how strong our relationship is.'"
    ],
    tip: "Never force an apology; model it yourself and let kids join when ready."
  }
];

const SelActivitiesGuidePage = () => {
  const [openActivity, setOpenActivity] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<Activity["skill"] | "All">("All");

  const filtered = activeFilter === "All" ? activities : activities.filter(a => a.skill === activeFilter);
  const skillCounts = activities.reduce((acc, a) => {
    acc[a.skill] = (acc[a.skill] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const toggleActivity = (id: string) => {
    setOpenActivity(prev => prev === id ? null : id);
  };

  return (
    <div className="min-h-screen bg-gradient-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link to="/parent">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-fun bg-clip-text text-transparent font-comic">
              20+ Social Emotional Learning Activities for Parents and Kids at Home
            </h1>
            <p className="text-lg text-muted-foreground font-comic mt-2 max-w-3xl">
              Practical, play-based social emotional learning activities you can start today—no special training required.
            </p>
          </div>
        </div>

        {/* Introduction */}
        <Card className="mb-8 shadow-fun bg-card/80 backdrop-blur border-2 border-primary/20">
          <CardContent className="py-6">
            <h2 className="text-2xl font-bold font-comic text-foreground mb-3">What Is Social Emotional Learning?</h2>
            <p className="font-comic text-foreground/90 leading-relaxed mb-3">
              Social emotional learning (SEL) is the process through which children and adults understand and manage emotions, set and achieve positive goals, feel and show empathy for others, establish and maintain supportive relationships, and make responsible decisions. Research shows that kids with strong SEL skills do better in school, have healthier friendships, and report higher life satisfaction.
            </p>
            <p className="font-comic text-foreground/90 leading-relaxed">
              The good news? You do not need a classroom or a curriculum. The best social emotional learning activities happen at home, in the car, and at the dinner table. This guide collects 20+ easy, evidence-informed activities organized by the five core SEL competencies. Each activity lists the age range, time needed, materials, and simple steps so you can start in the next five minutes.
            </p>
          </CardContent>
        </Card>

        {/* Skill filter */}
        <div className="flex flex-wrap gap-2 mb-6 justify-center">
          <Button
            variant={activeFilter === "All" ? "fun" : "outline"}
            size="sm"
            className="font-comic"
            onClick={() => setActiveFilter("All")}
          >
            All ({activities.length})
          </Button>
          {Object.entries(skillMeta).map(([skill, meta]) => {
            const Icon = meta.icon;
            return (
              <Button
                key={skill}
                variant={activeFilter === skill ? "fun" : "outline"}
                size="sm"
                className="font-comic"
                onClick={() => setActiveFilter(skill as Activity["skill"])}
              >
                <Icon className="h-3 w-3 mr-1" />
                {skill} ({skillCounts[skill] || 0})
              </Button>
            );
          })}
        </div>

        {/* Activities grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          {filtered.map((activity) => {
            const meta = skillMeta[activity.skill];
            const isOpen = openActivity === activity.id;
            return (
              <Collapsible key={activity.id} open={isOpen} onOpenChange={() => toggleActivity(activity.id)}>
                <Card className="shadow-fun bg-card/80 backdrop-blur border-2 border-primary/20 hover:border-primary/40 transition-all">
                  <CollapsibleTrigger className="w-full text-left">
                    <CardHeader className="flex flex-row items-center justify-between cursor-pointer py-4">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{activity.emoji}</span>
                        <div>
                          <CardTitle className="font-comic text-foreground text-base sm:text-lg">{activity.name}</CardTitle>
                          <div className="flex flex-wrap gap-2 mt-1">
                            <Badge variant="outline" className={`font-comic text-xs ${meta.color} text-white border-0`}>
                              {activity.skill}
                            </Badge>
                            <Badge variant="secondary" className="font-comic text-xs">
                              Ages {activity.ages}
                            </Badge>
                            <Badge variant="secondary" className="font-comic text-xs">
                              {activity.time}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      {isOpen ? <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />}
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0 pb-5 space-y-4">
                      <div>
                        <p className="font-comic font-semibold text-primary text-sm mb-1">🧰 Materials:</p>
                        <p className="font-comic text-foreground/90 text-sm">{activity.materials}</p>
                      </div>
                      <div>
                        <p className="font-comic font-semibold text-primary text-sm mb-1">📋 Steps:</p>
                        <ol className="list-decimal list-inside space-y-1">
                          {activity.steps.map((step, i) => (
                            <li key={i} className="font-comic text-foreground/90 text-sm leading-relaxed">{step}</li>
                          ))}
                        </ol>
                      </div>
                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                        <p className="font-comic text-sm text-primary font-semibold">💡 Pro Tip:</p>
                        <p className="font-comic text-sm text-foreground/90">{activity.tip}</p>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>

        {/* How to use this guide */}
        <Card className="mb-8 shadow-fun bg-card/80 backdrop-blur border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="font-comic text-foreground text-xl">How to Use This Guide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="font-comic text-foreground/90 leading-relaxed">
              You do not need to do every activity. Pick one or two that fit your child's age and your family's schedule. Consistency matters more than variety. A five-minute daily ritual—like the Emotion Wheel check-in or the Gratitude Jar—builds SEL skills faster than a one-hour workshop once a month.
            </p>
            <p className="font-comic text-foreground/90 leading-relaxed">
              Many of these activities map directly to tools inside <strong>EMR Play</strong>. When you see a tip referencing the app, try the digital version for guided prompts, progress tracking, and gamified rewards that keep kids motivated.
            </p>
          </CardContent>
        </Card>

        {/* CTA */}
        <div className="text-center pb-8">
          <p className="font-comic text-muted-foreground mb-4">Want guided, trackable versions of these activities?</p>
          <Link to="/parent">
            <Button variant="fun" size="lg" className="font-comic">
              Explore EMR Play Parent Tools 🚀
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SelActivitiesGuidePage;
