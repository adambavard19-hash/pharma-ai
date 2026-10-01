/**
 * Crée une invitation de démonstration sur la base LOCALE et affiche son lien,
 * sans envoyer d'e-mail : pour essayer la page d'inscription.
 *
 *   node --env-file=.env --conditions=react-server --import tsx scripts/onboarding/invitation-demo.mts adresse@exemple.invalid
 */
import { prisma } from "@/server/db/client";
import type { MessagingProvider, OutgoingEmail } from "@/core/ai/ports";
import { inviteOwnerByEmail } from "@/server/services/onboarding";

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) {
  console.error("Refus : base locale uniquement.");
  process.exit(2);
}
const email = process.argv[2];
if (!email) {
  console.error("Indiquez une adresse (de préférence en .invalid).");
  process.exit(2);
}
let captured: OutgoingEmail | null = null;
const capture: MessagingProvider = {
  info: { id: "capture", label: "Capture", capability: "REAL" as never, description: "Aucun envoi." },
  async sendEmail(m) {
    captured = m;
    return { status: "SENT", provider: "capture", detail: "capturé, non envoyé" };
  },
};
const result = await inviteOwnerByEmail(email, { type: "ADMIN", id: "demo", label: "Démonstration locale" }, { messaging: capture });
if (!result.ok) {
  console.error(result.error);
} else {
  const url = (captured as OutgoingEmail | null)?.text.match(/https?:\/\/\S+\/inscription\/[A-Za-z0-9_-]+/)?.[0];
  console.log(`dossier ${result.prospectId}`);
  console.log(url ?? "lien introuvable");
}
await prisma.$disconnect();
