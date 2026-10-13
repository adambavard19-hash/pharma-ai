import type { StockPreview } from "@/core/stock-deposit/types";
import { formatNumber } from "@/lib/format";

/**
 * L'étape « Vérifier » de la mise à jour, en fonctions pures : ce que la personne lit avant de confirmer.
 * Les chiffres viennent de `previewStockDeposit` (le serveur) ; ici on ne fait que les dire — sans jargon, sans CIP.
 */

export const UPDATE_STEPS = ["Choisir le fichier", "Vérifier", "Confirmer"] as const;

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n > 1 ? many : one}`;

export type PreviewFact = { key: string; label: string; value: string; tone: "neutral" | "warning"; hint: string | null };

/** « prix d'achat (PAMP Net) », « prix de vente (PV TTC) » : ce qu'apporte un fichier, avec le critère de son édition. */
export function priceKindLabel(kind: NonNullable<StockPreview["priceKind"]>, label: string | null): string {
  const words = kind === "PURCHASE" ? "prix d'achat" : kind === "SALE" ? "prix de vente" : kind === "BOTH" ? "prix d'achat et de vente" : "quantités seules";
  return label && kind !== "NONE" ? `${words} (${label})` : words;
}

/** « 2 fichiers réunis : prix d'achat (PAMP net) + prix de vente (PV TTC) — 4 306 produits, dont 4 120 avec les deux prix ». */
export function mergeHeadline(preview: StockPreview): string | null {
  if (!preview.merge || preview.merge.files.length < 2) return null;
  const parts = preview.merge.files.map((file) => priceKindLabel(file.priceKind, file.priceLabel)).join(" + ");
  return `${preview.merge.files.length} fichiers réunis : ${parts} — ${plural(preview.products, "produit", "produits")}, dont ${formatNumber(preview.withBothPrices ?? 0)} avec les deux prix`;
}

const pricesOnly = (preview: StockPreview) => preview.mode === "PRICES";

/** Ce que le fichier contient, ligne par ligne ; une ligne n'apparaît que si elle dit quelque chose. */
export function previewFacts(preview: StockPreview): PreviewFact[] {
  if (pricesOnly(preview)) {
    const facts: PreviewFact[] = [{ key: "prices", label: "Produits dont les prix seront complétés", value: formatNumber(preview.pricesUpdated ?? 0), tone: "neutral", hint: "Aucune quantité ne change." }];
    if (preview.withBothPrices !== undefined) facts.push({ key: "both", label: "Avec prix d'achat et prix de vente", value: formatNumber(preview.withBothPrices), tone: "neutral", hint: "Leur marge peut être calculée." });
    const unknown = preview.products - (preview.pricesUpdated ?? 0);
    if (unknown > 0) facts.push({ key: "unknown", label: "Produits non complétés", value: formatNumber(unknown), tone: "neutral", hint: "Inconnus de votre stock ou sans prix dans le fichier : ce mode n'ajoute aucun produit." });
    if (preview.invalid > 0) facts.push({ key: "invalid", label: preview.invalid > 1 ? "Lignes illisibles" : "Ligne illisible", value: formatNumber(preview.invalid), tone: "warning", hint: "Ignorées." });
    return facts;
  }
  const facts: PreviewFact[] = [{ key: "recognized", label: "Produits reconnus", value: formatNumber(preview.recognized), tone: "neutral", hint: null }];
  if (preview.created > 0) {
    facts.push({ key: "created", label: "Nouveaux produits", value: formatNumber(preview.created), tone: "neutral", hint: "Ils seront ajoutés à votre catalogue." });
  }
  if (preview.invalid > 0) {
    facts.push({ key: "invalid", label: preview.invalid > 1 ? "Lignes illisibles" : "Ligne illisible", value: formatNumber(preview.invalid), tone: "warning", hint: "Ignorées : leurs produits ne sont pas mis à jour." });
  }
  if (preview.absent !== null && preview.knownStock > 0) {
    facts.push(
      preview.absent > 0
        ? {
            key: "absent",
            label: "Produits absents du fichier",
            value: formatNumber(preview.absent),
            tone: "warning",
            // Un fichier retenu n'est pas appliqué : ses produits absents ne passent à 0 que si l'équipe l'applique.
            hint: preview.verdict === "HOLD" ? "Ils passeraient à 0 si ce fichier était appliqué." : "Ils passeront à 0 en stock.",
          }
        : { key: "absent", label: "Produits absents du fichier", value: "0", tone: "neutral", hint: "Aucun produit ne passe à 0." },
    );
  }
  if (preview.withBothPrices !== undefined) {
    facts.push({ key: "both", label: "Avec prix d'achat et prix de vente", value: formatNumber(preview.withBothPrices), tone: "neutral", hint: "Ceux du fichier, sinon ceux que PharmaBoost connaît déjà : leur marge peut être calculée." });
  }
  if (preview.merge && preview.merge.quantityConflicts > 0) {
    facts.push({ key: "conflicts", label: "Quantités différentes entre les fichiers", value: formatNumber(preview.merge.quantityConflicts), tone: "warning", hint: "La quantité du fichier le plus récent est retenue." });
  }
  return facts;
}

/** Un passage à zéro demande une confirmation explicite en plus du bouton : la case à cocher. */
export function needsZeroConsent(preview: StockPreview): boolean {
  return !pricesOnly(preview) && preview.verdict === "APPLY" && preview.absent !== null && preview.absent > 0;
}

/** La phrase de l'étape « Confirmer » : ce qui va se passer, dit sans détour. */
export function confirmationText(preview: StockPreview): string {
  if (pricesOnly(preview)) return `Seuls les prix de ${plural(preview.pricesUpdated ?? 0, "produit seront complétés", "produits seront complétés")} ; aucune quantité ne change, aucun produit n'est ajouté ni mis à 0.`;
  if (preview.verdict === "HOLD") {
    return "Ce fichier ne sera pas appliqué tout de suite. Il part à l'équipe PharmaBoost, qui le vérifie : votre stock ne change pas en attendant.";
  }
  const zero = preview.absent !== null && preview.absent > 0 ? ` ${plural(preview.absent, "produit absent du fichier passera", "produits absents du fichier passeront")} à 0.` : "";
  return `Les quantités de ${plural(preview.products, "produit", "produits")} seront mises à jour. Les prix que ce fichier ne contient pas sont conservés (vos prix d'achat restent).${zero}`;
}

/** Le texte de la case à cocher quand des produits passent à zéro. */
export function zeroConsentLabel(preview: StockPreview): string {
  return `Je confirme que ce fichier contient tout mon stock : ${plural(preview.absent ?? 0, "produit passera", "produits passeront")} à 0.`;
}

/** Le bouton de confirmation : appliquer, ou envoyer pour vérification quand le fichier est retenu. */
export function confirmButtonLabel(preview: StockPreview): string {
  if (pricesOnly(preview)) return "Compléter mes prix";
  return preview.verdict === "HOLD" ? "Envoyer pour vérification" : "Confirmer la mise à jour";
}
