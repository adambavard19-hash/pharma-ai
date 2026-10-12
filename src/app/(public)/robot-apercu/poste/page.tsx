import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PosteWindowPreview } from "./preview";

export const metadata: Metadata = { title: "L'île sur le poste Windows, en aperçu", robots: { index: false, follow: false } };

/**
 * Ce que verra le poste Windows, sans Windows : la page de l'île (`/poste/ile`) dans un cadre de la taille EXACTE de la
 * fenêtre WebView2, pilotée par les mêmes commandes que l'agent enverra, sur un faux logiciel de gestion. Le liseré
 * pointillé montre la forme que la fenêtre Windows gardera (le reste laisse passer les clics). Développement seulement.
 */
export default function PosteWindowPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PosteWindowPreview />;
}
