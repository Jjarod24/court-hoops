import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Compass, Crosshair, Loader2, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { ArNavigator } from "@/components/ArNavigator";
import { ChallengeCamera } from "@/components/ChallengeCamera";
import { BallCard, type CardData } from "@/components/BallCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CHECKIN_RADIUS_M, distanceMeters, formatDistance } from "@/lib/geo";
import { rarityOdds } from "@/lib/rarity";
import { completeChallenge } from "@/lib/game.functions";

export const Route = createFileRoute("/court/$courtId")({
  head: () => ({
    meta: [
      { title: "Court details — CourtQuest" },
      {
        name: "description",
        content:
          "Check in at the court, navigate there in AR with a live compass arrow, and run a free-throw challenge to earn basketball cards.",
      },
      { property: "og:title", content: "Court details — CourtQuest" },
      {
        property: "og:description",
        content: "Navigate in AR, check in and shoot for cards at this CourtQuest court.",
      },
    ],
  }),
  component: CourtPage,
});

type Stage = "idle" | "navigating" | "shooting" | "results";

function CourtPage() {
  const { courtId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { position, error: geoError } = useGeolocation(true);
  const [stage, setStage] = useState<Stage>("idle");
  const [checkedIn, setCheckedIn] = useState(false);
  const [reward, setReward] = useState<{
    cards: CardData[];
    shotsMade: number;
    shotsTotal: number;
    xpGained: number;
  } | null>(null);

  const submitChallenge = useServerFn(completeChallenge);

  const { data, isLoading } = useQuery({
    queryKey: ["court", courtId],
    queryFn: async () => {
      const [{ data: court, error: cErr }, { data: challenges, error: chErr }] = await Promise.all([
        supabase
          .from("courts")
          .select("id, name, lat, lng, address, photo_url, difficulty")
          .eq("id", courtId)
          .maybeSingle(),
        supabase
          .from("challenges")
          .select("id, type, total_shots, difficulty")
          .eq("court_id", courtId),
      ]);
      if (cErr) throw cErr;
      if (chErr) throw chErr;
      return { court, challenges: challenges ?? [] };
    },
  });

  const court = data?.court ?? null;
  const challenge = data?.challenges[0] ?? null;

  const distance = useMemo(
    () =>
      position && court ? distanceMeters(position.lat, position.lng, court.lat, court.lng) : null,
    [position, court],
  );
  const inRange = distance != null && distance <= CHECKIN_RADIUS_M;

  const mutation = useMutation({
    mutationFn: async (made: number) => {
      if (!challenge || !court) throw new Error("Challenge unavailable");
      return submitChallenge({
        data: {
          challengeId: challenge.id,
          courtId: court.id,
          shotsMade: made,
          shotsTotal: challenge.total_shots,
        },
      });
    },
    onSuccess: (res) => {
      setReward({
        cards: res.cards as CardData[],
        shotsMade: res.shotsMade,
        shotsTotal: res.shotsTotal,
        xpGained: res.xpGained,
      });
      setStage("results");
      queryClient.invalidateQueries({ queryKey: ["collection"] });
      queryClient.invalidateQueries({ queryKey: ["profile-stats"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not save your run");
      setStage("idle");
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading court…
      </div>
    );
  }

  if (!court) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-display text-3xl">Court not found</h1>
        <Button asChild>
          <Link to="/">Back to map</Link>
        </Button>
      </div>
    );
  }

  const odds = rarityOdds(challenge?.difficulty ?? court.difficulty);

  if (stage === "navigating") {
    return <ArNavigator court={court} onClose={() => setStage("idle")} />;
  }

  if (stage === "shooting" && challenge) {
    return (
      <ChallengeCamera
        title="5 Free Throws"
        totalShots={challenge.total_shots}
        submitting={mutation.isPending}
        onClose={() => setStage("idle")}
        onComplete={(made) => mutation.mutate(made)}
      />
    );
  }

  if (stage === "results" && reward) {
    return (
      <PackOpening
        reward={reward}
        courtName={court.name}
        onDone={() => {
          setReward(null);
          setStage("idle");
        }}
      />
    );
  }

  return (
    <main className="min-h-screen px-4 pb-12 pt-5">
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to map
      </Link>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card-deep">
        <div className="flex h-36 items-end justify-between blaze-gradient p-4">
          <h1 className="max-w-[70%] font-display text-3xl leading-none text-primary-foreground">
            {court.name}
          </h1>
          <Badge className="bg-background/80 text-foreground">
            Difficulty {court.difficulty}/5
          </Badge>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-sm text-muted-foreground">{court.address}</p>
          <div className="flex items-center gap-2">
            <span className="font-display text-3xl">
              {distance == null ? "--" : formatDistance(distance)}
            </span>
            <span className="text-sm text-muted-foreground">
              {inRange ? "· you're here" : "· away"}
            </span>
          </div>
          {geoError && <p className="text-xs text-destructive">{geoError}</p>}

          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="secondary" onClick={() => setStage("navigating")}>
              <Compass /> Navigate in AR
            </Button>
            <Button
              disabled={!inRange || checkedIn}
              onClick={() => {
                setCheckedIn(true);
                toast.success(`Checked in at ${court.name}`);
              }}
              className={inRange && !checkedIn ? "pulse-ring" : ""}
            >
              <Crosshair /> {checkedIn ? "Checked in" : "Check In"}
            </Button>
          </div>
          {!inRange && (
            <p className="text-xs text-muted-foreground">
              Check-in unlocks within {CHECKIN_RADIUS_M}m of the court.
            </p>
          )}
        </div>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 font-display text-2xl">Challenges</h2>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-xl">
                {challenge ? `${challenge.total_shots} Free Throws` : "No challenge yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                Every make = 1 card. Perfect run = bonus XP.
              </p>
            </div>
            <Target className="h-6 w-6 text-primary" />
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[10px] uppercase tracking-wider">
            <OddsPill label="Common" value={odds.common} className="text-common" />
            <OddsPill label="Rare" value={odds.rare} className="text-rare" />
            <OddsPill label="Epic" value={odds.epic} className="text-epic" />
            <OddsPill label="Legend" value={odds.legendary} className="text-legendary" />
          </div>

          <div className="mt-4">
            {!user ? (
              <Button
                className="w-full"
                onClick={() =>
                  navigate({ to: "/auth", search: { redirect: `/court/${court.id}` } })
                }
              >
                Sign in to shoot
              </Button>
            ) : (
              <Button
                className="w-full"
                disabled={!checkedIn || !challenge}
                onClick={() => setStage("shooting")}
              >
                Start Challenge
              </Button>
            )}
            {user && !checkedIn && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Check in at the court first.
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function OddsPill({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className="rounded-lg bg-surface-2 py-2">
      <div className={`font-display text-base ${className}`}>{Math.round(value)}%</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  );
}

function PackOpening({
  reward,
  courtName,
  onDone,
}: {
  reward: { cards: CardData[]; shotsMade: number; shotsTotal: number; xpGained: number };
  courtName: string;
  onDone: () => void;
}) {
  const [opened, setOpened] = useState(false);

  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-10">
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{courtName}</p>
      <h1 className="mt-2 font-display text-6xl text-primary">
        {reward.shotsMade}/{reward.shotsTotal}
      </h1>
      <p className="font-display text-2xl">Hoops Made!</p>
      <p className="mt-1 text-sm text-muted-foreground">+{reward.xpGained} XP</p>

      {!opened ? (
        <div className="mt-10 flex flex-col items-center gap-6">
          <button
            onClick={() => setOpened(true)}
            className="h-64 w-44 rounded-2xl blaze-gradient shadow-blaze transition-transform hover:scale-105 active:scale-95"
            aria-label="Open your card pack"
          >
            <span className="font-display text-2xl text-primary-foreground">
              {reward.cards.length} CARD
              {reward.cards.length === 1 ? "" : "S"}
            </span>
          </button>
          <p className="text-sm text-muted-foreground">
            {reward.cards.length === 0
              ? "No makes, no cards. Run it back!"
              : "Tap the pack to reveal"}
          </p>
          {reward.cards.length === 0 && (
            <Button onClick={onDone} variant="secondary">
              Back to court
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="mt-8 grid w-full max-w-md grid-cols-2 gap-3">
            {reward.cards.map((card, i) => (
              <div key={i} className="card-reveal" style={{ animationDelay: `${i * 140}ms` }}>
                <BallCard card={card} />
              </div>
            ))}
          </div>
          <div className="mt-8 flex gap-3">
            <Button asChild variant="secondary">
              <Link to="/collection">View collection</Link>
            </Button>
            <Button onClick={onDone}>Back to court</Button>
          </div>
        </>
      )}
    </main>
  );
}
