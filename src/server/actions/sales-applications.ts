"use server";

import { headers } from "next/headers";
import { receiveSalesApplication, type CvUpload } from "@/server/services/sales-applications/intake";
import { rateLimited } from "@/server/http/rate-limit";
import { CONSENT_REQUIRED, CV_MAX_BYTES, CV_MAX_LABEL, inspectCv, salesApplicationSchema, type SalesApplicationReceipt } from "@/core/sales-applications/form";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

// Pas d'inondation : trois candidatures par heure pour une même adresse, dix par adresse IP.
const HOUR_MS = 60 * 60 * 1000;
const MAX_PAYLOAD_CHARS = 20_000;
/** Le détail s'affiche sous la question du CV : l'alerte générale reste courte. */
const CV_REFUSED = "Votre CV n'a pas pu être pris en compte.";

/**
 * Une candidature « Devenir commercial », depuis le site public. Les réponses
 * arrivent en JSON (`payload`), le CV éventuel en fichier (`cv`) : le serveur
 * relit tout, y compris la signature du PDF. Aucune activation : l'équipe
 * étudie la candidature.
 */
export async function submitSalesApplicationAction(formData: FormData): Promise<ActionResult<SalesApplicationReceipt>> {
  const raw = formData.get("payload");
  let payload: unknown;
  try {
    if (typeof raw !== "string" || raw.length > MAX_PAYLOAD_CHARS) throw new Error("payload illisible");
    payload = JSON.parse(raw);
  } catch {
    return fail("Votre candidature n'a pas pu être lue. Rechargez la page et réessayez.");
  }

  const parsed = salesApplicationSchema.safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    const fieldErrors = zodFieldErrors(issues);
    // Sans consentement, la candidature est refusée explicitement, quel que soit le reste du formulaire.
    if (fieldErrors.consent) return fail(CONSENT_REQUIRED, { ...fieldErrors, consent: "Cochez cette case pour envoyer votre candidature." });
    return fail(issues.length === 1 ? issues[0].message : "Certaines informations sont à corriger.", fieldErrors);
  }
  const { website, ...input } = parsed.data;
  // Un robot a rempli le champ caché : on lui répond comme à un humain, sans rien enregistrer.
  if (website) return ok({ acknowledged: false, cv: "none" });

  // Le CV, s'il y en a un : la taille, puis la signature du fichier. Une erreur ramène à la question du CV.
  let cv: CvUpload | null = null;
  const file = formData.get("cv");
  if (file && typeof file !== "string" && file.size > 0) {
    if (file.size > CV_MAX_BYTES) {
      return fail(CV_REFUSED, { cv: `Ce fichier dépasse ${CV_MAX_LABEL}. Choisissez un PDF plus léger.` });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const inspected = inspectCv(bytes, file.name);
    if (!inspected.ok) return fail(CV_REFUSED, { cv: inspected.error });
    cv = { bytes, fileName: inspected.fileName };
  }

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  if (rateLimited(`commercial-email:${ip}:${input.email}`, 3, HOUR_MS) || rateLimited(`commercial-ip:${ip}`, 10, HOUR_MS)) {
    return fail(`Nous avons déjà reçu votre candidature. Notre équipe revient vers vous ; pour toute précision, écrivez à ${PUBLIC_CONTACT_EMAIL}.`);
  }

  try {
    const result = await receiveSalesApplication(input, cv);
    return ok({ acknowledged: result.acknowledged, cv: result.cv });
  } catch (error) {
    console.error("[site] candidature commerciale impossible", error);
    return fail(`Votre candidature n'a pas pu être enregistrée. Écrivez-nous à ${PUBLIC_CONTACT_EMAIL}.`);
  }
}
