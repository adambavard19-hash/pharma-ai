import type { ConnectorOrder } from "@/core/partners/connector";
import { formatCents } from "@/lib/format";

/**
 * Ce qui part chez le partenaire — et seulement cela.
 *
 * Une commande ou une demande de contact transmise à un laboratoire contient :
 * le nom de l'officine, sa ville, son FINESS, son e-mail et son téléphone, les
 * lignes commandées, le montant, l'identifiant d'attribution PharmaBoost et la
 * note ou le message de l'officine. JAMAIS de patient, d'ordonnance ni de
 * conseil : les types d'entrée n'ont aucun champ pour en porter, et le texte
 * est figé ici, pas composé par le fournisseur d'envoi.
 *
 * Pur (aucun accès base ni réseau) : testé dans __tests__/connectors.test.ts.
 */

export type ConnectorPharmacy = ConnectorOrder["pharmacy"];

/** Une demande de contact de l'officine : qui rappeler, et pourquoi. */
export type ConnectorLead = {
  attributionCode: string;
  brandName: string;
  pharmacy: ConnectorPharmacy;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  message: string | null;
};

export type ComposedEmail = { subject: string; text: string };

const SIGNATURE = "PharmaBoost Partenaires";

/** Un champ d'une ligne : sans retour à la ligne (un sujet d'e-mail ne doit jamais en contenir). */
function oneLine(value: string | null | undefined): string {
  return (value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

/** Un texte libre de l'officine : retours à la ligne gardés, longueur bornée. */
function block(value: string | null | undefined, max = 2000): string {
  return (value ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);
}

function pharmacyLines(pharmacy: ConnectorPharmacy): string[] {
  return [
    `  Nom : ${oneLine(pharmacy.name)}`,
    `  Ville : ${oneLine(pharmacy.city) || "non renseignée"}`,
    `  FINESS : ${oneLine(pharmacy.finess) || "non renseigné"}`,
    `  E-mail : ${oneLine(pharmacy.email) || "non renseigné"}`,
    `  Téléphone : ${oneLine(pharmacy.phone) || "non renseigné"}`,
  ];
}

function attributionLines(code: string): string[] {
  return [
    `Identifiant d'attribution PharmaBoost : ${oneLine(code)}`,
    "Merci de le rappeler dans vos échanges avec l'officine et avec PharmaBoost.",
  ];
}

/** Le montant d'une commande : la somme des lignes, seulement si chaque prix professionnel est connu. */
export function orderTotalCents(lines: { quantity: number; unitPriceCents: number | null }[]): number | null {
  if (lines.length === 0) return null;
  let total = 0;
  for (const line of lines) {
    if (line.unitPriceCents === null || !Number.isFinite(line.unitPriceCents)) return null;
    total += line.unitPriceCents * line.quantity;
  }
  return total;
}

/** L'e-mail de commande adressé au contact commandes du partenaire. */
export function composeOrderEmail(order: ConnectorOrder, context: { brandName: string }): ComposedEmail {
  const brand = oneLine(context.brandName);
  const pharmacy = oneLine(order.pharmacy.name);
  const lines = order.lines.map((line) => {
    const codes = [line.ean ? `EAN ${oneLine(line.ean)}` : null, line.externalRef ? `réf. ${oneLine(line.externalRef)}` : null].filter(Boolean).join(", ");
    const price = line.unitPriceCents !== null ? ` — prix pro ${formatCents(line.unitPriceCents)} — ${formatCents(line.unitPriceCents * line.quantity)}` : " — prix pro à confirmer";
    return `  - ${line.quantity} × ${oneLine(line.name)}${codes ? ` (${codes})` : ""}${price}`;
  });
  const total =
    order.totalCents !== null
      ? `Montant : ${formatCents(order.totalCents)} (prix professionnels du catalogue publié sur PharmaBoost)`
      : "Montant : à confirmer (prix professionnel non renseigné pour au moins une ligne)";
  const note = block(order.note);

  const text = [
    "Bonjour,",
    "",
    `L'officine ci-dessous vous adresse une commande ${brand} par PharmaBoost Partenaires.`,
    "",
    "Officine",
    ...pharmacyLines(order.pharmacy),
    "",
    "Commande",
    ...lines,
    "",
    total,
    ...(note ? ["", "Note de l'officine :", note] : []),
    "",
    ...attributionLines(order.attributionCode),
    "",
    "Pour toute question sur cette commande, contactez directement l'officine (coordonnées ci-dessus).",
    "",
    `— ${SIGNATURE}`,
  ].join("\n");

  return { subject: `Commande ${brand} — ${pharmacy} — ${oneLine(order.attributionCode)}`, text };
}

/** L'e-mail de demande de contact adressé au contact du partenaire. */
export function composeLeadEmail(lead: ConnectorLead): ComposedEmail {
  const brand = oneLine(lead.brandName);
  const pharmacy = oneLine(lead.pharmacy.name);
  const message = block(lead.message);
  const person = [
    `  Nom : ${oneLine(lead.contactName) || "non renseigné"}`,
    `  E-mail : ${oneLine(lead.contactEmail) || "non renseigné"}`,
    `  Téléphone : ${oneLine(lead.contactPhone) || "non renseigné"}`,
  ];

  const text = [
    "Bonjour,",
    "",
    `L'officine ci-dessous souhaite être contactée au sujet de la marque ${brand}, par PharmaBoost Partenaires.`,
    "",
    "Officine",
    ...pharmacyLines(lead.pharmacy),
    "",
    "Personne à contacter",
    ...person,
    ...(message ? ["", "Message de l'officine :", message] : []),
    "",
    ...attributionLines(lead.attributionCode),
    "",
    `— ${SIGNATURE}`,
  ].join("\n");

  return { subject: `Demande de contact ${brand} — ${pharmacy} — ${oneLine(lead.attributionCode)}`, text };
}
