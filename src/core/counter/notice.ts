/**
 * L'avis de comptoir : ce que le poste de caisse affiche en coin d'écran,
 * par-dessus le LGO, quand l'analyse d'une vente bipée est prête.
 *
 * Il tient en quelques lignes parce qu'il est lu en une seconde, pendant que
 * le client attend. Les alertes passent avant les conseils : on ne vend rien
 * par-dessus une alerte non lue. Le détail complet reste dans PharmaBoost,
 * un clic sur l'avis l'ouvre.
 */

export type NoticeAlert = { severity: string; subjectType: string; code: string; message: string; acknowledged: boolean };

/**
 * Les avertissements qui parlent de la couverture des données (référentiel
 * absent, classement par l'IA) : ils comptent sur l'écran complet, pas en coin
 * d'écran pendant que le client attend.
 */
const COVERAGE_CODES = new Set(["DRUG_NO_INTERACTION_DATA", "INTERACTION_NO_REFERENTIAL", "DEMO_REFERENTIAL", "DRUG_CLASSIFIED_BY_AI", "DRUG_NOT_IN_REFERENTIAL"]);
export type NoticeRecommendation = { name: string; priceCents: number | null; reason: string | null; status: string };

export type CounterNoticeInput = {
  reference: string;
  prescriptionStatus: string;
  lineNames: string[];
  alerts: NoticeAlert[];
  recommendations: NoticeRecommendation[];
  outcome: string | null;
};

export type CounterNotice = {
  /** PENDING : l'analyse n'est pas finie. READY : à afficher. CLOSED : plus rien à dire. */
  state: "PENDING" | "READY" | "CLOSED";
  title: string;
  /** Ce qui a été bipé, en une ligne. */
  subject: string;
  alerts: string[];
  /** Jusqu'à trois conseils : « Produit · 8,90 € · pourquoi ». */
  advice: string[];
  /** Une empreinte : si elle ne change pas, on ne réaffiche pas. */
  signature: string;
};

const MAX_ALERTS = 2;
const MAX_ADVICE = 3;
const RANK: Record<string, number> = { BLOCKING: 0, WARNING: 1, CAUTION: 2, INFO: 3 };
const SHOWN_STATUSES = new Set(["PROPOSED", "ACCEPTED", "MODIFIED"]);

function euros(cents: number | null): string | null {
  if (cents === null || cents <= 0) return null;
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

function shortName(name: string): string {
  // « DOLIPRANE 1000 mg, comprimé » → « DOLIPRANE 1000 mg » : la forme n'aide pas en coin d'écran.
  return name.replace(/,.*$/, "").trim();
}

export function buildCounterNotice(input: CounterNoticeInput): CounterNotice {
  const subject = input.lineNames.map(shortName).join(" · ");
  const base = { title: `PharmaBoost · ${input.reference}`, subject };
  if (["CANCELLED", "DELIVERED", "FAILED"].includes(input.prescriptionStatus)) {
    return { ...base, state: "CLOSED", alerts: [], advice: [], signature: `closed:${input.reference}` };
  }
  if (!["ANALYZED", "VALIDATED"].includes(input.prescriptionStatus)) {
    return { ...base, state: "PENDING", alerts: [], advice: [], signature: `pending:${input.reference}:${input.lineNames.length}` };
  }
  const alerts = [...input.alerts]
    .filter((alert) => !alert.acknowledged && !COVERAGE_CODES.has(alert.code) && (alert.severity === "BLOCKING" || alert.severity === "WARNING"))
    .sort((a, b) => (RANK[a.severity] ?? 9) - (RANK[b.severity] ?? 9))
    .slice(0, MAX_ALERTS)
    .map((alert) => alert.message);
  const advice = input.recommendations
    .filter((rec) => SHOWN_STATUSES.has(rec.status))
    .slice(0, MAX_ADVICE)
    .map((rec) => [shortName(rec.name), euros(rec.priceCents), rec.reason].filter(Boolean).join(" · "));
  if (advice.length === 0 && alerts.length === 0) {
    const why =
      input.outcome === "OUT_OF_STOCK" ? "Conseil possible mais produit absent du stock."
      : input.outcome === "SAFETY_FILTERED" ? "Conseils écartés par la sécurité."
      : "Rien à ajouter pour cette délivrance.";
    return { ...base, state: "READY", alerts: [], advice: [why], signature: `ready:${input.reference}:${input.lineNames.length}:none` };
  }
  return { ...base, state: "READY", alerts, advice, signature: `ready:${input.reference}:${input.lineNames.length}:${alerts.length}:${advice.join("|")}` };
}
