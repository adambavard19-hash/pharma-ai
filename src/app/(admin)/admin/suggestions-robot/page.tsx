import type { Metadata } from "next";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listRobotProposals } from "@/server/services/robot-proposals";
import { AdminPageHeader } from "@/components/admin/page-header";
import { RobotProposalsBoard, type RobotProposalCard } from "./robot-proposals-board";

export const metadata: Metadata = { title: "Suggestions du robot" };

/**
 * Ce que le robot a proposé au comptoir faute de règle écrite pour un médicament. Visible ici seulement. La pharmacienne valide
 * une proposition pour toutes les pharmacies (elle devient un conseil central) ou la refuse pour toujours.
 */
export default async function RobotSuggestionsPage() {
  await requirePlatformSession();
  const { pending, recent } = await listRobotProposals();
  const card = (row: (typeof pending)[number]): RobotProposalCard => ({ ...row, decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null, createdAt: row.createdAt.toISOString() });
  return (
    <>
      <AdminPageHeader
        space={{ label: "Gestion", href: "/admin/conseils" }}
        title="Suggestions du robot"
        description="Quand aucune règle ne couvre un médicament bipé, le robot choisit un produit dans le stock de la pharmacie, et le moteur le fait passer par tous ses garde-fous. Chaque proposition arrive ici : validez-la pour toutes les pharmacies, ou refusez-la pour toujours."
      />
      <RobotProposalsBoard pending={pending.map(card)} recent={recent.map(card)} />
    </>
  );
}
