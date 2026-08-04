import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BallCard, type CardData } from "@/components/BallCard";
import { BottomNav } from "@/components/BottomNav";
import { RARITY_LABEL, RARITY_ORDER, type Rarity } from "@/lib/rarity";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/collection")({
  head: () => ({
    meta: [
      { title: "My Collection — CourtQuest" },
      {
        name: "description",
        content:
          "Browse every basketball card you've earned on the blacktop, filtered by Common, Rare, Epic and Legendary rarity.",
      },
      { property: "og:title", content: "My Collection — CourtQuest" },
      {
        property: "og:description",
        content: "Every card you've pulled from real courts, in one binder.",
      },
    ],
  }),
  component: CollectionPage,
});

type Row = { count: number; card: CardData };

function CollectionPage() {
  const [filter, setFilter] = useState<Rarity | "all">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["collection"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("user_cards")
        .select("card_id, cards(id, name, rarity, artwork_url, stats_json)");
      if (error) throw error;
      const map = new Map<string, Row>();
      for (const r of rows ?? []) {
        const card = r.cards as unknown as CardData | null;
        if (!card) continue;
        const existing = map.get(card.id);
        if (existing) existing.count += 1;
        else map.set(card.id, { count: 1, card });
      }
      return [...map.values()];
    },
  });

  const rows = useMemo(() => {
    const list = data ?? [];
    const filtered = filter === "all" ? list : list.filter((r) => r.card.rarity === filter);
    return [...filtered].sort(
      (a, b) =>
        RARITY_ORDER.indexOf(b.card.rarity as Rarity) -
        RARITY_ORDER.indexOf(a.card.rarity as Rarity),
    );
  }, [data, filter]);

  const total = data?.reduce((sum, r) => sum + r.count, 0) ?? 0;

  return (
    <main className="min-h-screen px-4 pb-24 pt-6">
      <h1 className="font-display text-4xl leading-none">Collection</h1>
      <p className="text-sm text-muted-foreground">
        {total} card{total === 1 ? "" : "s"} · {data?.length ?? 0} unique
      </p>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="All" />
        {RARITY_ORDER.map((r) => (
          <FilterChip
            key={r}
            active={filter === r}
            onClick={() => setFilter(r)}
            label={RARITY_LABEL[r]}
          />
        ))}
      </div>

      {isLoading ? (
        <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your binder…
        </p>
      ) : rows.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="font-display text-2xl">Empty binder</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Head to a court, hit some free throws and pull your first card.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rows.map((row) => (
            <div key={row.card.id} className="relative">
              <BallCard card={row.card} />
              {row.count > 1 && (
                <span className="absolute right-2 top-2 rounded-full bg-background/90 px-2 py-0.5 font-display text-sm">
                  x{row.count}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <BottomNav />
    </main>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-surface text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
