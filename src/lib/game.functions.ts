import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rarityForDraw } from "./rarity";

const completeInput = z.object({
  challengeId: z.string().uuid(),
  courtId: z.string().uuid(),
  shotsMade: z.number().int().min(0).max(50),
  shotsTotal: z.number().int().min(1).max(50),
});

export const completeChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => completeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: challenge, error: chErr } = await supabase
      .from("challenges")
      .select("id, court_id, total_shots, difficulty")
      .eq("id", data.challengeId)
      .maybeSingle();
    if (chErr) throw new Error(chErr.message);
    if (!challenge) throw new Error("Challenge not found");

    const shotsTotal = challenge.total_shots;
    const shotsMade = Math.min(data.shotsMade, shotsTotal);

    const { error: attErr } = await supabase.from("attempts").insert({
      user_id: userId,
      challenge_id: challenge.id,
      court_id: challenge.court_id,
      shots_made: shotsMade,
      shots_total: shotsTotal,
    });
    if (attErr) throw new Error(attErr.message);

    const { data: pool, error: poolErr } = await supabase
      .from("cards")
      .select("id, name, rarity, artwork_url, stats_json");
    if (poolErr) throw new Error(poolErr.message);

    const byRarity = new Map<string, typeof pool>();
    for (const card of pool ?? []) {
      const list = byRarity.get(card.rarity) ?? [];
      list.push(card);
      byRarity.set(card.rarity, list);
    }

    const drawn: NonNullable<typeof pool> = [];
    for (let i = 0; i < shotsMade; i++) {
      let rarity = rarityForDraw(challenge.difficulty ?? 1);
      let options = byRarity.get(rarity);
      while ((!options || options.length === 0) && rarity !== "common") {
        rarity =
          rarity === "legendary" ? "epic" : rarity === "epic" ? "rare" : "common";
        options = byRarity.get(rarity);
      }
      if (!options || options.length === 0) continue;
      drawn.push(options[Math.floor(Math.random() * options.length)]!);
    }

    if (drawn.length > 0) {
      const { error: ucErr } = await supabase.from("user_cards").insert(
        drawn.map((card) => ({
          user_id: userId,
          card_id: card.id,
          source_challenge_id: challenge.id,
          court_id: challenge.court_id,
        })),
      );
      if (ucErr) throw new Error(ucErr.message);
    }

    const xpGained = shotsMade * 25 + (shotsMade === shotsTotal ? 50 : 0);
    const { data: profile } = await supabase
      .from("profiles")
      .select("xp")
      .eq("id", userId)
      .maybeSingle();
    const newXp = (profile?.xp ?? 0) + xpGained;
    await supabase
      .from("profiles")
      .update({ xp: newXp, level: Math.floor(newXp / 500) + 1 })
      .eq("id", userId);

    return { cards: drawn, shotsMade, shotsTotal, xpGained, newXp };
  });
