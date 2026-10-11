import { createSign } from "node:crypto";

/**
 * Les notifications push de l'application iPhone, côté Apple (APNs) : ce qui se calcule sans réseau ni base.
 *
 *  • Le jeton d'authentification : un JWT ES256 signé par la clé .p8 d'Apple, valable une heure (Apple refuse un jeton de
 *    plus d'une heure, et demande de ne pas en refaire un à chaque envoi : on le garde 50 minutes).
 *  • Le contenu : un titre et une phrase courts, l'écran à ouvrir. JAMAIS une donnée patient ni un médicament : un push
 *    s'affiche sur l'écran verrouillé, à la vue de tous. Le texte vient donc d'une liste fermée par sorte de notification,
 *    jamais du titre libre de la notification (qui peut citer un produit).
 */

export type ApnsConfig = { keyId: string; teamId: string; privateKey: string; bundleId: string };

/** La configuration, si elle est complète ; sinon `null` (rien ne part, rien ne casse). */
export function apnsConfigFrom(env: { APNS_KEY_ID?: string; APNS_TEAM_ID?: string; APNS_KEY?: string; APNS_BUNDLE_ID?: string }): ApnsConfig | null {
  const keyId = env.APNS_KEY_ID?.trim();
  const teamId = env.APNS_TEAM_ID?.trim();
  const privateKey = env.APNS_KEY?.replace(/\\n/g, "\n").trim();
  if (!keyId || !teamId || !privateKey || !privateKey.includes("PRIVATE KEY")) return null;
  return { keyId, teamId, privateKey, bundleId: env.APNS_BUNDLE_ID?.trim() || "app.pharmaboost.mobile" };
}

const base64url = (value: Buffer | string): string => Buffer.from(value).toString("base64url");

/** Le JWT d'APNs : en-tête { alg: ES256, kid }, corps { iss: équipe, iat }, signature ECDSA P-256 au format brut (r‖s). */
export function apnsJwt(config: Pick<ApnsConfig, "keyId" | "teamId" | "privateKey">, now: Date): string {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64url(JSON.stringify({ iss: config.teamId, iat: Math.floor(now.getTime() / 1000) }));
  const signer = createSign("SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign({ key: config.privateKey, dsaEncoding: "ieee-p1363" });
  return `${header}.${claims}.${base64url(signature)}`;
}

export const APNS_TOKEN_TTL_MS = 50 * 60 * 1000;

export const APNS_HOSTS = { production: "https://api.push.apple.com", development: "https://api.sandbox.push.apple.com" } as const;

/** Un jeton d'appareil d'Apple : 64 caractères hexadécimaux (parfois plus) ; tout le reste est refusé à l'enregistrement. */
export function isDeviceToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64,200}$/i.test(value);
}

/** L'écran que le push ouvre : toujours une page de l'application (/m) ; un lien du logiciel du comptoir ramène à l'accueil. */
export function pushUrlFor(linkUrl: string | null | undefined): string {
  if (linkUrl && /^\/m(\/|$|\?)/.test(linkUrl)) return linkUrl;
  return "/m";
}

export type PushKind = "LOW_STOCK" | "OUT_OF_STOCK" | "RECOMMENDATION_PENDING" | "ANALYSIS_FAILED" | "DOCUMENT_NOT_DELIVERED" | "IMPORT_COMPLETED" | "IMPORT_FAILED" | "FOLLOW_UP_RESPONSE" | "TEAM_EVENT" | "SYSTEM" | "BONUS_VALIDATED" | "CHALLENGE_STARTED";

/** Le texte du push, par sorte : neutre, sans produit ni patient. `null` : cette sorte ne part pas sur le téléphone. */
export const PUSH_TEXTS: Record<PushKind, { title: string; body: string } | null> = {
  LOW_STOCK: { title: "Stock à surveiller", body: "Des produits passent sous leur seuil. Le détail est dans PharmaBoost." },
  OUT_OF_STOCK: { title: "Rupture de stock", body: "Un produit est en rupture. Le détail est dans PharmaBoost." },
  RECOMMENDATION_PENDING: { title: "Conseils à valider", body: "Des conseils du comptoir attendent votre réponse." },
  ANALYSIS_FAILED: null,
  DOCUMENT_NOT_DELIVERED: null,
  IMPORT_COMPLETED: { title: "Stock à jour", body: "Le dernier envoi du stock a bien été lu." },
  IMPORT_FAILED: { title: "Envoi du stock à revoir", body: "Le dernier envoi du stock n'a pas pu être lu." },
  FOLLOW_UP_RESPONSE: null,
  TEAM_EVENT: { title: "Votre équipe", body: "Du nouveau dans l'équipe de votre officine." },
  SYSTEM: { title: "PharmaBoost", body: "Un message de PharmaBoost vous attend." },
  BONUS_VALIDATED: { title: "Prime validée 🎉", body: "Votre titulaire a validé une prime. Retrouvez-la dans Mon espace." },
  CHALLENGE_STARTED: { title: "Nouveau challenge", body: "Un challenge d'équipe vient de commencer dans votre officine." },
};

/** Le message envoyé à Apple : alerte, son, regroupement par sorte, et l'écran à ouvrir. */
export function pushPayload(kind: PushKind, url: string): string | null {
  const text = PUSH_TEXTS[kind];
  if (!text) return null;
  return JSON.stringify({ aps: { alert: { title: text.title, body: text.body }, sound: "default", "thread-id": kind.toLowerCase() }, url });
}

/** Apple a dit que ce jeton ne vaut plus : on n'y enverra plus rien. */
export function isDeadToken(status: number, reason: string | null | undefined): boolean {
  return status === 410 || reason === "BadDeviceToken" || reason === "Unregistered" || reason === "DeviceTokenNotForTopic";
}

/** Pas plus d'un push de la même sorte à la même personne pendant ce délai : une rafale d'alertes ne fait sonner qu'une fois. */
export const PUSH_QUIET_MS = 30 * 60 * 1000;
