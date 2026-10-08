import { redirect } from "next/navigation";

/**
 * « Connecter mon logiciel » est devenue « Installer PharmaBoost » (menu « Ma connexion »). Les anciens liens
 * arrivent ici ; les réglages techniques sont dans l'espace d'assistance de la console.
 */
export default function StockConnectionPage() {
  redirect("/connexion");
}
