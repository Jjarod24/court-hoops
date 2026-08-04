export type Rarity = "common" | "rare" | "epic" | "legendary";

export const RARITY_ORDER: Rarity[] = ["common", "rare", "epic", "legendary"];

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

/**
 * Rarity odds scale with court/challenge difficulty (1-5).
 * Harder courts push weight from Common toward Epic/Legendary.
 */
export function rarityOdds(difficulty: number): Record<Rarity, number> {
  const d = Math.min(5, Math.max(1, difficulty));
  const legendary = 1 + d * 1.4;
  const epic = 4 + d * 2.6;
  const rare = 18 + d * 3;
  const common = Math.max(5, 100 - legendary - epic - rare);
  return { common, rare, epic, legendary };
}

export function rarityForDraw(difficulty: number): Rarity {
  const odds = rarityOdds(difficulty);
  const total = RARITY_ORDER.reduce((sum, r) => sum + odds[r], 0);
  let roll = Math.random() * total;
  for (const r of RARITY_ORDER) {
    roll -= odds[r];
    if (roll <= 0) return r;
  }
  return "common";
}
