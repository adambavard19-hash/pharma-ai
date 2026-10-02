import "server-only";
import { prisma } from "@/server/db/client";
import { isUniverseKey } from "@/config/universes";
import { b2bLinkFor } from "@/core/partners/attribution";
import { estimateCommission, type CommissionEstimate } from "@/core/partners/commission";
import { CONNECTOR_CAPABILITIES, type ConnectorCapability } from "@/core/partners/connector";
import {
  canMovePublication,
  CONTRACT_TYPES,
  INTEGRATION_MODES,
  slugify,
  type ApplicationStatus,
  type ContractType,
  type IntegrationMode,
  type PublicationStatus,
} from "@/core/partners/status";

/**
 * Les fiches partenaires, côté console PharmaBoost.
 *
 * Un partenaire (laboratoire, société) porte ses contacts, ses contrats
 * internes et ses modes d'intégration. Rien ici n'est lu par une officine
 * directement : la diffusion passe par le statut de publication du partenaire
 * et de ses marques (src/core/partners/visibility.ts). Les contrats sont
 * strictement internes et ne déclenchent aucune facturation ; l'estimation de
 * commission est indicative et ne porte que sur des commandes réellement
 * attribuées. Aucun secret n'est stocké : une clé d'API ne vit jamais en base.
 *
 * Chaque fonction qui reçoit un identifiant venu du client le revérifie
 * (partenaire, puis contact / contrat / intégration DE ce partenaire) avant
 * d'écrire.
 */

// ---------------------------------------------------------------------------
// Normalisation des saisies (pur : testé sans base)
// ---------------------------------------------------------------------------

export type FieldErrors = Record<string, string>;
export type Normalized<T> = { ok: true; data: T } | { ok: false; fieldErrors: FieldErrors };

const trimmed = (value: string | null | undefined): string | null => {
  const text = (value ?? "").trim();
  return text.length > 0 ? text : null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Un site web : on ajoute « https:// » s'il manque, et seuls http(s) sont admis. */
export function normalizeWebsite(raw: string | null | undefined): { ok: true; value: string | null } | { ok: false } {
  const text = trimmed(raw);
  if (!text) return { ok: true, value: null };
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false };
    if (!url.hostname.includes(".")) return { ok: false };
    return { ok: true, value: url.toString() };
  } catch {
    return { ok: false };
  }
}

/** Une adresse https stricte (logo, formulaire) : rien d'autre n'est accepté. */
export function normalizeHttpsUrl(raw: string | null | undefined): { ok: true; value: string | null } | { ok: false } {
  const text = trimmed(raw);
  if (!text) return { ok: true, value: null };
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || !url.hostname.includes(".")) return { ok: false };
    return { ok: true, value: url.toString() };
  } catch {
    return { ok: false };
  }
}

/** « 2026-10-01 » → minuit UTC de ce jour ; vide → null ; illisible → undefined. */
export function parseDateInput(raw: string | null | undefined): Date | null | undefined {
  const text = trimmed(raw);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) return undefined;
  return date;
}

/** Date stockée → valeur d'un champ `type="date"`. */
export function dateInputOf(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

/** « 1 250,50 » (euros) → 125050 centimes ; vide → null ; illisible ou négatif → undefined. */
export function parseEurosToCents(raw: string | null | undefined): number | null | undefined {
  const text = trimmed(raw);
  if (!text) return null;
  const normalized = text.replace(/[\s  €]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  const cents = Math.round(Number.parseFloat(normalized) * 100);
  return Number.isFinite(cents) && cents >= 0 ? cents : undefined;
}

/** « 7,5 » → 7.5 ; borné à [0, 100], deux décimales au plus. */
export function parsePercent(raw: string | null | undefined): number | null | undefined {
  const text = trimmed(raw);
  if (!text) return null;
  const normalized = text.replace(/[\s %]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : undefined;
}

/** Garde les seuls univers connus, sans doublon, dans l'ordre reçu. */
export function knownUniverses(keys: readonly string[]): string[] {
  return [...new Set(keys.filter((key) => isUniverseKey(key)))];
}

/** Le premier slug libre : « marque », puis « marque-2 », « marque-3 »… */
export function pickUniqueSlug(label: string, taken: Iterable<string>): string {
  const base = slugify(label) || "partenaire";
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let index = 2; ; index++) {
    const suffix = `-${index}`;
    const candidate = `${base.slice(0, 60 - suffix.length)}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

export type PartnerIdentityInput = {
  name: string;
  legalName?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  description?: string | null;
  universes?: string[];
  startsAt?: string | null;
  endsAt?: string | null;
  notes?: string | null;
};

export type PartnerIdentityData = {
  name: string;
  legalName: string | null;
  website: string | null;
  logoUrl: string | null;
  description: string | null;
  universes: string[];
  startsAt: Date | null;
  endsAt: Date | null;
  notes: string | null;
};

export function normalizePartnerIdentity(input: PartnerIdentityInput): Normalized<PartnerIdentityData> {
  const errors: FieldErrors = {};
  const name = trimmed(input.name);
  if (!name || name.length < 2) errors.name = "Indiquez le nom du partenaire.";
  else if (name.length > 120) errors.name = "120 caractères au plus.";

  const website = normalizeWebsite(input.website);
  if (!website.ok) errors.website = "Adresse du site illisible.";
  const logo = normalizeHttpsUrl(input.logoUrl);
  if (!logo.ok) errors.logoUrl = "Le logo doit être une adresse https.";

  const startsAt = parseDateInput(input.startsAt);
  const endsAt = parseDateInput(input.endsAt);
  if (startsAt === undefined) errors.startsAt = "Date illisible.";
  if (endsAt === undefined) errors.endsAt = "Date illisible.";
  if (startsAt && endsAt && endsAt < startsAt) errors.endsAt = "La fin précède le début.";

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    data: {
      name: name!,
      legalName: trimmed(input.legalName),
      website: website.ok ? website.value : null,
      logoUrl: logo.ok ? logo.value : null,
      description: trimmed(input.description),
      universes: knownUniverses(input.universes ?? []),
      startsAt: startsAt ?? null,
      endsAt: endsAt ?? null,
      notes: trimmed(input.notes),
    },
  };
}

export type ContactInput = {
  firstName: string;
  lastName: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary: boolean;
  receivesOrders: boolean;
};

export type ContactData = {
  firstName: string;
  lastName: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  receivesOrders: boolean;
};

export function normalizeContact(input: ContactInput): Normalized<ContactData> {
  const errors: FieldErrors = {};
  const firstName = trimmed(input.firstName);
  const lastName = trimmed(input.lastName);
  const email = trimmed(input.email)?.toLowerCase() ?? null;
  if (!firstName) errors.firstName = "Prénom requis.";
  if (!lastName) errors.lastName = "Nom requis.";
  if (email && !EMAIL_PATTERN.test(email)) errors.email = "Adresse e-mail illisible.";
  // Un contact qui reçoit les commandes les reçoit par e-mail : sans adresse, il ne recevrait rien.
  if (input.receivesOrders && !email) errors.email = "Une adresse e-mail est nécessaire pour recevoir les commandes.";
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    data: { firstName: firstName!, lastName: lastName!, role: trimmed(input.role), email, phone: trimmed(input.phone), isPrimary: input.isPrimary, receivesOrders: input.receivesOrders },
  };
}

export type ContractInput = {
  type: string;
  startsAt?: string | null;
  endsAt?: string | null;
  /** Montants saisis en euros (« 1 200,00 »). */
  fixedAmount?: string | null;
  commissionPercent?: string | null;
  commissionPerUnit?: string | null;
  minimum?: string | null;
  notes?: string | null;
};

export type ContractData = {
  type: ContractType;
  startsAt: Date | null;
  endsAt: Date | null;
  fixedAmountCents: number | null;
  commissionPercent: number | null;
  commissionPerUnitCents: number | null;
  minimumCents: number | null;
  notes: string | null;
};

export function normalizeContract(input: ContractInput): Normalized<ContractData> {
  const errors: FieldErrors = {};
  const type = CONTRACT_TYPES.find((value) => value === input.type);
  if (!type) errors.type = "Type de contrat inconnu.";

  const startsAt = parseDateInput(input.startsAt);
  const endsAt = parseDateInput(input.endsAt);
  if (startsAt === undefined) errors.startsAt = "Date illisible.";
  if (endsAt === undefined) errors.endsAt = "Date illisible.";
  if (startsAt && endsAt && endsAt < startsAt) errors.endsAt = "La fin précède le début.";

  const fixed = parseEurosToCents(input.fixedAmount);
  const percent = parsePercent(input.commissionPercent);
  const perUnit = parseEurosToCents(input.commissionPerUnit);
  const minimum = parseEurosToCents(input.minimum);
  if (fixed === undefined) errors.fixedAmount = "Montant illisible.";
  if (percent === undefined) errors.commissionPercent = "Pourcentage entre 0 et 100.";
  if (perUnit === undefined) errors.commissionPerUnit = "Montant illisible.";
  if (minimum === undefined) errors.minimum = "Montant illisible.";

  // Ce que chaque type retient : un forfait n'a pas de pourcentage, un pilote n'a aucun montant.
  const usesFixed = type === "FLAT_FEE" || type === "HYBRID";
  const usesVariable = type === "COMMISSION" || type === "HYBRID";
  if (usesFixed && fixed === null) errors.fixedAmount = "Indiquez le montant fixe.";
  if (usesVariable && percent === null && perUnit === null) errors.commissionPercent = "Indiquez un pourcentage ou un montant par unité.";

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    data: {
      type: type!,
      startsAt: startsAt ?? null,
      endsAt: endsAt ?? null,
      fixedAmountCents: usesFixed ? (fixed ?? null) : null,
      commissionPercent: usesVariable ? (percent ?? null) : null,
      commissionPerUnitCents: usesVariable ? (perUnit ?? null) : null,
      minimumCents: usesVariable ? (minimum ?? null) : null,
      notes: trimmed(input.notes),
    },
  };
}

export type IntegrationInput = {
  mode: string;
  isActive: boolean;
  b2bUrlTemplate?: string | null;
  orderEmail?: string | null;
  formUrl?: string | null;
  capabilities?: string[];
  notes?: string | null;
};

export type IntegrationData = {
  mode: IntegrationMode;
  isActive: boolean;
  b2bUrlTemplate: string | null;
  orderEmail: string | null;
  formUrl: string | null;
  capabilities: ConnectorCapability[];
  notes: string | null;
};

/** Code d'exemple pour vérifier qu'un modèle de lien produit bien une adresse https. */
const SAMPLE_CODE = "PB-ABCD-EFGH";

export function normalizeIntegration(input: IntegrationInput): Normalized<IntegrationData> {
  const errors: FieldErrors = {};
  const mode = INTEGRATION_MODES.find((value) => value === input.mode);
  if (!mode) errors.mode = "Mode inconnu.";

  const template = trimmed(input.b2bUrlTemplate);
  if (template && !b2bLinkFor(template, SAMPLE_CODE)) errors.b2bUrlTemplate = "Le lien B2B doit être une adresse https.";
  const form = normalizeHttpsUrl(input.formUrl);
  if (!form.ok) errors.formUrl = "Le formulaire doit être une adresse https.";
  const email = trimmed(input.orderEmail)?.toLowerCase() ?? null;
  if (email && !EMAIL_PATTERN.test(email)) errors.orderEmail = "Adresse e-mail illisible.";

  // Une intégration active doit pouvoir fonctionner : son mode a besoin de sa donnée.
  if (input.isActive) {
    if (mode === "B2B_LINK" && !template) errors.b2bUrlTemplate = "Un lien B2B actif a besoin de son modèle de lien.";
    if (mode === "FORM" && !trimmed(input.formUrl)) errors.formUrl = "Un formulaire actif a besoin de son adresse.";
    if (mode === "EMAIL" && !email) errors.orderEmail = "Un envoi par e-mail actif a besoin de l'adresse de commande.";
  }

  const capabilities = CONNECTOR_CAPABILITIES.filter((capability) => (input.capabilities ?? []).includes(capability));

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    data: {
      mode: mode!,
      isActive: input.isActive,
      b2bUrlTemplate: template,
      orderEmail: email,
      formUrl: form.ok ? form.value : null,
      capabilities,
      notes: trimmed(input.notes),
    },
  };
}

// ---------------------------------------------------------------------------
// Lectures utilitaires (pur)
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Une période [début, fin] couvre-t-elle cet instant ? La fin est incluse jusqu'au soir. */
export function periodCovers(startsAt: Date | null, endsAt: Date | null, at: Date): boolean {
  if (startsAt && startsAt.getTime() > at.getTime()) return false;
  if (endsAt && endsAt.getTime() + DAY_MS <= at.getTime()) return false;
  return true;
}

/** Le contrat en cours : couvrant aujourd'hui, le plus récemment créé. */
export function currentContractOf<T extends { startsAt: Date | null; endsAt: Date | null; createdAt: Date }>(contracts: T[], at: Date): T | null {
  return (
    contracts
      .filter((contract) => periodCovers(contract.startsAt, contract.endsAt, at))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
  );
}

export type AttributedOrder = { createdAt: Date; totalCents: number | null; lines: { quantity: number; unitPriceCents: number | null }[] };

/**
 * Le volume réellement attribué sur une période : montant HT (le total de la
 * commande, sinon la somme de ses lignes chiffrées) et unités. Une commande
 * sans aucun montant compte pour ses unités, jamais pour un montant supposé.
 */
export function attributedVolume(orders: AttributedOrder[], startsAt: Date | null, endsAt: Date | null) {
  let amountCents = 0;
  let units = 0;
  let count = 0;
  let unpriced = 0;
  for (const order of orders) {
    if (!periodCovers(startsAt, endsAt, order.createdAt)) continue;
    count += 1;
    const lineUnits = order.lines.reduce((sum, line) => sum + Math.max(0, line.quantity), 0);
    units += lineUnits;
    if (order.totalCents !== null) {
      amountCents += Math.max(0, order.totalCents);
    } else {
      const priced = order.lines.filter((line) => line.unitPriceCents !== null);
      if (priced.length === 0) unpriced += 1;
      amountCents += priced.reduce((sum, line) => sum + Math.max(0, line.unitPriceCents ?? 0) * Math.max(0, line.quantity), 0);
    }
  }
  return { amountCents, units, count, unpriced };
}

function decimalToNumber(value: { toString(): string } | null): number | null {
  if (value === null) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

// ---------------------------------------------------------------------------
// Lectures en base
// ---------------------------------------------------------------------------

export type PartnerListRow = {
  id: string;
  name: string;
  slug: string;
  legalName: string | null;
  status: PublicationStatus;
  brands: number;
  currentContract: ContractType | null;
  contracts: number;
  integration: { mode: IntegrationMode; isActive: boolean } | null;
  integrations: number;
  createdAt: Date;
};

export async function listPartners(now = new Date()): Promise<PartnerListRow[]> {
  const partners = await prisma.partner.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      legalName: true,
      status: true,
      createdAt: true,
      _count: { select: { brands: true } },
      contracts: { select: { type: true, startsAt: true, endsAt: true, createdAt: true } },
      integrations: { select: { mode: true, isActive: true, updatedAt: true }, orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }] },
    },
  });
  return partners.map((partner) => ({
    id: partner.id,
    name: partner.name,
    slug: partner.slug,
    legalName: partner.legalName,
    status: partner.status,
    brands: partner._count.brands,
    currentContract: currentContractOf(partner.contracts, now)?.type ?? null,
    contracts: partner.contracts.length,
    integration: partner.integrations[0] ? { mode: partner.integrations[0].mode, isActive: partner.integrations[0].isActive } : null,
    integrations: partner.integrations.length,
    createdAt: partner.createdAt,
  }));
}

export type PartnerContractRow = {
  id: string;
  type: ContractType;
  startsAt: Date | null;
  endsAt: Date | null;
  fixedAmountCents: number | null;
  commissionPercent: number | null;
  commissionPerUnitCents: number | null;
  minimumCents: number | null;
  notes: string | null;
  isCurrent: boolean;
  createdAt: Date;
  /** Volume réellement attribué sur la période du contrat (commandes transmises ou confirmées). */
  volume: { amountCents: number; units: number; count: number; unpriced: number };
  /** Indicative, non facturée. */
  estimate: CommissionEstimate;
};

export type PartnerDetail = {
  id: string;
  name: string;
  slug: string;
  legalName: string | null;
  website: string | null;
  logoUrl: string | null;
  description: string | null;
  universes: string[];
  status: PublicationStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  contacts: { id: string; firstName: string; lastName: string; role: string | null; email: string | null; phone: string | null; isPrimary: boolean; receivesOrders: boolean }[];
  contracts: PartnerContractRow[];
  integrations: { id: string; mode: IntegrationMode; isActive: boolean; b2bUrlTemplate: string | null; orderEmail: string | null; formUrl: string | null; capabilities: string[]; notes: string | null; updatedAt: Date }[];
  brands: { id: string; name: string; slug: string; status: PublicationStatus }[];
  applications: { id: string; company: string; brand: string; status: ApplicationStatus; createdAt: Date }[];
  /** Toutes périodes confondues. */
  attributedOrders: { count: number; amountCents: number; units: number };
};

export async function getPartner(id: string, now = new Date()): Promise<PartnerDetail | null> {
  const partner = await prisma.partner.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }, { firstName: "asc" }] },
      contracts: { orderBy: [{ createdAt: "desc" }] },
      integrations: { orderBy: [{ isActive: "desc" }, { createdAt: "asc" }] },
      brands: { select: { id: true, name: true, slug: true, status: true }, orderBy: { name: "asc" } },
      applications: { select: { id: true, company: true, brand: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!partner) return null;

  // Seules les commandes réellement parties chez le partenaire comptent.
  const orders = await prisma.partnerOrder.findMany({
    where: { partnerId: id, status: { in: ["TRANSMITTED", "CONFIRMED"] } },
    select: { createdAt: true, totalCents: true, lines: { select: { quantity: true, unitPriceCents: true } } },
  });
  const current = currentContractOf(partner.contracts, now);
  const all = attributedVolume(orders, null, null);

  return {
    id: partner.id,
    name: partner.name,
    slug: partner.slug,
    legalName: partner.legalName,
    website: partner.website,
    logoUrl: partner.logoUrl,
    description: partner.description,
    universes: partner.universes,
    status: partner.status,
    startsAt: partner.startsAt,
    endsAt: partner.endsAt,
    notes: partner.notes,
    createdAt: partner.createdAt,
    updatedAt: partner.updatedAt,
    contacts: partner.contacts.map((contact) => ({
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      role: contact.role,
      email: contact.email,
      phone: contact.phone,
      isPrimary: contact.isPrimary,
      receivesOrders: contact.receivesOrders,
    })),
    contracts: partner.contracts.map((contract) => {
      const terms = {
        type: contract.type,
        fixedAmountCents: contract.fixedAmountCents,
        commissionPercent: decimalToNumber(contract.commissionPercent),
        commissionPerUnitCents: contract.commissionPerUnitCents,
        minimumCents: contract.minimumCents,
      };
      const volume = attributedVolume(orders, contract.startsAt, contract.endsAt);
      return {
        id: contract.id,
        ...terms,
        startsAt: contract.startsAt,
        endsAt: contract.endsAt,
        notes: contract.notes,
        isCurrent: current?.id === contract.id,
        createdAt: contract.createdAt,
        volume,
        estimate: estimateCommission(terms, { amountCents: volume.amountCents, units: volume.units }),
      };
    }),
    integrations: partner.integrations.map((integration) => ({
      id: integration.id,
      mode: integration.mode,
      isActive: integration.isActive,
      b2bUrlTemplate: integration.b2bUrlTemplate,
      orderEmail: integration.orderEmail,
      formUrl: integration.formUrl,
      capabilities: integration.capabilities,
      notes: integration.notes,
      updatedAt: integration.updatedAt,
    })),
    brands: partner.brands,
    applications: partner.applications,
    attributedOrders: { count: all.count, amountCents: all.amountCents, units: all.units },
  };
}

export type IntegrationOverviewRow = {
  id: string;
  partner: { id: string; name: string; status: PublicationStatus };
  mode: IntegrationMode;
  isActive: boolean;
  capabilities: string[];
  hasB2bTemplate: boolean;
  hasOrderEmail: boolean;
  hasFormUrl: boolean;
  updatedAt: Date;
};

export async function listIntegrations(): Promise<IntegrationOverviewRow[]> {
  const integrations = await prisma.partnerIntegration.findMany({
    orderBy: [{ isActive: "desc" }, { partner: { name: "asc" } }, { createdAt: "asc" }],
    select: {
      id: true,
      mode: true,
      isActive: true,
      capabilities: true,
      b2bUrlTemplate: true,
      orderEmail: true,
      formUrl: true,
      updatedAt: true,
      partner: { select: { id: true, name: true, status: true } },
    },
  });
  return integrations.map((integration) => ({
    id: integration.id,
    partner: integration.partner,
    mode: integration.mode,
    isActive: integration.isActive,
    capabilities: integration.capabilities,
    hasB2bTemplate: Boolean(integration.b2bUrlTemplate),
    hasOrderEmail: Boolean(integration.orderEmail),
    hasFormUrl: Boolean(integration.formUrl),
    updatedAt: integration.updatedAt,
  }));
}

// ---------------------------------------------------------------------------
// Écritures
// ---------------------------------------------------------------------------

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

/** Les slugs déjà pris qui commencent comme celui-ci (le reste ne peut pas entrer en collision). */
export async function takenPartnerSlugs(label: string): Promise<string[]> {
  const base = slugify(label) || "partenaire";
  const rows = await prisma.partner.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } });
  return rows.map((row) => row.slug);
}

/**
 * Crée un partenaire en BROUILLON : il n'est visible d'aucune officine tant
 * qu'on ne le publie pas explicitement. Le slug est rendu unique ; une
 * collision simultanée est rejouée.
 */
export async function createPartner(data: PartnerIdentityData, adminId: string): Promise<{ id: string; slug: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = pickUniqueSlug(data.name, await takenPartnerSlugs(data.name));
    try {
      return await prisma.partner.create({ data: { ...data, slug, status: "DRAFT", createdByAdminId: adminId }, select: { id: true, slug: true } });
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }
  throw new Error("createPartner : aucun slug libre après 5 essais");
}

export async function updatePartnerIdentity(id: string, data: PartnerIdentityData): Promise<{ ok: true; name: string } | { ok: false }> {
  const existing = await prisma.partner.findFirst({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false };
  const saved = await prisma.partner.update({ where: { id }, data, select: { name: true } });
  return { ok: true, name: saved.name };
}

export type StatusChangeResult =
  | { ok: true; from: PublicationStatus; to: PublicationStatus; name: string }
  | { ok: false; reason: "NOT_FOUND" | "FORBIDDEN_TRANSITION" | "CONFLICT" };

/** Change le statut de publication, selon les seules transitions permises. */
export async function setPartnerStatus(id: string, to: PublicationStatus): Promise<StatusChangeResult> {
  const partner = await prisma.partner.findFirst({ where: { id }, select: { status: true, name: true } });
  if (!partner) return { ok: false, reason: "NOT_FOUND" };
  if (!canMovePublication(partner.status, to)) return { ok: false, reason: "FORBIDDEN_TRANSITION" };
  // Conditionné au statut lu : deux gestes simultanés ne s'écrasent pas.
  const updated = await prisma.partner.updateMany({ where: { id, status: partner.status }, data: { status: to } });
  if (updated.count === 0) return { ok: false, reason: "CONFLICT" };
  return { ok: true, from: partner.status, to, name: partner.name };
}

export async function savePartnerContact(partnerId: string, contactId: string | null, data: ContactData): Promise<{ ok: true; id: string; created: boolean } | { ok: false; reason: "NOT_FOUND" }> {
  const partner = await prisma.partner.findFirst({ where: { id: partnerId }, select: { id: true } });
  if (!partner) return { ok: false, reason: "NOT_FOUND" };
  if (contactId) {
    const contact = await prisma.partnerContact.findFirst({ where: { id: contactId, partnerId }, select: { id: true } });
    if (!contact) return { ok: false, reason: "NOT_FOUND" };
  }
  return prisma.$transaction(async (tx) => {
    // Un seul contact principal par partenaire.
    if (data.isPrimary) {
      await tx.partnerContact.updateMany({ where: { partnerId, isPrimary: true, ...(contactId ? { id: { not: contactId } } : {}) }, data: { isPrimary: false } });
    }
    if (contactId) {
      await tx.partnerContact.update({ where: { id: contactId }, data });
      return { ok: true as const, id: contactId, created: false };
    }
    const created = await tx.partnerContact.create({ data: { ...data, partnerId }, select: { id: true } });
    return { ok: true as const, id: created.id, created: true };
  });
}

export async function deletePartnerContact(partnerId: string, contactId: string): Promise<{ ok: true; wasPrimary: boolean } | { ok: false }> {
  const contact = await prisma.partnerContact.findFirst({ where: { id: contactId, partnerId }, select: { id: true, isPrimary: true } });
  if (!contact) return { ok: false };
  await prisma.partnerContact.delete({ where: { id: contact.id } });
  return { ok: true, wasPrimary: contact.isPrimary };
}

export async function savePartnerContract(partnerId: string, contractId: string | null, data: ContractData, adminId: string): Promise<{ ok: true; id: string; created: boolean } | { ok: false }> {
  const partner = await prisma.partner.findFirst({ where: { id: partnerId }, select: { id: true } });
  if (!partner) return { ok: false };
  if (contractId) {
    const contract = await prisma.partnerContract.findFirst({ where: { id: contractId, partnerId }, select: { id: true } });
    if (!contract) return { ok: false };
    await prisma.partnerContract.update({ where: { id: contractId }, data });
    return { ok: true, id: contractId, created: false };
  }
  const created = await prisma.partnerContract.create({ data: { ...data, partnerId, createdByAdminId: adminId }, select: { id: true } });
  return { ok: true, id: created.id, created: true };
}

export async function savePartnerIntegration(partnerId: string, integrationId: string | null, data: IntegrationData): Promise<{ ok: true; id: string; created: boolean } | { ok: false }> {
  const partner = await prisma.partner.findFirst({ where: { id: partnerId }, select: { id: true } });
  if (!partner) return { ok: false };
  if (integrationId) {
    const integration = await prisma.partnerIntegration.findFirst({ where: { id: integrationId, partnerId }, select: { id: true } });
    if (!integration) return { ok: false };
    await prisma.partnerIntegration.update({ where: { id: integrationId }, data });
    return { ok: true, id: integrationId, created: false };
  }
  const created = await prisma.partnerIntegration.create({ data: { ...data, partnerId }, select: { id: true } });
  return { ok: true, id: created.id, created: true };
}
