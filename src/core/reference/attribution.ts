/**
 * La source du catalogue national, et ce que sa licence nous oblige à écrire.
 *
 * La Base de Données Publique des Médicaments est réutilisable, à condition de
 * mentionner la source ET sa date de mise à jour, de ne pas altérer les données
 * ni en dénaturer le sens, et de ne rien laisser croire d'un aval de l'ANSM, de
 * la HAS ou de l'UNCAM.
 *
 * Ces obligations vivent ici, dans une fonction unique et testée, plutôt que
 * recopiées d'écran en écran : une mention qu'on oublie de mettre à jour est une
 * mention fausse.
 */

import { TIME_ZONE } from "@/config/constants";

export const BDPM_SOURCE = {
  name: "Base de données publique des médicaments",
  url: "https://base-donnees-publique.medicaments.gouv.fr",
  downloadUrl: "https://base-donnees-publique.medicaments.gouv.fr/telechargement",
  /**
   * Publiée par l'ANSM, la HAS et l'UNCAM. On les nomme parce que c'est exact ;
   * jamais d'une façon qui laisserait croire qu'ils cautionnent PharmaBoost.
   * Formulation figée : « l'HAS » serait fautif.
   */
  publishersLabel: "l'ANSM, la HAS et l'UNCAM",
} as const;

/**
 * La famille officielle (code ATC) d'une spécialité, quand le modèle ne répond pas : la base complète Open Medic de
 * l'Assurance Maladie donne chaque boîte remboursée avec son code ATC ; jointe à la BDPM par le CIP13, elle donne la
 * famille de la spécialité (`src/core/reference/atc`, `scripts/atc-officiel.ts`). La BDPM, elle, ne publie pas l'ATC.
 *
 * Licence Ouverte (Etalab) : nommer la source et la date de sa dernière mise à jour, ne pas en dénaturer le sens, et ne
 * rien laisser croire d'un aval de l'Assurance Maladie.
 */
export const OPEN_MEDIC_SOURCE = {
  name: "Open Medic (Assurance Maladie)",
  publisher: "la Caisse nationale de l'Assurance Maladie",
  licence: "Licence Ouverte / Open Licence (Etalab)",
  url: "https://open-data-assurance-maladie.ameli.fr/medicaments/index.php",
} as const;

/** La mention des familles officielles : la source, son millésime, sa date de publication quand on la connaît, la licence. */
export function officialAtcAttribution(source: { year: string; publishedOn: string | null }): string {
  const published = source.publishedOn
    ? `, publiée le ${new Date(`${source.publishedOn}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: TIME_ZONE })}`
    : "";
  return `Familles ATC : ${OPEN_MEDIC_SOURCE.name}, base complète ${source.year}${published} — ${OPEN_MEDIC_SOURCE.licence}, ${OPEN_MEDIC_SOURCE.url} — jointe à la ${BDPM_SOURCE.name}.`;
}

/**
 * La base est mise à jour tous les mois. Au-delà de cette ancienneté, le
 * référentiel est signalé comme à resynchroniser — la licence demande de
 * maintenir les données à jour.
 */
export const REFERENCE_STALE_AFTER_DAYS = 45;

export type ReferenceCounts = {
  specialties: number;
  presentations: number;
  substances: number;
};

/** Une tentative de synchronisation qui n'a pas abouti. */
export type ReferenceImportFailure = { attemptedAt: string; error: string | null };

/**
 * `FAILED` ne décrit qu'un cas : aucun catalogue n'a jamais été chargé et la
 * dernière tentative a échoué. Dès qu'un import a réussi une fois, l'état reste
 * `READY`/`STALE` — un échec postérieur est signalé par `lastFailure` sans
 * masquer le catalogue en place. Une synchronisation ratée n'efface rien, et
 * l'écran ne doit pas laisser croire le contraire.
 */
export type ReferenceCatalogState =
  | { status: "NOT_IMPORTED" }
  | ({ status: "FAILED" } & ReferenceImportFailure)
  | {
      status: "READY" | "STALE";
      /** Date de mise à jour annoncée par la source, jamais celle de notre import. */
      sourceUpdatedAt: string | null;
      importedAt: string;
      ageDays: number | null;
      counts: ReferenceCounts;
      /** Tentative postérieure au dernier import réussi, si elle a échoué. */
      lastFailure: ReferenceImportFailure | null;
    };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ancienneté, en jours pleins, de la version publiée par la source. */
export function referenceAgeDays(sourceUpdatedAt: Date | null, now: Date): number | null {
  if (!sourceUpdatedAt) return null;
  return Math.floor((now.getTime() - sourceUpdatedAt.getTime()) / DAY_MS);
}

export function isReferenceStale(ageDays: number | null): boolean {
  // Une date de mise à jour inconnue n'est pas traitée comme périmée : elle est
  // simplement inconnue, et l'écran le dit. Inventer une ancienneté serait pire
  // que de ne pas en afficher.
  return ageDays !== null && ageDays > REFERENCE_STALE_AFTER_DAYS;
}

/**
 * La mention à afficher partout où une donnée médicamenteuse est présentée.
 *
 * Elle nomme la source et sa date de mise à jour, et rien d'autre : pas de
 * logo, pas de formulation suggérant une reconnaissance officielle.
 */
export function referenceAttribution(state: ReferenceCatalogState): string {
  if (state.status === "NOT_IMPORTED" || state.status === "FAILED") {
    return `Aucune donnée issue de la ${BDPM_SOURCE.name} n'est chargée.`;
  }

  if (!state.sourceUpdatedAt) {
    return `Source : ${BDPM_SOURCE.name} — ${BDPM_SOURCE.url}. Date de mise à jour non communiquée par la source.`;
  }

  // La date publiée par la source se lit en heure de Paris, quel que soit le
  // fuseau de la machine : un « 1er août » ne doit pas devenir « 31 juillet ».
  const date = new Date(state.sourceUpdatedAt).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  });

  return `Source : ${BDPM_SOURCE.name} — ${BDPM_SOURCE.url}, mise à jour du ${date}.`;
}
