import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, Navigation, Crosshair } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "@/hooks/useGeolocation";
import { CourtMap } from "@/components/CourtMap";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { CHECKIN_RADIUS_M, distanceMeters, formatDistance } from "@/lib/geo";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CourtQuest — Court Discovery Map" },
      {
        name: "description",
        content:
          "Discover basketball courts near you on the CourtQuest map, check in when you arrive, and start shooting challenges to earn collectible cards.",
      },
      { property: "og:title", content: "CourtQuest — Court Discovery Map" },
      {
        property: "og:description",
        content:
          "Find real basketball courts near you, hit your shots and collect cards. CourtQuest turns the blacktop into a game.",
      },
    ],
  }),
  component: MapPage,
});

function MapPage() {
  const { position, error: geoError } = useGeolocation(true);
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: courts, isLoading } = useQuery({
    queryKey: ["courts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courts")
        .select("id, name, lat, lng, address, photo_url, difficulty");
      if (error) throw error;
      return data;
    },
  });

  const withDistance = useMemo(() => {
    if (!courts) return [];
    return courts
      .map((c) => ({
        ...c,
        distance: position
          ? distanceMeters(position.lat, position.lng, c.lat, c.lng)
          : Number.POSITIVE_INFINITY,
      }))
      .sort((a, b) => a.distance - b.distance);
  }, [courts, position]);

  const selected = withDistance.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="min-h-screen pb-20">
      <header className="flex items-center justify-between px-4 pb-3 pt-5">
        <div>
          <h1 className="font-display text-3xl leading-none text-primary">CourtQuest</h1>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Find courts · hit shots · collect cards
          </p>
        </div>
        {!user && (
          <Button asChild size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        )}
      </header>

      <div className="relative mx-3 h-[52vh] overflow-hidden rounded-2xl border border-border shadow-card-deep">
        <CourtMap
          courts={withDistance}
          center={position ? { lat: position.lat, lng: position.lng } : null}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {!position && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-background/85 px-4 py-2 text-center text-xs text-muted-foreground">
            {geoError ?? "Locating you…"}
          </div>
        )}
      </div>

      {selected && (
        <div className="mx-3 mt-3 rounded-2xl border border-primary/40 bg-surface p-4 shadow-blaze">
          <p className="font-display text-2xl leading-none">{selected.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{selected.address}</p>
          <div className="mt-3 flex items-center gap-3">
            <Button asChild className="flex-1">
              <Link to="/court/$courtId" params={{ courtId: selected.id }}>
                <Navigation /> Open court
              </Link>
            </Button>
            <span className="font-display text-xl">
              {Number.isFinite(selected.distance) ? formatDistance(selected.distance) : "--"}
            </span>
          </div>
        </div>
      )}

      <section className="mt-5 px-4">
        <h2 className="mb-2 font-display text-xl">Nearby courts</h2>
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading courts…
          </p>
        )}
        <ul className="space-y-2">
          {withDistance.map((court) => {
            const inRange = court.distance <= CHECKIN_RADIUS_M;
            return (
              <li key={court.id}>
                <Link
                  to="/court/$courtId"
                  params={{ courtId: court.id }}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:border-primary/60"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full blaze-gradient text-primary-foreground">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{court.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Difficulty {court.difficulty}/5 · {court.address}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-lg">
                      {Number.isFinite(court.distance) ? formatDistance(court.distance) : "--"}
                    </p>
                    {inRange && (
                      <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-success">
                        <Crosshair className="h-3 w-3" /> In range
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <BottomNav />
    </div>
  );
}
