/**
 * Ce que la réglementation impose au comptoir, ligne par ligne.
 *
 * Deux sources officielles alimentent ces alertes, et rien d'autre :
 *
 *   - les conditions de prescription et de délivrance publiées par l'ANSM dans
 *     la Base de données publique des médicaments (« stupéfiants », « liste I »,
 *     « prescription initiale hospitalière annuelle »…), reprises MOT POUR MOT ;
 *   - le statut de prise en charge de la base tarifaire de l'Assurance Maladie
 *     (médicament d'exception, fin d'homologation).
 *
 * Ce module ne fait que traduire ces libellés en gestes de comptoir : quel
 * support d'ordonnance, quel document à réclamer, quelle durée maximale. Les
 * textes de référence sont cités à chaque alerte. Aucune règle n'est déduite
 * d'un nom de molécule ou d'une habitude : si la source ne le dit pas, on ne
 * le dit pas.
 */

export type RegulationSeverity =
  /** Sans cela, la facturation est rejetée, ou la délivrance est impossible en ville. */
  | "BLOCKING"
  /** À vérifier sur l'ordonnance avant de facturer. */
  | "CHECK"
  /** Bon à savoir : la règle de droit commun qui s'applique. */
  | "INFO";

export type RegulationSource = {
  label: string;
  url: string | null;
};

export type RegulationAlert = {
  code: string;
  severity: RegulationSeverity;
  title: string;
  /** Le geste à faire, en une ou deux phrases. */
  action: string;
  /** Le libellé de la source, repris tel quel, quand l'alerte en découle. */
  basis: string | null;
  sources: RegulationSource[];
};

export type CoverageFacts = {
  isException: boolean;
  /** Fin d'homologation aux assurés sociaux, si la source en annonce une. */
  coverageEndsAt: Date | null;
  coverageEndReason: string | null;
  /** « Médicament NON Remboursable aux Assurés Sociaux » sur la fiche. */
  notReimbursable: boolean;
  /** Date de mise à jour annoncée par la base tarifaire. */
  sourceUpdatedAt: Date | null;
};

export type RegulationInput = {
  /** Conditions de prescription et de délivrance, telles que publiées par l'ANSM. */
  conditions: string[];
  /** Statut de prise en charge, quand la base tarifaire connaît la boîte. */
  coverage: CoverageFacts | null;
  /** Durée de traitement lue sur l'ordonnance, en jours, si elle est connue. */
  durationDays: number | null;
  today: Date;
};

const CSP = (article: string): RegulationSource => ({
  label: `Code de la santé publique, ${article}`,
  url: "https://www.legifrance.gouv.fr/codes/id/LEGITEXT000006072665/",
});

const SOURCE_ANSM: RegulationSource = {
  label: "Base de données publique des médicaments — conditions de prescription et de délivrance (ANSM)",
  url: "https://base-donnees-publique.medicaments.gouv.fr",
};

const SOURCE_BDM_IT: RegulationSource = {
  label: "Base des médicaments et informations tarifaires (Assurance Maladie)",
  url: "http://www.codage.ext.cnamts.fr/codif/bdm_it/index_presentation.php?p_site=AMELI",
};

const SOURCE_EXCEPTION_FORM: RegulationSource = {
  label: "Arrêté du 17 juillet 2012 fixant le modèle « ordonnance de médicaments, de produits ou de prestations d'exception » (Cerfa 12708*02)",
  url: "https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000026229567",
};

const SOURCE_CSS_R163_2: RegulationSource = {
  label: "Code de la sécurité sociale, articles R. 163-2 (3e alinéa) et R. 165-1 — visés en tête du formulaire",
  url: "https://www.legifrance.gouv.fr/codes/id/LEGITEXT000006073189/",
};

const SOURCE_EXCEPTION_FORM_DOWNLOAD: RegulationSource = {
  label: "Formulaire Cerfa 12708*02 (service-public.fr)",
  url: "https://entreprendre.service-public.gouv.fr/vosdroits/R2120",
};

/** Un libellé sans accents ni majuscules, pour reconnaître une famille de conditions. */
function fold(label: string): string {
  return label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** « prescription limitée à 4 semaines » → 28 ; « 7 jours ou 28 jours » → 28 (le plus large). */
export function durationLimitDays(label: string): number | null {
  const folded = fold(label);
  if (!folded.startsWith("prescription limitee a")) return null;
  const matches = [...folded.matchAll(/(\d+)\s*(jour|semaine|mois)/g)];
  if (matches.length === 0) return null;
  const days = matches.map(([, amount, unit]) => {
    const value = Number(amount);
    if (unit === "jour") return value;
    if (unit === "semaine") return value * 7;
    return value * 30;
  });
  return Math.max(...days);
}

/** « délivrance fractionnée de 7 jours » → 7. */
function splitDays(label: string): number | null {
  const match = /delivrance fractionnee de (\d+) jours?/.exec(fold(label));
  return match ? Number(match[1]) : null;
}

/** « prescription initiale hospitalière annuelle » → 12, semestrielle → 6, trimestrielle → 3, sinon null. */
function initialHospitalMonths(label: string): number | null {
  const folded = fold(label);
  if (folded.includes("annuelle")) return 12;
  if (folded.includes("semestrielle")) return 6;
  if (folded.includes("trimestrielle")) return 3;
  return null;
}

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function fromCondition(label: string, durationDays: number | null): RegulationAlert | null {
  const folded = fold(label);

  if (folded === "stupefiants") {
    return {
      code: "NARCOTIC",
      severity: "BLOCKING",
      title: "Stupéfiant : ordonnance sécurisée obligatoire",
      action:
        "Exiger une ordonnance sécurisée avec dosage, posologie et durée en toutes lettres. La totalité ne se délivre que si l'ordonnance est présentée dans les 3 jours suivant sa date ; au-delà, seule la durée restante. Pas de chevauchement avec une délivrance en cours sans mention expresse du prescripteur.",
      basis: label,
      sources: [SOURCE_ANSM, CSP("articles R. 5132-5, R. 5132-29 et R. 5132-33")],
    };
  }
  if (folded.startsWith("prescription sur ordonnance securisee") || folded.startsWith("prescription en toutes lettres sur ordonnance securisee")) {
    return {
      code: "SECURED_FORM",
      severity: "BLOCKING",
      title: "Ordonnance sécurisée obligatoire",
      action:
        folded.includes("toutes lettres")
          ? "Vérifier le support sécurisé (papier filigrané, numéro de lot, carré de microlettres) et que dosage, posologie et durée sont écrits en toutes lettres."
          : "Vérifier le support sécurisé : papier filigrané, numéro de lot du papier, carré de microlettres où figure le nombre de médicaments prescrits.",
      basis: label,
      sources: [SOURCE_ANSM, CSP("article R. 5132-5")],
    };
  }
  if (folded === "reserve a l'usage hospitalier" || folded === "delivrance reservee aux pharmacies a usage interieur") {
    return {
      code: "HOSPITAL_ONLY",
      severity: "BLOCKING",
      title: "Non délivrable en officine",
      action: "Ce médicament est réservé à l'usage hospitalier ou aux pharmacies à usage intérieur : il ne se délivre pas au comptoir. Orienter vers l'établissement.",
      basis: label,
      sources: [SOURCE_ANSM, CSP("articles R. 5121-77 et suivants (prescription restreinte)")],
    };
  }
  if (folded === "prescription hospitaliere") {
    return {
      code: "HOSPITAL_PRESCRIPTION",
      severity: "CHECK",
      title: "Prescription hospitalière exigée",
      action: "Chaque ordonnance doit venir d'un prescripteur exerçant en établissement de santé. Vérifier l'en-tête et l'identification du prescripteur.",
      basis: label,
      sources: [SOURCE_ANSM, CSP("articles R. 5121-77 et suivants (prescription restreinte)")],
    };
  }
  if (folded.startsWith("prescription initiale hospitaliere") || folded.startsWith("prescription initiale par un medecin exercant dans un service de dialyse")) {
    const months = initialHospitalMonths(label);
    return {
      code: "INITIAL_HOSPITAL",
      severity: "CHECK",
      title: months ? `Prescription initiale hospitalière (${months} mois)` : "Prescription initiale hospitalière",
      action: months
        ? `Sur un renouvellement de ville, réclamer l'ordonnance hospitalière initiale (ou sa copie) datant de moins de ${months} mois et la conserver avec la facturation.`
        : "Sur un renouvellement de ville, réclamer l'ordonnance hospitalière initiale (ou sa copie) et la conserver avec la facturation.",
      basis: label,
      sources: [SOURCE_ANSM, CSP("articles R. 5121-77 et suivants (prescription restreinte)")],
    };
  }
  if (
    folded.startsWith("prescription reservee aux") ||
    folded.startsWith("prescription initiale reservee") ||
    folded.startsWith("prescription initiale annuelle reservee") ||
    folded.startsWith("prescription initiale semestrielle reservee") ||
    folded.startsWith("renouvellement de la prescription reserve") ||
    folded.startsWith("pour ") && folded.includes("reservee a certains specialistes")
  ) {
    return {
      code: "SPECIALIST",
      severity: "CHECK",
      title: "Prescripteur à vérifier",
      action: "Vérifier que la qualification du prescripteur correspond à la condition ci-dessous. Sinon, la prise en charge est refusée.",
      basis: label,
      sources: [SOURCE_ANSM, CSP("articles R. 5121-77 et suivants (prescription restreinte)")],
    };
  }
  if (folded.includes("surveillance particuliere")) {
    return {
      code: "MONITORING",
      severity: "CHECK",
      title: "Surveillance particulière pendant le traitement",
      action: "La prescription est subordonnée à des examens périodiques. Vérifier que l'ordonnance mentionne que les examens exigés ont été réalisés.",
      basis: label,
      sources: [SOURCE_ANSM, CSP("articles R. 5121-77 et suivants (prescription restreinte)")],
    };
  }
  if (
    folded.includes("accord de soins") ||
    folded.includes("attestation") ||
    folded.includes("carnet patient") ||
    folded.includes("programme de prevention de la grossesse")
  ) {
    return {
      code: "PATIENT_DOCUMENT",
      severity: "CHECK",
      title: "Document patient à vérifier avant de délivrer",
      action: "Réclamer le document exigé (accord de soins, attestation co-signée, carnet patient) et vérifier qu'il est à jour avant toute délivrance.",
      basis: label,
      sources: [SOURCE_ANSM],
    };
  }
  if (folded.includes("depistage d'un deficit en dpd")) {
    return {
      code: "DPD_TEST",
      severity: "CHECK",
      title: "Résultat du dépistage DPD exigé",
      action: "La prescription et la délivrance sont subordonnées au résultat du dépistage du déficit en dihydropyrimidine déshydrogénase. Vérifier qu'il est disponible.",
      basis: label,
      sources: [SOURCE_ANSM],
    };
  }
  const limit = durationLimitDays(label);
  if (limit !== null) {
    const exceeded = durationDays !== null && durationDays > limit;
    return {
      code: "DURATION_LIMIT",
      severity: exceeded ? "BLOCKING" : "CHECK",
      title: exceeded ? `Durée prescrite au-delà du maximum (${limit} jours)` : `Durée de prescription limitée à ${limit} jours`,
      action: exceeded
        ? `L'ordonnance porte ${durationDays} jours de traitement alors que la prescription est limitée à ${limit} jours. Ne délivrer que jusqu'à la limite, et le signaler au prescripteur.`
        : `Vérifier que la durée prescrite ne dépasse pas ${limit} jours : au-delà, la délivrance s'arrête à la limite.`,
      basis: label,
      sources: [SOURCE_ANSM],
    };
  }
  const split = splitDays(label);
  if (split !== null) {
    return {
      code: "SPLIT_DISPENSING",
      severity: "CHECK",
      title: `Délivrance fractionnée par ${split} jours`,
      action: `Ne délivrer que ${split} jours de traitement à la fois, sauf mention expresse contraire du prescripteur sur l'ordonnance.`,
      basis: label,
      sources: [SOURCE_ANSM, CSP("article R. 5132-30")],
    };
  }
  if (folded === "liste i") {
    return {
      code: "LIST_I",
      severity: "INFO",
      title: "Liste I",
      action: "Renouvellement interdit sauf mention expresse du prescripteur. Première délivrance dans les 3 mois suivant la date de l'ordonnance ; 12 mois de traitement au plus.",
      basis: label,
      sources: [SOURCE_ANSM, CSP("articles R. 5132-21 et R. 5132-22")],
    };
  }
  if (folded === "liste ii") {
    return {
      code: "LIST_II",
      severity: "INFO",
      title: "Liste II",
      action: "Renouvelable sauf mention contraire du prescripteur. Première délivrance dans les 3 mois suivant la date de l'ordonnance ; 12 mois de traitement au plus.",
      basis: label,
      sources: [SOURCE_ANSM, CSP("articles R. 5132-21 et R. 5132-22")],
    };
  }
  if (folded === "renouvellement non restreint") return null;
  // Toute autre condition publiée est montrée telle quelle : elle existe, on
  // ne la cache pas, mais on ne lui invente pas de geste.
  return {
    code: "OTHER_CONDITION",
    severity: "INFO",
    title: "Condition de prescription publiée",
    action: "Lire la condition ci-dessous et vérifier qu'elle est respectée.",
    basis: label,
    sources: [SOURCE_ANSM],
  };
}

function fromCoverage(coverage: CoverageFacts, today: Date): RegulationAlert[] {
  const alerts: RegulationAlert[] = [];
  if (coverage.isException) {
    alerts.push({
      code: "EXCEPTION_FORM",
      severity: "BLOCKING",
      title: "Ordonnance de médicament d'exception obligatoire",
      // Ce qu'il y a à contrôler vient du formulaire lui-même (Cerfa
      // 12708*02, spécimen relu le 17 septembre 2026) : le bon support, la
      // partie prescripteur signée — qui atteste la conformité à la fiche
      // d'information thérapeutique de la HAS —, et la partie pharmacien.
      action:
        "Facturable à l'Assurance Maladie uniquement sur l'ordonnance de médicaments, de produits ou de prestations d'exception (Cerfa 12708*02, 4 volets). Sur une ordonnance ordinaire, le dossier est rejeté. Vérifier : le formulaire lui-même, pas une ordonnance classique ; la case « médicament » cochée avec nom, forme, dosage, posologie, voie et durée ; la date et la signature du prescripteur, qui attestent la conformité à la fiche d'information thérapeutique de la HAS ; si la prescription initiale vient d'un établissement, la date limite de la prochaine consultation. Compléter la partie pharmacien (identification, mentions obligatoires, date de délivrance) avant de transmettre.",
      basis: "Statut d'Exception : Oui (base tarifaire de l'Assurance Maladie)",
      sources: [SOURCE_BDM_IT, SOURCE_CSS_R163_2, SOURCE_EXCEPTION_FORM, SOURCE_EXCEPTION_FORM_DOWNLOAD],
    });
  }
  if (coverage.coverageEndsAt && coverage.coverageEndsAt.getTime() < today.getTime()) {
    const since = coverage.sourceUpdatedAt ? ` (base du ${formatDay(coverage.sourceUpdatedAt)})` : "";
    alerts.push({
      code: "COVERAGE_ENDED",
      severity: "CHECK",
      title: `Fin de prise en charge annoncée au ${formatDay(coverage.coverageEndsAt)}`,
      action: `La base tarifaire de l'Assurance Maladie${since} annonce la fin de l'homologation aux assurés sociaux${coverage.coverageEndReason ? ` (motif : ${coverage.coverageEndReason.toLowerCase()})` : ""}. Vérifier la prise en charge dans le logiciel de facturation avant de transmettre.`,
      basis: null,
      sources: [SOURCE_BDM_IT],
    });
  }
  if (coverage.notReimbursable) {
    alerts.push({
      code: "NOT_REIMBURSABLE",
      severity: "INFO",
      title: "Non remboursable aux assurés sociaux",
      action: "La base tarifaire indique ce médicament comme non remboursable : ne pas le facturer à l'Assurance Maladie.",
      basis: null,
      sources: [SOURCE_BDM_IT],
    });
  }
  return alerts;
}

const SEVERITY_ORDER: Record<RegulationSeverity, number> = { BLOCKING: 0, CHECK: 1, INFO: 2 };

/**
 * Les alertes d'une ligne, des plus contraignantes aux plus informatives.
 * Deux conditions qui mènent au même geste (deux spécialités habilitées, par
 * exemple) donnent deux alertes distinctes : chacune porte son libellé source.
 */
export function evaluateRegulation(input: RegulationInput): RegulationAlert[] {
  const alerts: RegulationAlert[] = [];
  if (input.coverage) alerts.push(...fromCoverage(input.coverage, input.today));
  for (const label of input.conditions) {
    const alert = fromCondition(label, input.durationDays);
    if (alert) alerts.push(alert);
  }
  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Vrai si au moins une alerte impose un support ou un document avant de facturer. */
export function requiresAttention(alerts: RegulationAlert[]): boolean {
  return alerts.some((alert) => alert.severity !== "INFO");
}
