import type { Metadata } from "next";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listKnowledge } from "@/server/services/knowledge";
import { getEnv } from "@/config/env";
import { AdminPageHeader } from "@/components/admin/page-header";
import { KnowledgeBoard, type DocumentCard } from "./knowledge-board";

export const metadata: Metadata = { title: "Base de connaissances" };
// La lecture d'un document par le modèle peut durer une demi-minute.
export const maxDuration = 120;

/**
 * La base de connaissances : l'endroit où la pharmacienne de PharmaBoost dépose ses documents, ses listes d'associations et ses
 * notes importantes. Le modèle d'Anthropic les lit et propose des conseils ; elle accepte ou refuse chaque proposition. Ce qu'elle
 * accepte vaut pour TOUTES les pharmacies, tout de suite.
 */
export default async function KnowledgePage() {
  await requirePlatformSession();
  const env = getEnv();
  const documents = await listKnowledge();
  const cards: DocumentCard[] = documents.map((doc) => ({
    ...doc,
    analysedAt: doc.analysedAt ? doc.analysedAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
    proposals: doc.proposals.map((proposal) => ({ ...proposal, decidedAt: proposal.decidedAt ? proposal.decidedAt.toISOString() : null })),
  }));
  return (
    <>
      <AdminPageHeader
        space={{ label: "Gestion", href: "/admin/conseils" }}
        title="Base de connaissances"
        description="Déposez vos documents, vos listes d'associations et vos notes importantes. Le logiciel les lit et vous propose des conseils : rien n'est mis en ligne sans votre accord."
      />
      <KnowledgeBoard documents={cards} readerAvailable={env.AI_PROVIDER === "anthropic" && Boolean(env.ANTHROPIC_API_KEY)} />
    </>
  );
}
