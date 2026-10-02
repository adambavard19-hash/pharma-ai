import { universeLabel } from "@/config/universes";
import { renderEmail, type EmailBlock, type EmailContext, type RenderedEmail } from "./email-layout";

/**
 * Les e-mails d'une candidature PharmaBoost Partenaires : l'accusé de
 * réception au laboratoire ou à la marque, et l'alerte à l'équipe. Rédigés
 * ici, jamais par un prestataire. Une candidature ne contient que les
 * coordonnées d'une société : aucune donnée patient, aucune ordonnance.
 */

export type PartnerAnswerValue = "YES" | "NO" | "UNKNOWN";

export type PartnerApplicationSummary = {
  company: string;
  brand: string;
  contactFirstName: string;
  contactLastName: string;
  contactRole: string | null;
  email: string;
  phone: string | null;
  website: string | null;
  /** Clés d'univers (`UNIVERSES`). */
  universes: string[];
  approxReferences: number | null;
  distribution: string | null;
  hasApi: PartnerAnswerValue;
  hasB2bPortal: boolean | null;
  hasCatalog: boolean | null;
  hasTrainings: boolean | null;
  message: string | null;
};

const ANSWER_LABELS: Record<PartnerAnswerValue, string> = { YES: "Oui", NO: "Non", UNKNOWN: "Ne sait pas" };

function yesNo(value: boolean | null): string {
  if (value === null) return "Non précisé";
  return value ? "Oui" : "Non";
}

export function universesText(keys: string[]): string | null {
  if (keys.length === 0) return null;
  return keys.map((key) => universeLabel(key)).join(", ");
}

/** L'accusé de réception : ce qui a été reçu, ce qui va se passer, et rien d'automatique. */
export function buildPartnerApplicationAcknowledgement(ctx: EmailContext, v: PartnerApplicationSummary): RenderedEmail {
  const recap: Array<[string, string]> = [
    ["Société", v.company],
    ["Marque", v.brand],
  ];
  const universes = universesText(v.universes);
  if (universes) recap.push(["Univers", universes]);

  return renderEmail(ctx, {
    subject: "Votre candidature PharmaBoost Partenaires est bien reçue",
    preheader: `Candidature de ${v.brand} enregistrée : notre équipe l'étudie et revient vers vous.`,
    eyebrow: "PharmaBoost Partenaires",
    title: "Votre candidature est bien reçue",
    greeting: `Bonjour ${v.contactFirstName},`,
    blocks: [
      { kind: "paragraph", text: `Nous avons bien reçu la candidature de ${v.brand} à PharmaBoost Partenaires. Merci de l'intérêt que vous portez aux officines qui utilisent PharmaBoost.`, strong: [v.brand] },
      { kind: "details", title: "Votre candidature", rows: recap },
      {
        kind: "steps",
        title: "La suite",
        items: [
          "Notre équipe étudie votre candidature.",
          "Nous vous recontactons pour un premier échange : vos gammes, vos conditions, votre façon de travailler.",
          "Si nous avançons ensemble, vos gammes sont présentées aux officines dans un espace distinct, signalé comme partenaire.",
        ],
      },
      { kind: "notice", text: "Aucune activation n'est automatique : chaque candidature est étudiée par notre équipe avant toute diffusion." },
      { kind: "note", text: "Le moteur de conseil de PharmaBoost reste indépendant : un partenariat ne donne jamais accès à une recommandation, et aucune donnée patient n'est transmise aux partenaires." },
      { kind: "note", text: "Vos informations servent uniquement à étudier votre candidature et à vous recontacter." },
    ],
    reason: "Vous recevez cet e-mail à la suite de votre candidature sur pharmaboost.app.",
  });
}

/** L'alerte à l'équipe : toute la candidature, et le lien vers la console. */
export function buildPartnerApplicationAlert(ctx: EmailContext, v: PartnerApplicationSummary & { adminUrl: string }): RenderedEmail {
  const rows: Array<[string, string | null]> = [
    ["Société", v.company],
    ["Marque", v.brand],
    ["Contact", `${v.contactFirstName} ${v.contactLastName}`.trim()],
    ["Fonction", v.contactRole],
    ["E-mail", v.email],
    ["Téléphone", v.phone],
    ["Site internet", v.website],
    ["Univers", universesText(v.universes)],
    ["Références (environ)", v.approxReferences !== null ? String(v.approxReferences) : null],
    ["Distribution", v.distribution],
    ["API disponible", ANSWER_LABELS[v.hasApi]],
    ["Portail B2B", yesNo(v.hasB2bPortal)],
    ["Catalogue disponible", yesNo(v.hasCatalog)],
    ["Formations disponibles", yesNo(v.hasTrainings)],
  ];
  const kept = rows.filter((row): row is [string, string] => Boolean(row[1]));
  const blocks: EmailBlock[] = [
    { kind: "paragraph", text: `${v.brand} (${v.company}) a déposé une candidature depuis le site.`, strong: [v.brand] },
    { kind: "details", title: "La candidature", rows: kept },
  ];
  if (v.message) blocks.push({ kind: "paragraph", text: `Message : ${v.message}` });
  blocks.push(
    { kind: "button", url: v.adminUrl, label: "Ouvrir la candidature" },
    { kind: "note", text: "Rien n'a été activé : la candidature attend son étude dans la console (Partenaires → Candidatures)." },
  );

  return renderEmail(ctx, {
    subject: `Candidature partenaire — ${v.brand} (${v.company})`,
    preheader: `${v.contactFirstName} ${v.contactLastName} · ${v.email}`,
    eyebrow: "PharmaBoost Partenaires",
    title: "Nouvelle candidature partenaire",
    blocks,
    signature: "PharmaBoost",
    reason: "Alerte interne envoyée à l'adresse de contact de la société.",
  });
}
