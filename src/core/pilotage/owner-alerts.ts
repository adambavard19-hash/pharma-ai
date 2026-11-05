/**
 * Les alertes de la « Vue d'ensemble » du titulaire (fondateur, 5 nov. 2026) : ce qui demande son attention aujourd'hui, en
 * une phrase, avec où cliquer. Calculées à partir de ce que les autres rubriques savent déjà (dates courtes, surstock,
 * produits manquants) : rien de neuf n'est stocké, rien n'est envoyé.
 */

export type OwnerAlertTone = "danger" | "warning" | "success" | "info";

export type OwnerAlert = { key: string; tone: OwnerAlertTone; text: string; href: string; cta: string };

export type OwnerAlertsInput = {
  /** Les lots suivis dans « Dates courtes » (jours restants, quantité, nom). */
  lots: { label: string; daysLeft: number; quantity: number | null }[];
  /** Les campagnes Surstock (en cours et terminées). */
  campaigns: { productName: string; isActive: boolean; endedReason: string | null; endedAt: Date | null; endsOn: string | null; quantity: number; targetQuantity: number }[];
  /** Les besoins que le stock n'a pas couverts (30 derniers jours), du plus fréquent au moins fréquent. */
  gaps: { title: string; count: number }[];
  now: Date;
  /** Aujourd'hui à l'officine, « AAAA-MM-JJ ». */
  today: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** Un besoin demandé au moins autant de fois sans produit en stock mérite une alerte. */
export const GAP_ALERT_MIN = 3;

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T12:00:00Z`) - Date.parse(`${fromKey}T12:00:00Z`)) / DAY_MS);
}

export function buildOwnerAlerts(input: OwnerAlertsInput): OwnerAlert[] {
  const alerts: OwnerAlert[] = [];

  const expired = input.lots.filter((lot) => lot.daysLeft < 0);
  if (expired.length > 0) {
    alerts.push({
      key: "lots-perimes",
      tone: "danger",
      text: `${expired.length} ${plural(expired.length, "produit a dépassé sa date", "produits ont dépassé leur date")} : à retirer du rayon.`,
      href: "/stock/dates-courtes",
      cta: "Voir les dates courtes",
    });
  }
  const thisWeek = input.lots.filter((lot) => lot.daysLeft >= 0 && lot.daysLeft <= 7);
  if (thisWeek.length > 0) {
    const boxes = thisWeek.reduce((sum, lot) => sum + (lot.quantity ?? 0), 0);
    const what = boxes > 0 ? `${boxes} ${plural(boxes, "boîte périme", "boîtes périment")}` : `${thisWeek.length} ${plural(thisWeek.length, "produit périme", "produits périment")}`;
    alerts.push({ key: "lots-semaine", tone: "warning", text: `${what} cette semaine : PharmaBoost les propose en premier au comptoir.`, href: "/stock/dates-courtes", cta: "Voir les dates courtes" });
  }

  for (const campaign of input.campaigns) {
    if (!campaign.isActive && campaign.endedAt && input.now.getTime() - campaign.endedAt.getTime() <= 7 * DAY_MS) {
      const reached = campaign.endedReason === "OBJECTIF";
      alerts.push({
        key: `surstock-fin-${campaign.productName}`,
        tone: reached ? "success" : "info",
        text: reached
          ? `Campagne Surstock « ${campaign.productName} » terminée : objectif de stock atteint.`
          : `Campagne Surstock « ${campaign.productName} » terminée${campaign.endedReason === "DATE" ? " : date de fin passée" : ""} (${campaign.quantity} en stock, objectif ${campaign.targetQuantity}).`,
        href: "/surstock",
        cta: "Voir le surstock",
      });
    }
    if (campaign.isActive && campaign.endsOn) {
      const left = daysBetween(input.today, campaign.endsOn);
      if (left >= 0 && left <= 3 && campaign.quantity > campaign.targetQuantity) {
        alerts.push({
          key: `surstock-bientot-${campaign.productName}`,
          tone: "warning",
          text: `La campagne « ${campaign.productName} » se termine ${left === 0 ? "aujourd'hui" : `dans ${left} ${plural(left, "jour", "jours")}`} : encore ${campaign.quantity - campaign.targetQuantity} à écouler pour l'objectif.`,
          href: "/surstock",
          cta: "Modifier la campagne",
        });
      }
    }
  }

  for (const gap of input.gaps.filter((gap) => gap.count >= GAP_ALERT_MIN).slice(0, 3)) {
    alerts.push({
      key: `manquant-${gap.title}`,
      tone: "info",
      text: `« ${gap.title} » demandé ${gap.count} fois ce mois-ci sans produit en stock.`,
      href: "/assortiment",
      cta: "Voir les produits manquants",
    });
  }

  const order: Record<OwnerAlertTone, number> = { danger: 0, warning: 1, success: 2, info: 3 };
  return alerts.sort((a, b) => order[a.tone] - order[b.tone]);
}
