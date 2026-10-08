import { redirect } from "next/navigation";

/**
 * « Connecter mon logiciel » est devenue « Connecter ma pharmacie » : l'assistant
 * en haut, les réglages techniques dans « Avancé ». Les anciens liens arrivent ici.
 */
export default function StockConnectionPage() {
  redirect("/connexion?avance=1");
}
