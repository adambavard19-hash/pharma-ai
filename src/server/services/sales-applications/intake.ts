import "server-only";
import { prisma } from "@/server/db/client";
import { getMessagingProvider, getStorageProvider } from "@/server/ai/registry";
import { recordAudit } from "@/server/audit/log";
import { notifyAdmins } from "@/server/services/sales/notifications";
import { platformEmailContext } from "@/server/services/email-context";
import { buildSalesApplicationAcknowledgement } from "@/core/sales-applications/emails";
import { CV_MIME, cvStorageKey, type SalesApplicationData, type SalesApplicationReceipt } from "@/core/sales-applications/form";

export type CvUpload = { bytes: Uint8Array; fileName: string };

/** Une même adresse ne dépose pas une seconde candidature dans ce délai : la première suffit. */
export const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Le CV n'est proposé que si le stockage de la plateforme est utilisable
 * (jamais le dossier local en production, jamais un S3 incomplet). Quand il ne
 * l'est pas, le formulaire ne pose simplement pas la question.
 */
export function cvUploadAvailable(): boolean {
  try {
    getStorageProvider();
    return true;
  } catch {
    return false;
  }
}

/**
 * Une candidature « Devenir commercial » venue du site public.
 *
 * Elle devient une candidature « Nouvelle » dans la console, l'équipe est
 * prévenue, le candidat reçoit un accusé de réception. RIEN d'autre n'est
 * créé : ni commercial, ni accès. Une candidature ne devient jamais un
 * commercial seule : l'équipe l'étudie, puis une personne de la console
 * décide.
 *
 * Une même adresse déjà reçue il y a moins de 24 h ne crée pas de seconde
 * candidature (et ne prévient personne une seconde fois) : le visiteur voit la
 * même confirmation.
 *
 * Une fois la candidature enregistrée, une panne de CV, de notification ou
 * d'e-mail ne la fait pas échouer : le candidat ne doit pas la renvoyer, et la
 * console la montre de toute façon.
 */
export async function receiveSalesApplication(input: SalesApplicationData, cv: CvUpload | null): Promise<SalesApplicationReceipt & { applicationId: string; duplicate: boolean }> {
  const recent = await prisma.salesApplication.findFirst({
    where: { email: { equals: input.email, mode: "insensitive" }, createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) } },
    select: { id: true, acknowledgedAt: true },
  });
  if (recent) return { applicationId: recent.id, duplicate: true, acknowledged: recent.acknowledgedAt !== null, cv: "none" };

  const application = await prisma.salesApplication.create({
    data: {
      status: "NEW",
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      city: input.city,
      salesExperience: input.salesExperience,
      healthExperience: input.healthExperience || null,
      currentStatus: input.currentStatus,
      zone: input.zone,
      message: input.message,
      // Le candidat a coché la case de consentement : c'est la condition de l'envoi.
      consentAt: new Date(),
      events: { create: { kind: "CREATED", toStatus: "NEW", note: "Candidature reçue depuis le site public." } },
    },
    select: { id: true },
  });
  const applicationId = application.id;

  let cvOutcome: SalesApplicationReceipt["cv"] = "none";
  if (cv) {
    cvOutcome = "failed";
    const key = cvStorageKey(applicationId);
    let stored = false;
    try {
      await getStorageProvider().put(key, cv.bytes, CV_MIME);
      stored = true;
      await prisma.salesApplication.update({ where: { id: applicationId }, data: { cvKey: key, cvFileName: cv.fileName, cvSizeBytes: cv.bytes.byteLength } });
      cvOutcome = "saved";
    } catch (error) {
      console.error("[commerciaux] candidature enregistrée, CV impossible", error);
      // Un fichier que rien ne référence n'a pas à rester.
      if (stored) await quietly("nettoyage du CV", () => getStorageProvider().delete(key));
    }
  }

  await quietly("notification", () =>
    notifyAdmins({
      type: "SALES_APPLICATION",
      title: `Candidature commerciale — ${input.firstName} ${input.lastName}`,
      body: `${input.city} · ${input.email}`,
      linkUrl: `/admin/candidatures-commerciales/${applicationId}`,
      severity: "INFO",
    }),
  );

  let acknowledged = false;
  await quietly("accusé de réception", async () => {
    const ack = buildSalesApplicationAcknowledgement(await platformEmailContext(), { firstName: input.firstName, hasCv: cvOutcome === "saved" });
    const outcome = await getMessagingProvider().sendEmail({ to: input.email, fromName: "PharmaBoost", subject: ack.subject, text: ack.text, html: ack.html });
    if (outcome.status === "SENT") {
      await prisma.salesApplication.update({ where: { id: applicationId }, data: { acknowledgedAt: new Date() } });
      acknowledged = true;
    }
  });

  // Aucune donnée personnelle dans le journal : l'identifiant suffit à retrouver la candidature.
  await recordAudit({
    action: "sales_application.created",
    entityType: "SalesApplication",
    entityId: applicationId,
    metadata: { hasCv: cvOutcome === "saved", acknowledged },
  });

  return { applicationId, duplicate: false, acknowledged, cv: cvOutcome };
}

async function quietly(step: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.error(`[commerciaux] candidature enregistrée, ${step} impossible`, error);
  }
}
