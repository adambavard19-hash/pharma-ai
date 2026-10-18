/**
 * L'e-mail du jour J aux équipes des pharmacies (fondateur, 18 oct. 2026).
 *   --essai <adresse>   envoie les DEUX versions (titulaire, comptoir) à cette adresse seulement, pour relecture ;
 *   --envoyer           envoie à chaque titulaire et à chaque membre actif des pharmacies clientes (jamais une pharmacie de démo).
 * Le lien de la vidéo pointe toujours vers https://pharmaboost.app.
 */
import { prisma } from "@/server/db/client";
import { getMessagingProvider } from "@/server/ai/registry";
import { platformEmailContext } from "@/server/services/email-context";
import { traceDispatch } from "@/server/services/email-dispatch";
import { buildLaunchDayEmail } from "@/core/notifications/launch-day";

const DAY = "lundi 20 octobre";
const args = process.argv.slice(2);
const trial = args[args.indexOf("--essai") + 1];
const ctx = { ...(await platformEmailContext()), baseUrl: "https://pharmaboost.app" };
const messaging = getMessagingProvider({ demo: false });

async function send(to: string, mail: ReturnType<typeof buildLaunchDayEmail>, meta?: { pharmacyId: string; userId: string }) {
  const outcome = await messaging.sendEmail({ to, fromName: "PharmaBoost", subject: mail.subject, text: mail.text, html: mail.html }).catch((error: unknown) => ({ status: "FAILED" as const, provider: messaging.info.id, detail: error instanceof Error ? error.message : "Envoi impossible." }));
  if (meta) await traceDispatch({ kind: "CAMPAIGN", recipient: to, outcome, subject: mail.subject, templateKey: "launch-day", trigger: "MANUAL", pharmacyId: meta.pharmacyId, userId: meta.userId }).catch(() => undefined);
  return outcome;
}

if (args.includes("--essai") && trial) {
  for (const owner of [true, false]) {
    const mail = buildLaunchDayEmail({ firstName: "Adam", pharmacyName: "Pharmacie Docteur Nicolas", owner, dayLabel: DAY }, ctx);
    const outcome = await send(trial, { ...mail, subject: `[Essai — version ${owner ? "titulaire" : "comptoir"}] ${mail.subject}` });
    console.log(owner ? "titulaire" : "comptoir", "→", trial, ":", outcome.status);
  }
} else if (args.includes("--envoyer")) {
  const members = await prisma.membership.findMany({
    where: { isActive: true, pharmacy: { isActive: true, isDemo: false }, user: { deletedAt: null, status: "ACTIVE" } },
    select: { role: true, pharmacyId: true, pharmacy: { select: { name: true } }, user: { select: { id: true, email: true, firstName: true } } },
  });
  let sent = 0;
  for (const m of members) {
    const mail = buildLaunchDayEmail({ firstName: m.user.firstName, pharmacyName: m.pharmacy.name, owner: m.role === "OWNER", dayLabel: DAY }, ctx);
    const outcome = await send(m.user.email, mail, { pharmacyId: m.pharmacyId, userId: m.user.id });
    if (outcome.status !== "FAILED") sent += 1;
    console.log(m.role, m.pharmacy.name, ":", outcome.status);
  }
  console.log(sent, "/", members.length, "envoyés");
} else {
  console.log("Usage : --essai <adresse> | --envoyer");
}
process.exit(0);
