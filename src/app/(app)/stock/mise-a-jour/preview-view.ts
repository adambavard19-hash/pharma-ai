import type { StockPreview } from "@/core/stock-deposit/types";
import { formatNumber } from "@/lib/format";

/**
 * L'étape « Vérifier » de la mise à jour, en fonctions pures : ce que la personne lit avant de confirmer.
 * Les chiffres viennent de `previewStockDeposit` (le serveur) ; ici on ne fait que les dire — sans jargon, sans CIP.
 */

export const UPDATE_STEPS = ["Choisir le fichier", "Vérifier", "Confirmer"] as const;

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n > 1 ? many : one}`;

export type PreviewFact = { key: string; label: string; value: string; tone: "neutral" | "warning"; hint: string | null };

/** Ce que le fichier contient, ligne par ligne ; une ligne n'apparaît que si elle dit quelque chose. */
export function previewFacts(preview: StockPreview): PreviewFact[] {
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
  return facts;
}

/** Un passage à zéro demande une confirmation explicite en plus du bouton : la case à cocher. */
export function needsZeroConsent(preview: StockPreview): boolean {
  return preview.verdict === "APPLY" && preview.absent !== null && preview.absent > 0;
}

/** La phrase de l'étape « Confirmer » : ce qui va se passer, dit sans détour. */
export function confirmationText(preview: StockPreview): string {
  if (preview.verdict === "HOLD") {
    return "Ce fichier ne sera pas appliqué tout de suite. Il part à l'équipe PharmaBoost, qui le vérifie : votre stock ne change pas en attendant.";
  }
  const zero = preview.absent !== null && preview.absent > 0 ? ` ${plural(preview.absent, "produit absent du fichier passera", "produits absents du fichier passeront")} à 0.` : "";
  return `Votre stock va être remplacé par ce fichier : ${plural(preview.products, "produit", "produits")}.${zero}`;
}

/** Le texte de la case à cocher quand des produits passent à zéro. */
export function zeroConsentLabel(preview: StockPreview): string {
  return `Je confirme que ce fichier contient tout mon stock : ${plural(preview.absent ?? 0, "produit passera", "produits passeront")} à 0.`;
}

/** Le bouton de confirmation : appliquer, ou envoyer pour vérification quand le fichier est retenu. */
export function confirmButtonLabel(preview: StockPreview): string {
  return preview.verdict === "HOLD" ? "Envoyer pour vérification" : "Confirmer la mise à jour";
}
