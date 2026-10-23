import type { CounterPeriod } from "./sold-counter";

/**
 * Des chiffres d'EXEMPLE pour montrer les essais de Performances quand la base locale n'a aucune vente terminée
 * (fondateur, 23 oct. 2026). Toujours signalés à l'écran « Chiffres d'exemple » ; jamais utilisés hors des pages d'essai.
 */
function period(key: string, label: string, sold: number, revenueCents: number, withAdvice: number, sales: number): CounterPeriod {
  const share = sales > 0 ? withAdvice / sales : null;
  return {
    key,
    label,
    sold,
    revenue: (revenueCents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" }),
    salesWithAdvice: `${withAdvice.toLocaleString("fr-FR")} sur ${sales.toLocaleString("fr-FR")} (${share === null ? "—" : `${Math.round(share * 1000) / 10} %`.replace(".", ",")})`,
    sales,
    share,
  };
}

export const EXAMPLE_PHARMACY: CounterPeriod[] = [
  period("jour", "Aujourd'hui", 9, 13_840, 8, 71),
  period("semaine-en-cours", "Cette semaine", 41, 62_310, 36, 352),
  period("mois-en-cours", "Ce mois-ci", 187, 281_450, 161, 1_486),
  period("annee", "Cette année", 1_642, 2_473_900, 1_398, 14_210),
];

export const EXAMPLE_ME: CounterPeriod[] = [
  period("jour", "Aujourd'hui", 3, 4_590, 3, 18),
  period("semaine-en-cours", "Cette semaine", 11, 16_870, 10, 84),
  period("mois-en-cours", "Ce mois-ci", 46, 69_120, 41, 362),
  period("annee", "Cette année", 402, 598_300, 351, 3_390),
];

export const EXAMPLE_TEAM = [
  { who: "Emma Rivière", sold: 52, revenueCents: 78_400, sales: 341 },
  { who: "Hugo Lambert", sold: 46, revenueCents: 69_120, sales: 362 },
  { who: "Léa Bernard", sold: 38, revenueCents: 55_960, sales: 298 },
  { who: "Claire Dumont", sold: 27, revenueCents: 41_230, sales: 214 },
  { who: "Sophie Ould", sold: 15, revenueCents: 22_870, sales: 167 },
  { who: "Yanis Costa", sold: 9, revenueCents: 13_870, sales: 104 },
];

export const EXAMPLE_PRODUCTS = [
  { name: "Ultra-levure 200 mg", sold: 24, revenueCents: 22_560 },
  { name: "Arkogélules Charbon végétal", sold: 19, revenueCents: 17_860 },
  { name: "Mag 2 24 H", sold: 17, revenueCents: 21_080 },
  { name: "Hydratis goût fraise", sold: 15, revenueCents: 10_350 },
  { name: "Thérapearl Yeux", sold: 11, revenueCents: 16_390 },
  { name: "Vitamine C UPSA 1000 mg", sold: 9, revenueCents: 4_950 },
];
