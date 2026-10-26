import { createHash, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db/client";
import { createSession } from "@/server/auth/session";
import { getRequestMeta } from "@/server/http/request-meta";
import { recordAudit } from "@/server/audit/log";
import { DEMO_LOGIN_EMAIL, DEMO_PHARMACY_SLUG } from "@/core/demo/identity";

export const dynamic = "force-dynamic";

/** Une clé trop courte n'ouvre rien : sans DEMO_ACCESS_KEY (24 caractères au moins), le lien n'existe pas. */
const MIN_KEY_LENGTH = 24;

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * L'accès direct au compte de démonstration (fondateur, 26 oct. 2026 : « sans mot de passe, arriver direct sur le compte
 * démo ») : pharmaboost.app/acces-demo/<clé> ouvre la session du titulaire de l'officine de démonstration, puis la page
 * « Simuler une délivrance ». La clé est secrète (variable DEMO_ACCESS_KEY) : sans elle, une adresse qui ouvrirait un compte
 * sans rien demander serait trouvée et ouverte par n'importe qui. Changer la variable coupe l'ancien lien.
 *
 * N'ouvre QUE l'officine de démonstration (marquée `isDemo`, identifiant réservé) : rien n'y part au dehors (e-mails,
 * commandes, paiements, mots de passe refusés en mode démo), et « Réinitialiser la démo » efface ce qu'un visiteur y aurait fait.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ cle: string }> }) {
  const { cle } = await params;
  const expected = process.env.DEMO_ACCESS_KEY ?? "";
  // Comparées par empreinte, à temps constant : la clé ne se devine pas caractère par caractère.
  if (expected.length < MIN_KEY_LENGTH || !timingSafeEqual(digest(cle), digest(expected))) {
    return new Response("Page introuvable.", { status: 404 });
  }

  const membership = await prisma.membership.findFirst({
    where: { isActive: true, user: { email: DEMO_LOGIN_EMAIL, deletedAt: null }, pharmacy: { slug: DEMO_PHARMACY_SLUG, isDemo: true, isActive: true } },
    select: { userId: true, pharmacyId: true },
  });
  if (!membership) return new Response("La pharmacie de démonstration n'est pas installée sur ce serveur.", { status: 404 });

  const meta = await getRequestMeta();
  await createSession({ userId: membership.userId, pharmacyId: membership.pharmacyId, ipAddress: meta.ipAddress, userAgent: meta.userAgent });
  await recordAudit({ action: "auth.login", entityType: "User", entityId: membership.userId, pharmacyId: membership.pharmacyId, userId: membership.userId, metadata: { via: "demo_link" } });
  redirect("/demo");
}
