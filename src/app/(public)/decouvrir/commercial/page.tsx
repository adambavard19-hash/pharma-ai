import { permanentRedirect } from "next/navigation";

/**
 * L'ancienne page de recrutement des commerciaux : remplacée le 18 oct. 2026 par le programme d'affiliation. Les liens
 * déjà partagés mènent, pour de bon (redirection permanente), à la nouvelle page.
 */
export default function FormerSalesPage() {
  permanentRedirect("/decouvrir/affiliation");
}
