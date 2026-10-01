/**
 * Le parcours d'inscription d'une officine, de bout en bout, sur la base
 * LOCALE (cas A à H). Aucun e-mail ne part : les services reçoivent une
 * messagerie de capture, et le moteur de contrat tourne avec
 * EMAIL_PROVIDER=none et SIGNATURE_PROVIDER=none. Les données de test sont
 * effacées à la fin.
 *
 *   EMAIL_PROVIDER=none SIGNATURE_PROVIDER=none node --env-file=.env --conditions=react-server --import tsx scripts/onboarding/parcours.mts
 */
import { prisma } from "@/server/db/client";
import { getEnv } from "@/config/env";
import type { DeliveryOutcome, MessagingProvider, OutgoingEmail } from "@/core/ai/ports";
import { changeInvitationEmail, completeOnboarding, inviteOwnerByEmail, markInvitationOpened, openInvitation, sendInvitation } from "@/server/services/onboarding";
import { changeOwnerLoginEmail, createClientPharmacy, resendOwnerAccess, setPostCount } from "@/server/services/pharmacy-admin";
import { startContracting } from "@/server/services/sales/contracts";
import { missingContractFields } from "@/core/contracts/requirements";
import { onboardingStage } from "@/core/onboarding/stage";

const env = getEnv();
if (env.EMAIL_PROVIDER !== "none" || env.SIGNATURE_PROVIDER !== "none") {
  console.error("Refus : lancez avec EMAIL_PROVIDER=none SIGNATURE_PROVIDER=none (aucun envoi réel pendant le test).");
  process.exit(2);
}
if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) {
  console.error("Refus : ce test ne tourne que sur la base locale.");
  process.exit(2);
}

// ---- messagerie de capture --------------------------------------------------
const outbox: OutgoingEmail[] = [];
let seq = 0;
const capture: MessagingProvider = {
  info: { id: "capture", label: "Capture (test)", capability: "REAL" as never, description: "Capture les e-mails sans les envoyer." },
  async sendEmail(message: OutgoingEmail): Promise<DeliveryOutcome> {
    outbox.push(message);
    return { status: "SENT", provider: "capture", detail: `capturé pour ${message.to}`, messageId: `cap_${Date.now()}_${++seq}` };
  },
};
const deps = { messaging: capture };
const lastTo = (to: string) => [...outbox].reverse().find((m) => m.to === to);
const tokenIn = (m?: OutgoingEmail) => m?.text.match(/\/inscription\/([A-Za-z0-9_-]{20,})/)?.[1] ?? null;

// ---- outils -----------------------------------------------------------------
const run = `t${Date.now().toString(36)}`;
const domain = "pharmaboost-test.invalid";
const mail = (who: string) => `${who}.${run}@${domain}`;
/** Un SIRET synthétique valide (clé de Luhn), propre à ce passage. */
function siret(seed: number): string {
  const base = `9${String(Date.now()).slice(-8)}${String(seed).padStart(4, "0")}`.slice(0, 13);
  for (let d = 0; d <= 9; d++) {
    const s = base + d;
    const sum = [...s].reverse().reduce((acc, ch, i) => { let n = Number(ch); if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; } return acc + n; }, 0);
    if (sum % 10 === 0) return s;
  }
  throw new Error("SIRET impossible");
}
const admin = { type: "ADMIN" as const, id: "test-admin", label: "Test console" };
let failures = 0;
const check = (label: string, cond: unknown, detail?: unknown) => {
  if (cond) console.log(`  ✓ ${label}`);
  else { failures++; console.log(`  ✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); }
};
const created = { pharmacies: [] as string[], prospects: [] as string[], users: [] as string[] };

async function main() {
  // ===== A : l'éditeur a tout, il crée l'officine, le titulaire reçoit son accès
  console.log("A · création directe");
  const siretA = siret(1);
  const a = await createClientPharmacy({ name: `Pharmacie Test A ${run}`, siret: siretA, finessNumber: "", postCount: 3, addressLine1: "1 rue du Test", postalCode: "75001", city: "Paris", ownerFirstName: "Alice", ownerLastName: "Martin", ownerEmail: mail("alice") }, admin, deps);
  check("officine créée", a.ok, a);
  if (!a.ok) return;
  created.pharmacies.push(a.pharmacyId);
  const pharmacyA = await prisma.pharmacy.findUniqueOrThrow({ where: { id: a.pharmacyId }, include: { prospect: true, memberships: { include: { user: true } }, postCountChanges: true } });
  created.users.push(...pharmacyA.memberships.map((m) => m.userId));
  if (pharmacyA.prospect) created.prospects.push(pharmacyA.prospect.id);
  check("titulaire créé, actif", pharmacyA.memberships[0]?.user.email === mail("alice") && pharmacyA.memberships[0]?.role === "OWNER");
  const welcomeA = lastTo(mail("alice"));
  check("e-mail de bienvenue capturé, avec lien sécurisé", welcomeA && /\/mot-de-passe\/[A-Za-z0-9_-]{20,}/.test(welcomeA.text), welcomeA?.subject);
  check("aucun mot de passe en clair dans l'e-mail", welcomeA && !/mot de passe initial|password:/i.test(welcomeA.text));
  const dispatchA = await prisma.emailDispatch.findFirst({ where: { userId: pharmacyA.memberships[0]?.userId, kind: "WELCOME" } });
  check("envoi tracé (WELCOME, SENT, identifiant prestataire)", dispatchA?.status === "SENT" && Boolean(dispatchA?.providerMessageId));
  check("dossier ouvert d'office, origine console, 3 postes", pharmacyA.prospect?.origin === "SUPER_ADMIN" && pharmacyA.prospect?.postCount === 3 && pharmacyA.prospect?.outletCount === 1, pharmacyA.prospect);
  check("historique des postes : — → 3", pharmacyA.postCountChanges.length === 1 && pharmacyA.postCountChanges[0].next === 3);

  // ===== F : FINESS vide → aucun blocage (déjà fait en A) ; vérifié explicitement
  console.log("F · FINESS facultatif");
  check("officine A créée sans FINESS", pharmacyA.finessNumber === null);

  // ===== E : même SIRET → pas de doublon silencieux
  console.log("E · SIRET déjà présent");
  const e = await createClientPharmacy({ name: `Doublon ${run}`, siret: siretA, postCount: 1, ownerFirstName: "Eve", ownerLastName: "Doublon", ownerEmail: mail("eve") }, admin, deps);
  check("création refusée, message explicite", !e.ok && /SIRET/.test(e.error), e);
  check("une seule officine porte ce SIRET", (await prisma.pharmacy.count({ where: { siret: siretA } })) === 1);
  check("aucun compte créé pour la tentative", (await prisma.user.count({ where: { email: mail("eve") } })) === 0);

  // ===== G : nombre de postes modifié
  console.log("G · nombre de postes");
  const g = await setPostCount(a.pharmacyId, 5, admin);
  const g2 = await setPostCount(a.pharmacyId, 0, admin);
  const afterG = await prisma.pharmacy.findUniqueOrThrow({ where: { id: a.pharmacyId }, include: { postCountChanges: { orderBy: { createdAt: "asc" } }, prospect: true } });
  check("passage 3 → 5 enregistré", g.ok && afterG.postCount === 5);
  check("valeur invalide (0) refusée", !g2.ok);
  check("historique : — → 3 puis 3 → 5", afterG.postCountChanges.map((c) => `${c.previous}→${c.next}`).join(",") === "null→3,3→5");
  check("le dossier suit (5 postes), les points de vente ne bougent pas", afterG.prospect?.postCount === 5 && afterG.prospect?.outletCount === 1);

  // ===== D (côté officine) : identifiant du titulaire erroné → corrigé → accès renvoyé
  console.log("D · e-mail du titulaire corrigé (officine créée)");
  const d1 = await changeOwnerLoginEmail(a.pharmacyId, mail("alice-corrigee"), admin, { resend: true }, deps);
  check("identifiant modifié", d1.ok && d1.to === mail("alice-corrigee"), d1);
  check("accès renvoyé à la nouvelle adresse", Boolean(lastTo(mail("alice-corrigee"))));
  const auditD = await prisma.auditLog.findFirst({ where: { action: "platform.owner_email_changed", pharmacyId: a.pharmacyId }, orderBy: { createdAt: "desc" } });
  check("trace : ancienne et nouvelle valeur, auteur", auditD && (auditD.metadata as Record<string, unknown>).from === mail("alice") && (auditD.metadata as Record<string, unknown>).to === mail("alice-corrigee"));
  const dossierA = await prisma.prospect.findUnique({ where: { pharmacyId: a.pharmacyId } });
  check("le dossier suit (aucun contrat parti)", dossierA?.email === mail("alice-corrigee"));
  const again = await resendOwnerAccess(a.pharmacyId, admin, deps);
  check("renvoi immédiat ignoré (anti-doublon)", again.ok && again.status === "SKIPPED", again);

  // ===== B : seulement l'e-mail → invitation → le titulaire complète → la console suit
  console.log("B · invitation avec le seul e-mail");
  const b = await inviteOwnerByEmail(mail("bruno"), admin, deps);
  check("dossier ouvert, invitation envoyée", b.ok && b.send.status === "SENT", b);
  if (!b.ok) return;
  created.prospects.push(b.prospectId);
  const token = tokenIn(lastTo(mail("bruno")));
  check("le lien contient un jeton (jamais l'identifiant du dossier)", token && !token.includes(b.prospectId));
  let dossierB = await prisma.prospect.findUniqueOrThrow({ where: { id: b.prospectId }, include: { invitations: true } });
  check("console : « Officine à compléter », invitation envoyée", dossierB.name === "Officine à compléter" && onboardingStage({ prospectStatus: dossierB.status, invitation: dossierB.invitations[0], missingCount: missingContractFields(dossierB).length }).stage === "INVITATION_SENT");
  check("le jeton n'est pas stocké en clair", !dossierB.invitations.some((i) => i.tokenHash === token));
  const reinvite = await inviteOwnerByEmail(mail("bruno"), admin, deps);
  check("réinviter la même adresse reprend le même dossier", reinvite.ok && reinvite.prospectId === b.prospectId && reinvite.reused);
  check("un seul dossier pour cette adresse", (await prisma.prospect.count({ where: { email: mail("bruno") } })) === 1);

  const opened = await openInvitation(token!);
  check("le lien ouvre le dossier à compléter (prérempli avec l'e-mail)", opened.state === "VALID" && "prefill" in opened && opened.prefill.ownerEmail === mail("bruno"));
  await markInvitationOpened(token!);
  dossierB = await prisma.prospect.findUniqueOrThrow({ where: { id: b.prospectId }, include: { invitations: true } });
  check("console : invitation ouverte", Boolean(dossierB.invitations[0]?.openedAt));

  const siretB = siret(2);
  const done = await completeOnboarding(token!, {
    name: `Pharmacie Centrale ${run}`, legalName: `SELARL Pharmacie Centrale ${run}`, siret: siretB, finessNumber: "", addressLine1: "2 place du Marché",
    postalCode: "69001", city: "Lyon", phone: "04 78 00 00 00", contactEmail: mail("contact-b"), ownerFirstName: "Bruno", ownerLastName: "Leroy",
    ownerTitle: "Pharmacien titulaire", ownerEmail: mail("bruno"), postCount: "6", lgo: "lgpi",
  }, deps);
  check("dossier enregistré par le titulaire", done.ok, done);
  dossierB = await prisma.prospect.findUniqueOrThrow({ where: { id: b.prospectId }, include: { invitations: true } });
  const eventsB = await prisma.prospectEvent.findMany({ where: { prospectId: b.prospectId }, orderBy: { createdAt: "asc" } });
  check("la MÊME fiche est complétée (nom, SIRET, 6 postes, logiciel)", dossierB.name === `Pharmacie Centrale ${run}` && dossierB.siret === siretB && dossierB.postCount === 6 && dossierB.outletCount === null && dossierB.lgo === "lgpi");
  check("aucune officine ni second dossier créé", (await prisma.prospect.count({ where: { email: mail("bruno") } })) === 1 && (await prisma.pharmacy.count({ where: { siret: siretB } })) === 0);
  check("console : dossier complété · contrat à envoyer", onboardingStage({ prospectStatus: dossierB.status, invitation: dossierB.invitations[0], missingCount: missingContractFields(dossierB).length }).stage === "CONTRACT_TO_SEND");
  check("historique : ouverture puis complétion, champs nommés", eventsB.some((e) => e.summary.startsWith("Dossier complété par le titulaire") && e.summary.includes("SIRET")));
  check("accusé « dossier complet » capturé", Boolean(outbox.find((m) => m.to === mail("bruno") && m.subject.includes("dossier PharmaBoost est complet"))));
  const reuse = await openInvitation(token!);
  check("le lien ne resert pas (dossier déjà enregistré)", reuse.state === "USED");

  // ===== H : le contrat reprend ces données, une seule fois
  console.log("H · contrat sans ressaisie ni doublon");
  check("rien ne manque au contrat", missingContractFields(dossierB).length === 0, missingContractFields(dossierB));
  check("aucun contrat déclenché par l'inscription", (await prisma.contract.count({ where: { prospectId: b.prospectId } })) === 0);
  const c1 = await startContracting(b.prospectId, admin);
  const c2 = await startContracting(b.prospectId, admin);
  const contracts = await prisma.contract.findMany({ where: { prospectId: b.prospectId } });
  console.log(`    premier envoi : ${c1.ok ? c1.outcome : c1.error} · second : ${c2.ok ? c2.outcome : c2.error}`);
  check("un seul contrat, même après deux demandes", contracts.length === 1, contracts.length);
  check("signataire et e-mail repris de la fiche du titulaire", contracts[0]?.pharmacySignerName === "Bruno Leroy" && contracts[0]?.pharmacySignerEmail === mail("bruno"), contracts[0] && { name: contracts[0].pharmacySignerName, email: contracts[0].pharmacySignerEmail });
  // Messagerie désactivée pendant le test : le moteur refuse d'envoyer et garde UN brouillon, repris au second appel.
  check("second appel : aucun nouveau contrat, aucun envoi", contracts.length === 1 && !(c2.ok && c2.outcome === "SENT") && contracts[0]?.status === "DRAFT", contracts[0]?.status);

  // ===== C : invitation expirée → renvoi → nouveau lien valable
  console.log("C · invitation expirée puis renvoyée");
  const c = await inviteOwnerByEmail(mail("chloe"), admin, deps);
  if (!c.ok) { check("invitation C", false, c); return; }
  created.prospects.push(c.prospectId);
  const oldToken = tokenIn(lastTo(mail("chloe")));
  await prisma.pharmacyInvitation.updateMany({ where: { prospectId: c.prospectId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  check("le lien expiré est refusé", (await openInvitation(oldToken!)).state === "EXPIRED");
  const later = { messaging: capture, now: () => new Date(Date.now() + 5 * 60_000) };
  const resend = await sendInvitation(c.prospectId, admin, later);
  const newToken = tokenIn(lastTo(mail("chloe")));
  check("renvoi effectué", resend.status === "SENT", resend);
  check("nouveau lien valable", newToken !== oldToken && (await openInvitation(newToken!)).state === "VALID");
  check("l'ancien lien ne fonctionne plus", (await openInvitation(oldToken!)).state === "UNKNOWN");

  // ===== D (invitation) : adresse erronée → corrigée → renvoyée
  console.log("D · adresse d'invitation erronée");
  const dWrong = `dupont.${run}@orange.com`;
  const dRight = `dupont.${run}@orange.fr`;
  const di = await inviteOwnerByEmail(dWrong, admin, deps);
  if (!di.ok) { check("invitation D", false, di); return; }
  created.prospects.push(di.prospectId);
  const wrongToken = tokenIn(lastTo(dWrong));
  const fixed = await changeInvitationEmail(di.prospectId, dRight, admin);
  check("adresse corrigée", fixed.ok && fixed.to === dRight, fixed);
  check("l'ancien lien est révoqué", (await openInvitation(wrongToken!)).state === "REVOKED");
  const resent = await sendInvitation(di.prospectId, admin, later);
  check("invitation renvoyée à la bonne adresse", resent.status === "SENT" && Boolean(lastTo(dRight)), resent);
  check("toujours un seul dossier", (await prisma.prospect.count({ where: { OR: [{ email: dWrong }, { email: dRight }] } })) === 1);

  // ===== E bis : SIRET d'une officine existante saisi par un titulaire invité
  console.log("E · SIRET existant saisi à l'inscription");
  const e2 = await inviteOwnerByEmail(mail("emma"), admin, deps);
  if (!e2.ok) return;
  created.prospects.push(e2.prospectId);
  const tE = tokenIn(lastTo(mail("emma")));
  const doneE = await completeOnboarding(tE!, { name: `Officine Emma ${run}`, legalName: "SELARL Emma", siret: siretA, addressLine1: "3 rue", postalCode: "13001", city: "Marseille", ownerFirstName: "Emma", ownerLastName: "Petit", ownerEmail: mail("emma"), postCount: "2" }, deps);
  const dossierE = await prisma.prospect.findUniqueOrThrow({ where: { id: e2.prospectId } });
  check("dossier enregistré, doublon signalé (pas de fusion, pas de création)", doneE.ok && !doneE.contractReady && Boolean(dossierE.duplicateWarning), dossierE.duplicateWarning);
  check("toujours une seule officine avec ce SIRET", (await prisma.pharmacy.count({ where: { siret: siretA } })) === 1);
}

async function cleanup() {
  // Seulement ce que ce passage a créé, sur la base locale.
  const prospectIds = [...new Set(created.prospects)];
  await prisma.emailDispatch.deleteMany({ where: { OR: [{ prospectId: { in: prospectIds } }, { pharmacyId: { in: created.pharmacies } }, { userId: { in: created.users } }, { recipient: { endsWith: `@${domain}` } }, { recipient: { contains: run } }] } });
  await prisma.contract.deleteMany({ where: { prospectId: { in: prospectIds } } });
  await prisma.prospect.deleteMany({ where: { id: { in: prospectIds } } });
  for (const id of created.pharmacies) {
    const ph = await prisma.pharmacy.findUnique({ where: { id }, select: { organizationId: true } });
    if (ph) await prisma.organization.delete({ where: { id: ph.organizationId } });
  }
  await prisma.auditLog.deleteMany({ where: { platformAdminId: "test-admin" } });
}

try {
  await main();
} finally {
  await cleanup();
  await prisma.$disconnect();
}
console.log(failures === 0 ? "\nParcours complet : tous les contrôles passent." : `\n${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
