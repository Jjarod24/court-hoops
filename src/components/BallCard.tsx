import { cn } from "@/lib/utils";
import { RARITY_LABEL, type Rarity } from "@/lib/rarity";

export type CardData = {
  id: string;
  name: string;
  rarity: string;
  artwork_url?: string | null;
  stats_json?: unknown;
};

type Stats = { shooting?: number; handles?: number; hops?: number; theme?: string };

const rarityRing: Record<Rarity, string> = {
  common: "from-common/60 to-common/10",
  rare: "from-rare/80 to-rare/10",
  epic: "from-epic/80 to-epic/10",
  legendary: "from-legendary/90 to-legendary/20",
};

const rarityText: Record<Rarity, string> = {
  common: "text-common",
  rare: "text-rare",
  epic: "text-epic",
  legendary: "text-legendary",
};

export function BallCard({
  card,
  count,
  meta,
  className,
}: {
  card: CardData;
  count?: number;
  meta?: string;
  className?: string;
}) {
  const rarity = (["common", "rare", "epic", "legendary"].includes(card.rarity)
    ? card.rarity
    : "common") as Rarity;
  const stats = (card.stats_json ?? {}) as Stats;
  const initials = card.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

  return (
    <div
      className={cn(
        "relative rounded-xl bg-gradient-to-b p-[2px] shadow-card-deep",
        rarityRing[rarity],
        className,
      )}
    >
      <div
        className={cn(
          "relative flex h-full flex-col overflow-hidden rounded-[calc(var(--radius)-2px)] bg-surface",
          rarity === "legendary" && "foil",
        )}
      >
        <div
          className="relative flex aspect-[4/3] items-center justify-center"
          style={{
            background: `radial-gradient(120% 100% at 50% 0%, ${stats.theme ?? "#f97316"}55, transparent 70%)`,
          }}
        >
          <span className="font-display text-5xl text-foreground/90">{initials}</span>
          {typeof count === "number" && count > 1 && (
            <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
              ×{count}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 border-t border-border px-3 py-2">
          <p className="truncate font-display text-lg leading-tight">{card.name}</p>
          <p className={cn("text-[11px] font-bold uppercase tracking-wider", rarityText[rarity])}>
            {RARITY_LABEL[rarity]}
          </p>
          <div className="mt-1 grid grid-cols-3 gap-1 text-center text-[10px] text-muted-foreground">
            <Stat label="SHT" value={stats.shooting} />
            <Stat label="HDL" value={stats.handles} />
            <Stat label="HOP" value={stats.hops} />
          </div>
          {meta && <p className="mt-1 truncate text-[10px] text-muted-foreground">{meta}</p>}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-md bg-surface-2 py-1">
      <div className="font-display text-sm text-foreground">{value ?? "--"}</div>
      <div>{label}</div>
    </div>
  );
}
