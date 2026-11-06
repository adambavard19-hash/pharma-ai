import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BannerProposals } from "./proposals";

export const metadata: Metadata = { title: "Bannière, propositions", robots: { index: false, follow: false } };

/**
 * Propositions de bannière (fondateur, 6 nov. 2026 : « des exemples modernes, avec l'étape de chargement, au moment du scan,
 * au conseil ») : quatre styles qui jouent chacun scan → chargement → conseil. Développement seulement (404 en production).
 */
export default function BannerProposalsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BannerProposals />;
}
