import "server-only";
import { activityScope } from "@/server/db/demo-scope";
import sharp from "sharp";
import { prisma } from "@/server/db/client";
import { getOCRProvider, getStorageProvider } from "@/server/ai/registry";
import type { StorageProvider } from "@/core/ai/ports";
import type { TenantScope } from "@/server/db/tenant";
import type { ExtractedPrescription } from "@/core/ai/types";

/**
 * Dépôt d'une ordonnance.
 *
 * Ce service est partagé par la route d'upload et par la création
 * d'ordonnance : les règles de taille et de format sont écrites UNE fois, et
 * appliquées côté serveur quoi qu'ait fait l'écran. Une validation côté client
 * fait gagner un aller-retour ; elle ne protège rien.
 */

/** 10 Mo : une photo d'ordonnance nette pèse 2 à 5 Mo, un PDF bien moins. */
export const MAX_PRESCRIPTION_FILE_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_PRESCRIPTION_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type PrescriptionUploadResult = {
  fileKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Nom du patient lu sur l'ordonnance. `null` si rien n'a pu être lu. */
  patientName: string | null;
  /** Fiche de l'officine correspondant à ce nom, si elle est unique. */
  suggestedPatient: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
  } | null;
  /** Médicaments lus. Vide tant qu'aucun lecteur réel n'est branché. */
  lines: { drugName: string; dosage: string | null; form: string | null }[];
  /** Vrai lorsqu'un lecteur d'ordonnance a réellement analysé l'image. */
  wasRead: boolean;
  /**
   * La lecture complète, telle que validée — posologies, durées, quantités,
   * prescripteur, date, confiance par champ. C'est elle qui est persistée à
   * la création de l'ordonnance : `lines` ci-dessus n'en est qu'un résumé
   * d'affichage. `null` quand aucun lecteur réel n'a analysé l'image.
   */
  extraction: ExtractedPrescription | null;
};

export type PrescriptionUploadError =
  | { kind: "AUCUN_FICHIER" }
  | { kind: "TROP_LOURD"; sizeBytes: number }
  | { kind: "FORMAT_REFUSE"; mimeType: string }
  | { kind: "STOCKAGE_INDISPONIBLE" }
  /** La configuration du serveur interdit tout dépôt : le motif exact est transmis. */
  | { kind: "STOCKAGE_NON_CONFIGURE"; reason: string };

/** Message destiné au pharmacien. Aucun jargon, aucune trace technique. */
export function uploadErrorMessage(error: PrescriptionUploadError): string {
  switch (error.kind) {
    case "AUCUN_FICHIER":
      return "Aucun fichier reçu. Réessayez.";
    case "TROP_LOURD":
      return "Ce fichier dépasse 10 Mo. Choisissez un fichier plus léger.";
    case "FORMAT_REFUSE":
      return "Format non pris en charge. Utilisez un PDF ou une photo (JPG, PNG, WEBP).";
    case "STOCKAGE_INDISPONIBLE":
      return "L'ordonnance n'a pas pu être enregistrée : le stockage n'a pas répondu. Réessayez dans un instant ; si cela persiste, prévenez l'éditeur.";
    case "STOCKAGE_NON_CONFIGURE":
      return `Dépôt impossible : ${error.reason}`;
  }
}

/** Les étapes réelles du dépôt, telles que l'écran les montre. */
export type UploadStage =
  | { stage: "RECEIVED"; sizeBytes: number }
  | { stage: "STORED" }
  | { stage: "PREPARED"; sizeBytes: number; ms: number }
  | { stage: "READING" }
  | { stage: "READ"; lines: number; ms: number };

export async function storePrescriptionFile(params: {
  scope: TenantScope;
  file: File;
  /** Appelé à chaque étape : c'est ce que voit le pharmacien pendant l'attente. */
  onStage?: (stage: UploadStage) => void;
}): Promise<
  { ok: true; data: PrescriptionUploadResult } | { ok: false; error: PrescriptionUploadError }
> {
  const { file, scope, onStage } = params;

  if (!file || file.size === 0) return { ok: false, error: { kind: "AUCUN_FICHIER" } };
  if (file.size > MAX_PRESCRIPTION_FILE_BYTES) {
    return { ok: false, error: { kind: "TROP_LOURD", sizeBytes: file.size } };
  }
  if (!(ACCEPTED_PRESCRIPTION_MIME as readonly string[]).includes(file.type)) {
    return { ok: false, error: { kind: "FORMAT_REFUSE", mimeType: file.type } };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  onStage?.({ stage: "RECEIVED", sizeBytes: bytes.length });
  const timings: Record<string, number> = {};
  const extension = file.name.split(".").pop()?.slice(0, 8) ?? "bin";
  const fileKey = `${scope.pharmacyId}/ordonnances/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${extension}`;

  let storage: StorageProvider;
  try {
    storage = getStorageProvider();
  } catch (error) {
    console.error("[ordonnances] stockage non configuré", error);
    return { ok: false, error: { kind: "STOCKAGE_NON_CONFIGURE", reason: error instanceof Error ? error.message : "configuration invalide" } };
  }

  try {
    const t = Date.now();
    await storage.put(fileKey, bytes, file.type);
    timings.stockage = Date.now() - t;
    onStage?.({ stage: "STORED" });
  } catch (error) {
    console.error("[ordonnances] dépôt impossible", error);
    return { ok: false, error: { kind: "STOCKAGE_INDISPONIBLE" } };
  }

  const reader = getOCRProvider();
  const canRead = reader.info.capability === "LIVE";

  let patientName: string | null = null;
  let lines: PrescriptionUploadResult["lines"] = [];
  let extraction: ExtractedPrescription | null = null;

  if (!canRead) {
    // « Zéro médicament » ne doit jamais rester inexpliqué côté serveur.
    console.info(
      `[ordonnances] lecture non tentée — provider « ${reader.info.id} » (${reader.info.capability}). ` +
        `Fichier ${file.name} (${file.size} octets, ${file.type}) enregistré sous ${fileKey}.`,
    );
  } else {
    const debut = Date.now();
    try {
      // Une photo de téléphone fait 3 Mo pour 5 000 pixels de large ; le
      // modèle n'en lit pas plus qu'une image de 2 000 pixels. On envoie donc
      // quatorze fois moins d'octets pour la même lecture — mesuré, sans
      // aucune perte sur les cinq lignes de l'ordonnance de référence.
      const tPrep = Date.now();
      const prepared = await prepareImageForReading(bytes, file.type);
      timings.preparation = Date.now() - tPrep;
      onStage?.({ stage: "PREPARED", sizeBytes: prepared.bytes.length, ms: timings.preparation });
      onStage?.({ stage: "READING" });
      const tRead = Date.now();
      const extracted = await reader.extract({
        fileKey,
        mimeType: prepared.mimeType,
        fileName: file.name,
        bytes: prepared.bytes,
      });
      timings.lecture = Date.now() - tRead;
      onStage?.({ stage: "READ", lines: extracted.lines.length, ms: timings.lecture });

      extraction = extracted;
      patientName = extracted.patientName.value;
      const lues = extracted.lines.length;
      lines = extracted.lines
        .filter((line) => line.drugName.value)
        .map((line) => ({
          drugName: line.drugName.value as string,
          dosage: line.dosage.value,
          form: line.form.value,
        }));

      // Chaque étape est chiffrée : lignes rendues par le modèle, lignes
      // retenues après filtrage, patient lu, avertissements du validateur.
      // Sans ce détail, un « 0 médicament » est indébogable.
      console.info(
        `[ordonnances] durées — stockage ${timings.stockage ?? 0} ms, préparation ${timings.preparation ?? 0} ms, lecture ${timings.lecture ?? 0} ms (total depuis réception ${Date.now() - debut} ms).`,
      );
      console.info(
        `[ordonnances] lecture par ${extracted.providerId} en ${Date.now() - debut} ms — ` +
          `${lues} ligne(s) rendue(s), ${lines.length} retenue(s), ` +
          `patient « ${patientName ?? "non lu"} », confiance ${extracted.overallConfidence}.`,
      );
      if (extracted.warnings.length > 0) {
        console.warn(`[ordonnances] avertissements : ${extracted.warnings.join(" | ")}`);
      }
      if (lines.length === 0) {
        console.warn(
          `[ordonnances] AUCUN MÉDICAMENT retenu pour ${file.name}. ` +
            (lues === 0
              ? "Le modèle n'a rendu aucune ligne : image illisible, refus, ou réponse hors schéma."
              : `Le modèle a rendu ${lues} ligne(s), toutes écartées faute de nom de médicament lu.`),
        );
      }
    } catch (error) {
      // Une lecture qui échoue ne perd pas le fichier : il est déjà stocké et
      // le pharmacien saisira les médicaments lui-même.
      console.error(`[ordonnances] lecture impossible pour ${file.name}`, error);
    }
  }

  return {
    ok: true,
    data: {
      fileKey,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      patientName,
      suggestedPatient: patientName
        ? await findPatientByName(patientName, scope.pharmacyId)
        : null,
      lines,
      wasRead: canRead,
      extraction,
    },
  };
}

/**
 * Rapproche un nom lu sur l'ordonnance d'une fiche de l'officine.
 *
 * Ne rend une fiche que si UNE SEULE correspond. Deux homonymes, c'est au
 * pharmacien de trancher — proposer le premier de la liste reviendrait à
 * rattacher une ordonnance au mauvais dossier médical.
 */
async function findPatientByName(fullName: string, pharmacyId: string) {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 1);
  if (parts.length === 0) return null;

  const candidates = await prisma.patient.findMany({
    where: {
      ...activityScope(),

      pharmacyId,
      deletedAt: null,
      AND: parts.map((part) => ({
        OR: [
          { firstName: { contains: part, mode: "insensitive" as const } },
          { lastName: { contains: part, mode: "insensitive" as const } },
        ],
      })),
    },
    select: { id: true, firstName: true, lastName: true, email: true },
    take: 2,
  });

  return candidates.length === 1 ? candidates[0] : null;
}

/** Longueur maximale d'un côté, en pixels, transmise au lecteur. */
const READING_MAX_SIDE = 2000;

/**
 * Réduit une image avant lecture. Un PDF ou une image illisible par sharp
 * part tel quel : mieux vaut un envoi plus lourd qu'aucune lecture.
 */
async function prepareImageForReading(
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  if (!mimeType.startsWith("image/")) return { bytes, mimeType };
  try {
    const reduced = await sharp(bytes)
      .rotate()
      .resize({ width: READING_MAX_SIDE, height: READING_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    console.info(
      `[ordonnances] image réduite pour lecture — ${bytes.length} → ${reduced.length} octets.`,
    );
    return { bytes: new Uint8Array(reduced), mimeType: "image/jpeg" };
  } catch (error) {
    console.warn("[ordonnances] réduction impossible, envoi tel quel", error);
    return { bytes, mimeType };
  }
}
