import type { Metadata } from "next";
import { PosteIsland } from "./poste-island";

export const metadata: Metadata = { title: "Île du comptoir", robots: { index: false, follow: false } };

/**
 * L'île du poste de caisse, telle que l'affiche la fenêtre WebView2 de l'agent Windows (agent/src/notice-host-ile.ts).
 *
 * Page publique et SANS donnée : elle ne demande rien au serveur. Tout ce qu'elle montre lui est transmis par l'agent
 * du poste (les mêmes commandes que la bannière), et les gestes du pharmacien repartent vers l'agent, qui les envoie
 * avec sa clé. Aucun identifiant, aucune donnée patient dans l'adresse.
 *
 * `?essai=1` joue une vente d'exemple sans agent (pour la voir dans un navigateur).
 */
export default function PosteIslandPage() {
  return <PosteIsland />;
}
