import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, LogOut, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Player Profile — CourtQuest" },
      {
        name: "description",
        content:
          "Track your CourtQuest level, XP, courts played, shooting accuracy and where you rank on the global leaderboard.",
      },
      { property: "og:title", content: "Player Profile — CourtQuest" },
      {
        property: "og:description",
        content: "Your XP, level and leaderboard standing on the CourtQuest blacktop.",
      },
    ],
  }),
  component: ProfilePage,
});

const XP_PER_LEVEL = 250;

function ProfilePage() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["profile-stats"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      const [profileRes, attemptsRes, cardsRes, boardRes] = await Promise.all([
        supabase.from("profiles").select("id, username, xp, level").eq("id", uid!).maybeSingle(),
        supabase.from("attempts").select("court_id, shots_made, shots_total"),
        supabase.from("user_cards").select("id"),
        supabase
          .from("profiles")
          .select("id, username, xp, level")
          .order("xp", { ascending: false })
          .limit(10),
      ]);
      if (profileRes.error) throw profileRes.error;
      const attempts = attemptsRes.data ?? [];
      const made = attempts.reduce((s, a) => s + a.shots_made, 0);
      const taken = attempts.reduce((s, a) => s + a.shots_total, 0);
      return {
        uid,
        profile: profileRes.data,
        courts: new Set(attempts.map((a) => a.court_id)).size,
        made,
        taken,
        cards: cardsRes.data?.length ?? 0,
        board: boardRes.data ?? [],
      };
    },
  });

  if (isLoading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading profile…
      </div>
    );
  }

  const xp = data.profile?.xp ?? 0;
  const level = data.profile?.level ?? 1;
  const intoLevel = xp % XP_PER_LEVEL;
  const accuracy = data.taken ? Math.round((data.made / data.taken) * 100) : 0;

  return (
    <main className="min-h-screen px-4 pb-24 pt-6">
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card-deep">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full blaze-gradient font-display text-3xl text-primary-foreground">
            {(data.profile?.username ?? "P").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-3xl leading-none">
              {data.profile?.username ?? "Player"}
            </p>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Level {level} · {xp} XP
            </p>
          </div>
        </div>
        <div className="mt-4">
          <Progress value={(intoLevel / XP_PER_LEVEL) * 100} />
          <p className="mt-1 text-xs text-muted-foreground">
            {XP_PER_LEVEL - intoLevel} XP to level {level + 1}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatBox label="Courts" value={data.courts} />
        <StatBox label="Accuracy" value={`${accuracy}%`} />
        <StatBox label="Cards" value={data.cards} />
      </div>

      <section className="mt-6">
        <h2 className="mb-2 flex items-center gap-2 font-display text-2xl">
          <Trophy className="h-5 w-5 text-primary" /> Leaderboard
        </h2>
        <ol className="overflow-hidden rounded-2xl border border-border bg-surface">
          {data.board.map((p, i) => (
            <li
              key={p.id}
              className={`flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 ${
                p.id === data.uid ? "bg-primary/10" : ""
              }`}
            >
              <span className="w-6 font-display text-lg text-muted-foreground">{i + 1}</span>
              <span className="flex-1 truncate font-semibold">{p.username ?? "Player"}</span>
              <span className="font-display text-lg">{p.xp}</span>
            </li>
          ))}
          {data.board.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              No ranked players yet.
            </li>
          )}
        </ol>
      </section>

      <Button
        variant="secondary"
        className="mt-6 w-full"
        onClick={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/" });
        }}
      >
        <LogOut /> Sign out
      </Button>

      <BottomNav />
    </main>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 text-center">
      <p className="font-display text-2xl">{value}</p>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
  );
}
