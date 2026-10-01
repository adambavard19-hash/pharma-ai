import type { Metadata } from "next";
import { resolvePublicBaseUrl } from "@/server/public-url";
import { PlanViewer } from "./plan-viewer";

export const metadata: Metadata = {
  title: { absolute: "Votre plan personnalisé" },
  // Le patient voit sa pharmacie, pas un logiciel.
  description: "Le plan personnalisé préparé avec votre pharmacien.",
  applicationName: "Votre pharmacie",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Le plan scellé, côté patient. Cette page ne contient rien : le contenu est
 * chargé chiffré puis ouvert dans le navigateur avec la clé du lien. Le
 * serveur ne voit jamais la clé et ne peut rien afficher par lui-même.
 */
export default async function SealedPlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ imprimer?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const url = `${resolvePublicBaseUrl().url.replace(/\/$/, "")}/plan/${id}`;
  return (
    <div className="min-h-dvh bg-[#eef1f4] py-4 sm:py-8 print:bg-white print:py-0">
      <div className="mx-auto max-w-[820px] px-3 sm:px-4 print:max-w-none print:px-0">
        <PlanViewer id={id} url={url} autoPrint={query.imprimer === "1"} />
      </div>
    </div>
  );
}
