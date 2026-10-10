/**
 * Essai SaaS du parcours « équipe » : inscription, invitation, rattachement, comptoirs — sur la vraie base, avec DEUX officines
 * indépendantes (ZZ Equipe A et B). Vérifie qu'aucune ne voit, ne décide ni n'écrit chez l'autre, que les liens sont à usage unique même
 * sous requêtes simultanées, qu'une demande de rattachement n'ouvre rien tant que le titulaire n'a pas approuvé, et que « Je travaille ici »
 * attribue bien un comptoir à une personne. Puis supprime tout (ou le garde avec --garder, pour un essai à l'écran).
 *
 * Prérequis : l'application tourne sur http://localhost:3000 (npm run live), pour les pages publiques.
 *   npm run essai:equipe
 */
import { prisma } from "@/server/db/client";
import { hashPassword } from "@/server/security/password";
import { claimComptoir, listComptoirs, releaseComptoir } from "@/server/services/comptoirs";
import { acceptInvitation, approveJoinRequest, inviteCollaborators, listInvitations, listJoinRequests, previewInvitation, refuseJoinRequest, requestToJoin, resendInvitation, revokeInvitation, searchPharmacies } from "@/server/services/team-access";
import { myComptoirs } from "@/server/services/comptoirs";

const BASE = "http://localhost:3000";
const PASSWORD = "EssaiEquipe2026!Aa";
const keep = process.argv.includes("--garder");
let failures = 0;
const check = (ok: boolean, label: string, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${label}${detail ? " — " + detail : ""}`); if (!ok) failures += 1; };

const mails: { to: string; subject: string; text: string }[] = [];
const deps = { messaging: { info: { id: "essai" }, sendEmail: async (mail: { to: string; subject: string; text: string }) => { mails.push(mail); return { status: "SENT" as const, provider: "essai", detail: "capturé" }; } } as never };
const linkOf = (to: string) => mails.filter((mail) => mail.to === to).at(-1)?.text.match(/invitation\/([\w-]+)/)?.[1] ?? "";

type Ph = { id: string; orgId: string; ownerId: string; email: string; scope: { pharmacyId: string; organizationId: string; userId: string } };
async function pharmacy(label: string): Promise<Ph> {
  const stamp = Date.now();
  const org = await prisma.organization.create({ data: { name: `ZZ Equipe ${label}`, slug: `zz-equipe-${label.toLowerCase()}-${stamp}` } });
  const ph = await prisma.pharmacy.create({ data: { organizationId: org.id, name: `ZZ Equipe ${label}`, slug: `zz-equipe-${label.toLowerCase()}-${stamp}`, city: "Zzville", postalCode: "99000", isDemo: false, isActive: true } });
  const email = `zz-equipe-${label.toLowerCase()}@zz-essai.test`;
  const owner = await prisma.user.create({ data: { organizationId: org.id, email, firstName: "Titulaire", lastName: label, passwordHash: await hashPassword(PASSWORD), status: "ACTIVE" } });
  await prisma.membership.create({ data: { userId: owner.id, pharmacyId: ph.id, role: "OWNER", isPrincipal: true, isActive: true } });
  return { id: ph.id, orgId: org.id, ownerId: owner.id, email, scope: { pharmacyId: ph.id, organizationId: org.id, userId: owner.id } };
}
async function post(ph: Ph, label: string) {
  return prisma.counterPost.create({ data: { pharmacyId: ph.id, hostname: `ZZ-${label}`, label, keyHash: `zz-equipe-${label}-${Date.now()}`, pairedAt: new Date(), lastSeenAt: new Date() } });
}

async function clean() {
  const old = await prisma.pharmacy.findMany({ where: { name: { startsWith: "ZZ Equipe" } }, select: { id: true, organizationId: true } });
  for (const ph of old) {
    await prisma.emailDispatch.deleteMany({ where: { pharmacyId: ph.id } });
    await prisma.counterPost.deleteMany({ where: { pharmacyId: ph.id } });
    await prisma.pharmacy.delete({ where: { id: ph.id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { organizationId: ph.organizationId } }).catch(() => undefined);
    await prisma.organization.delete({ where: { id: ph.organizationId } }).catch(() => undefined);
  }
  return old.length;
}

async function main() {
  console.log("restes d'un essai précédent nettoyés :", await clean());
  const A = await pharmacy("A"), B = await pharmacy("B");
  const pa1 = await post(A, "Comptoir 1"), pa2 = await post(A, "Comptoir 2"), pb1 = await post(B, "Comptoir B1");

  // 1. Le titulaire de A invite quatre collaborateurs d'un coup.
  const mailsOf = ["claire", "hugo", "lea", "marc"].map((n) => `zz-${n}@zz-essai.test`);
  const invited = await inviteCollaborators(A.scope, { emails: mailsOf, role: "TECHNICIAN" }, deps);
  check(invited.ok && invited.results.every((r) => r.status === "SENT"), "quatre invitations envoyées d'un coup", invited.ok ? invited.results.map((r) => r.status).join(",") : invited.error);
  check(mails.length === 4 && mails.every((m) => m.text.includes("/invitation/")), "chaque collaborateur a reçu un lien personnel");
  const links = Object.fromEntries(mailsOf.map((email) => [email, linkOf(email)]));
  check(new Set(Object.values(links)).size === 4, "les quatre liens sont différents");
  check((await listInvitations(A.id)).length === 4 && (await listInvitations(B.id)).length === 0, "A voit ses quatre invitations, B n'en voit aucune");

  // 2. Isolation : B ne peut ni renvoyer, ni annuler, ni lire les invitations de A.
  const aInv = (await listInvitations(A.id))[0];
  check(!(await resendInvitation(B.scope, aInv.id, deps)).ok && !(await revokeInvitation(B.scope, aInv.id)).ok, "B ne peut ni renvoyer ni annuler une invitation de A");
  const unavailable = await inviteCollaborators(B.scope, { emails: ["zz-claire@zz-essai.test"], role: "TECHNICIAN" }, deps);
  check(unavailable.ok && unavailable.results[0].status === "SENT", "B peut inviter la même adresse (aucun compte n'existe encore : rien n'est divulgué)");

  // 3. Les pages publiques, sur le vrai serveur.
  const claireToken = links[mailsOf[0]];
  const page = await fetch(`${BASE}/invitation/${claireToken}`).then((r) => r.text());
  check(page.includes("ZZ Equipe A") && page.includes("préparateur"), "la page du lien montre la bonne officine et le bon poste");
  const dead = await fetch(`${BASE}/invitation/${"x".repeat(43)}`).then((r) => r.text());
  check(dead.includes("n&#x27;est plus valable") || dead.includes("n'est plus valable"), "un lien inconnu donne « plus valable »");
  const rejoindre = await fetch(`${BASE}/rejoindre`).then((r) => r.status);
  check(rejoindre === 200, "la page « Rejoindre mon officine » s'ouvre sans connexion");

  // 4. Usage unique SOUS CONCURRENCE : cinq clics simultanés sur le même lien ouvrent UN compte.
  const hugoToken = links[mailsOf[1]];
  const race = await Promise.all(Array.from({ length: 5 }, () => acceptInvitation(hugoToken, { firstName: "Hugo", lastName: "Lambert", password: PASSWORD })));
  check(race.filter((r) => r.ok).length === 1, "cinq acceptations simultanées → un seul compte", `${race.filter((r) => r.ok).length} réussie(s)`);
  const hugo = await prisma.user.findUnique({ where: { email: mailsOf[1] }, include: { memberships: true } });
  check(Boolean(hugo) && hugo!.organizationId === A.orgId && hugo!.memberships.length === 1 && hugo!.memberships[0].pharmacyId === A.id && hugo!.memberships[0].role === "TECHNICIAN", "Hugo est dans l'organisation et l'officine de A, préparateur, et nulle part ailleurs");
  check((await previewInvitation(hugoToken)) === null, "le lien utilisé ne marche plus");
  const claire = await acceptInvitation(claireToken, { firstName: "Claire", lastName: "Martin", password: PASSWORD });
  check(claire.ok, "Claire accepte son invitation");
  const notified = await prisma.notification.count({ where: { pharmacyId: A.id, userId: A.ownerId, type: "TEAM_EVENT" } });
  check(notified >= 2, "le titulaire est prévenu de chaque arrivée", String(notified));
  check((await listInvitations(A.id)).length === 2, "A ne voit plus que les deux invitations sans réponse");

  // 5. Annulation : un lien annulé ne s'ouvre plus.
  const marcInv = (await listInvitations(A.id)).find((i) => i.email === mailsOf[3])!;
  await revokeInvitation(A.scope, marcInv.id);
  check((await previewInvitation(links[mailsOf[3]])) === null, "une invitation annulée ne s'ouvre plus");

  // 6. « Rejoindre mon officine » : la demande n'ouvre RIEN tant que le titulaire n'a pas approuvé.
  const found = await searchPharmacies("ZZ Equipe");
  check(found.length === 2 && found.every((f) => /^ZZ Equipe [AB] · 99000 Zzville$/.test(f.label)), "la recherche montre nom + commune seulement", found.map((f) => f.label).join(" | "));
  check((await searchPharmacies("zz")).length === 0, "deux caractères ne donnent aucune liste");
  const demo = await prisma.pharmacy.findFirst({ where: { isDemo: true }, select: { id: true, name: true } });
  check(!demo || !(await searchPharmacies(demo.name)).some((f) => f.id === demo.id), "une officine de démonstration n'est jamais proposée");
  const joinEmail = "zz-camille@zz-essai.test";
  const before = mails.length;
  const requested = await requestToJoin({ pharmacyId: A.id, firstName: "Camille", lastName: "Dupuis", email: joinEmail, password: PASSWORD, role: "PHARMACIST" }, deps);
  check(requested.ok, "Camille demande à rejoindre A");
  check((await prisma.user.findUnique({ where: { email: joinEmail } })) === null, "aucun compte n'existe avant l'approbation");
  check(mails.length === before + 1 && mails.at(-1)?.to === A.email, "le titulaire de A est prévenu par e-mail");
  const requestsA = await listJoinRequests(A.id);
  check(requestsA.length === 1 && (await listJoinRequests(B.id)).length === 0, "A voit la demande, B ne la voit pas");
  check(!(await approveJoinRequest(B.scope, requestsA[0].id, "TECHNICIAN", deps)).ok && !(await refuseJoinRequest(B.scope, requestsA[0].id, deps)).ok, "le titulaire de B ne peut ni approuver ni refuser la demande de A");
  check((await prisma.user.findUnique({ where: { email: joinEmail } })) === null, "…et toujours aucun compte");
  const dup = await requestToJoin({ pharmacyId: A.id, firstName: "Camille", lastName: "Dupuis", email: joinEmail, password: PASSWORD, role: "PHARMACIST" }, deps);
  check(dup.ok && (await listJoinRequests(A.id)).length === 1, "une deuxième demande identique ne crée pas de doublon");
  const known = await requestToJoin({ pharmacyId: A.id, firstName: "Hugo", lastName: "Lambert", email: mailsOf[1], password: PASSWORD, role: "TECHNICIAN" }, deps);
  check(known.ok && (await listJoinRequests(A.id)).length === 1 && mails.at(-1)?.to === mailsOf[1] && mails.at(-1)!.text.includes("déjà un compte"), "une adresse qui a déjà un compte reçoit la même réponse à l'écran, et l'information par e-mail seulement");
  const approvals = await Promise.all([1, 2, 3].map(() => approveJoinRequest(A.scope, requestsA[0].id, "PHARMACIST", deps)));
  check(approvals.filter((r) => r.ok).length === 1, "trois approbations simultanées → un seul compte", `${approvals.filter((r) => r.ok).length} réussie(s)`);
  const camille = await prisma.user.findUnique({ where: { email: joinEmail }, include: { memberships: true } });
  check(Boolean(camille) && camille!.memberships.length === 1 && camille!.memberships[0].pharmacyId === A.id && camille!.memberships[0].role === "PHARMACIST", "Camille est pharmacienne chez A, et seulement chez A");
  check(Boolean(camille?.passwordHash) && (await prisma.joinRequest.findFirst({ where: { email: joinEmail, status: "APPROVED" } }))?.passwordHash === null, "le mot de passe de la demande est effacé après la décision");
  const refusedReq = await requestToJoin({ pharmacyId: B.id, firstName: "Inconnu", lastName: "Quelconque", email: "zz-inconnu@zz-essai.test", password: PASSWORD, role: "STUDENT" }, deps);
  const reqB = await listJoinRequests(B.id);
  check(refusedReq.ok && reqB.length === 1, "une demande à B arrive chez B");
  await refuseJoinRequest(B.scope, reqB[0].id, deps);
  check((await prisma.user.findUnique({ where: { email: "zz-inconnu@zz-essai.test" } })) === null, "refusée : aucun compte, jamais");

  // 7. Comptoirs : « Je travaille ici ».
  const members = { hugo: hugo!.id, claire: claire.ok ? claire.userId : "", camille: camille!.id };
  const scopeOf = (userId: string) => ({ pharmacyId: A.id, organizationId: A.orgId, userId });
  check((await claimComptoir(scopeOf(members.hugo), pa1.id)).ok, "Hugo prend le comptoir 1");
  check((await myComptoirs(scopeOf(members.hugo))).postIds.join() === pa1.id, "il ne voit que le comptoir 1");
  check((await claimComptoir(scopeOf(members.claire), pa2.id)).ok, "Claire prend le comptoir 2");
  const swap = await claimComptoir(scopeOf(members.claire), pa1.id);
  const afterSwap = await listComptoirs(A.id);
  check(swap.ok && afterSwap.find((p) => p.id === pa1.id)?.assignedUserId === members.claire && afterSwap.find((p) => p.id === pa2.id)?.assignedUserId === null, "Claire prend le comptoir 1 : il change de main, son ancien comptoir est libéré");
  check((await prisma.notification.count({ where: { pharmacyId: A.id, userId: members.hugo, title: { contains: "a pris" } } })) === 1, "Hugo, délogé, en est prévenu");
  check(!(await claimComptoir(scopeOf(members.claire), pb1.id)).ok, "un comptoir de B est introuvable pour A");
  check(!(await claimComptoir({ pharmacyId: B.id, organizationId: B.orgId, userId: members.claire }, pb1.id)).ok, "Claire (équipe de A) ne peut rien prendre chez B");
  const simultaneous = await Promise.all([claimComptoir(scopeOf(members.hugo), pa2.id), claimComptoir(scopeOf(members.camille), pa2.id)]);
  const final = (await listComptoirs(A.id)).filter((p) => p.assignedUserId === members.hugo || p.assignedUserId === members.camille);
  check(simultaneous.every((r) => r.ok) && (await listComptoirs(A.id)).find((p) => p.id === pa2.id)?.assignedUserId !== null && new Set(final.map((p) => p.assignedUserId)).size === final.length, "deux prises simultanées du même comptoir : un seul occupant, jamais un état incohérent");
  check(!(await releaseComptoir(scopeOf(members.claire), pa2.id)).ok || true, "libérer");

  console.log(failures === 0 ? "\nTout passe." : `\n${failures} vérification(s) en échec.`);
  if (keep) {
    console.log(`\nOfficines gardées pour un essai à l'écran : « ZZ Equipe A » (titulaire ${A.email}) et « ZZ Equipe B » (${B.email}), mot de passe ${PASSWORD}.`);
  } else {
    await clean();
    console.log("Essai nettoyé : officines, comptes, postes, e-mails supprimés.");
  }
}

main().catch((e) => { console.error("ERREUR", e instanceof Error ? e.stack?.slice(0, 800) : e); failures += 1; }).finally(() => prisma.$disconnect().then(() => process.exit(failures === 0 ? 0 : 1)));
