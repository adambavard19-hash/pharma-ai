import "server-only";
import { appEnvironment, getEnv } from "@/config/env";
import { prisma } from "@/server/db/client";
import { chooseMessagingProvider } from "@/core/ai/providers/messaging-factory";
import { chooseStorageProvider } from "@/core/ai/providers/storage-choice";
import { getSignatureProvider } from "@/server/signature/registry";
import { stripeConfigState } from "@/server/billing/stripe-client";
import { resolvePublicBaseUrl } from "@/server/public-url";
import { loadReminderPolicy } from "@/server/services/platform-settings";
import { AUTOMATION_RULES } from "@/core/admin/automations";
import type { StatusTone } from "@/core/admin/statuses";
import vercelConfig from "../../../../vercel.json";

/**
 * L'état de santé de la plateforme, tel que le lit la page Paramètres.
 *
 * Règle absolue : ce module ne renvoie QUE des booléens et des libellés
 * publics. Une clé, un secret, un mot de passe ou un identifiant de connexion
 * n'en sortent jamais, même tronqués : on dit « présent » ou « absent », et le
 * nom de la variable à renseigner. Les seules valeurs affichées sont publiques
 * par nature : l'adresse d'expédition des e-mails (lue par chaque
 * destinataire), l'adresse publique de l'application, la raison sociale.
 *
 * Les décisions viennent des mêmes fonctions que les envois réels
 * (`chooseMessagingProvider`, `getSignatureProvider`, `stripeConfigState`…) :
 * la page ne peut pas dire « configuré » quand l'envoi, lui, serait simulé.
 */

export type HealthState = "CONFIGURED" | "TEST" | "INCOMPLETE" | "NOT_CONFIGURED";

export const HEALTH_STATE_LABELS: Record<HealthState, { label: string; tone: StatusTone }> = {
  CONFIGURED: { label: "Configuré", tone: "success" },
  TEST: { label: "Mode test", tone: "info" },
  INCOMPLETE: { label: "À compléter", tone: "warning" },
  NOT_CONFIGURED: { label: "Non configuré", tone: "danger" },
};

export type HealthCheck = { label: string; ok: boolean; optional?: boolean };
export type HealthFact = { label: string; value: string };
export type HealthLink = { label: string; href: string };
export type HealthEndpoint = { label: string; url: string; applicable: boolean; secured: boolean; note: string };

export type ServiceKey = "messaging" | "payments" | "signature" | "cron" | "webhooks" | "publicUrl" | "storage" | "company";

export type ServiceHealth = {
  key: ServiceKey;
  title: string;
  state: HealthState;
  summary: string;
  facts: HealthFact[];
  checks: HealthCheck[];
  /** Ce qu'il faut faire pour que le service fonctionne. */
  todo: string[];
  /** Améliorations facultatives, quand le service fonctionne déjà. */
  tips: string[];
  links: HealthLink[];
  endpoints?: HealthEndpoint[];
};

export type PlatformHealth = {
  environment: string;
  services: ServiceHealth[];
  counts: Record<HealthState, number>;
};

const REDEPLOY = "Redéployer l'application : les variables d'environnement sont lues au démarrage.";

const ENVIRONMENT_LABELS = { production: "Production", development: "Développement", demo: "Démonstration" } as const;

// ---------------------------------------------------------------- Tâches planifiées

const CRON_TASK_LABELS: Record<string, string> = {
  "/api/cron/relances-contrats": "Relances de contrats",
  "/api/cron/relances-automatiques": "Relances automatiques",
  "/api/cron/relances": "Relances automatiques",
  "/api/cron/automatisations": "Relances automatiques",
};

const isAutomationTask = (path: string) => /automat|relances-auto|\/relances$/.test(path);

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/** Une expression cron de Vercel (toujours en UTC), dite en français. */
export function describeCronSchedule(schedule: string): string {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return `Planification « ${schedule} »`;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const num = (v: string) => /^\d+$/.test(v);
  const at = (h: string, m: string) => `${h.padStart(2, "0")}:${m.padStart(2, "0")} (UTC)`;
  const everyMinutes = /^\*\/(\d+)$/.exec(minute);
  if (everyMinutes && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") return `Toutes les ${everyMinutes[1]} minutes`;
  if (num(minute) && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") return `Toutes les heures, à la minute ${Number(minute)}`;
  if (num(minute) && num(hour) && dayOfMonth === "*" && month === "*") {
    if (dayOfWeek === "*") return `Tous les jours à ${at(hour, minute)}`;
    if (num(dayOfWeek) && Number(dayOfWeek) <= 7) return `Chaque ${WEEKDAYS[Number(dayOfWeek) % 7]} à ${at(hour, minute)}`;
    if (dayOfWeek === "1-5") return `Du lundi au vendredi à ${at(hour, minute)}`;
  }
  if (num(minute) && num(hour) && num(dayOfMonth) && month === "*" && dayOfWeek === "*") return `Le ${Number(dayOfMonth)} de chaque mois à ${at(hour, minute)}`;
  return `Planification « ${schedule} »`;
}

type CronEntry = { path: string; schedule: string };

function declaredCrons(): CronEntry[] {
  const crons = (vercelConfig as { crons?: unknown }).crons;
  if (!Array.isArray(crons)) return [];
  return crons
    .filter((c): c is CronEntry => Boolean(c) && typeof (c as CronEntry).path === "string" && typeof (c as CronEntry).schedule === "string")
    .map((c) => ({ path: c.path, schedule: c.schedule }));
}

// ---------------------------------------------------------------- Services

type Env = ReturnType<typeof getEnv>;

function messagingHealth(env: Env): ServiceHealth {
  const info = chooseMessagingProvider({
    provider: env.EMAIL_PROVIDER,
    from: env.EMAIL_FROM,
    resendApiKey: env.RESEND_API_KEY,
    smtpHost: env.SMTP_HOST,
    smtpPort: env.SMTP_PORT,
    smtpSecure: env.SMTP_SECURE,
    smtpUser: env.SMTP_USER,
    smtpPassword: env.SMTP_PASSWORD,
  }).info;
  const requested = env.EMAIL_PROVIDER;
  const live = info.capability === "LIVE";
  const providerLabel = requested === "resend" ? "Resend" : requested === "smtp" ? "Serveur SMTP" : "Aucun";

  const checks: HealthCheck[] =
    requested === "smtp"
      ? [
          { label: "Serveur SMTP renseigné", ok: Boolean(env.SMTP_HOST) },
          { label: "Identifiants SMTP présents", ok: Boolean(env.SMTP_USER && env.SMTP_PASSWORD), optional: true },
          { label: "Adresse d'expédition renseignée", ok: Boolean(env.EMAIL_FROM) },
        ]
      : [
          { label: "Fournisseur choisi (EMAIL_PROVIDER)", ok: requested !== "none" },
          { label: "Clé d'API Resend présente", ok: Boolean(env.RESEND_API_KEY) },
          { label: "Adresse d'expédition renseignée", ok: Boolean(env.EMAIL_FROM) },
          { label: "Suivi de délivrance (webhook Resend)", ok: Boolean(env.RESEND_WEBHOOK_SECRET), optional: true },
        ];

  const todo: string[] = [];
  if (!live) {
    if (requested === "none") {
      todo.push("Choisir le fournisseur : EMAIL_PROVIDER=resend (recommandé).");
      todo.push("Créer une clé d'API dans Resend et la renseigner dans RESEND_API_KEY.");
      todo.push("Vérifier le domaine d'envoi dans Resend, puis renseigner EMAIL_FROM (ex. « PharmaBoost <contact@pharmaboost.app> »).");
    } else {
      const missing = requested === "resend" ? [!env.RESEND_API_KEY && "RESEND_API_KEY", !env.EMAIL_FROM && "EMAIL_FROM"] : [!env.SMTP_HOST && "SMTP_HOST", !env.EMAIL_FROM && "EMAIL_FROM"];
      const names = missing.filter(Boolean).join(" et ");
      if (names) todo.push(`Renseigner ${names}.`);
    }
    todo.push(REDEPLOY);
  }
  const tips: string[] = [];
  if (live && requested === "resend" && !env.RESEND_WEBHOOK_SECRET) tips.push("Pour savoir si chaque e-mail a été délivré ou rejeté, déclarer le webhook Resend (voir la carte Webhooks) et renseigner RESEND_WEBHOOK_SECRET.");

  return {
    key: "messaging",
    title: "Messagerie",
    state: live ? "CONFIGURED" : requested === "none" ? "NOT_CONFIGURED" : "INCOMPLETE",
    summary: live
      ? `Les e-mails partent réellement via ${requested === "resend" ? "Resend" : "un serveur SMTP"}. Chaque envoi est tracé avec son statut réel.`
      : requested === "none"
        ? "Aucun fournisseur d'e-mails : les envois sont tracés comme simulés, aucun message n'est transmis."
        : `Le fournisseur « ${requested} » est demandé mais sa configuration est incomplète : les envois restent simulés.`,
    facts: [
      { label: "Fournisseur", value: providerLabel },
      { label: "Adresse d'expédition", value: env.EMAIL_FROM?.trim() || "Non renseignée" },
    ],
    checks,
    todo,
    tips,
    links: [
      { label: "Modèles d'e-mails", href: "/admin/emails/modeles" },
      { label: "Historique des envois", href: "/admin/communications?type=email" },
    ],
  };
}

function paymentsHealth(env: Env, publicBase: string): ServiceHealth {
  const stripe = stripeConfigState();
  const hasKey = Boolean(env.STRIPE_SECRET_KEY);
  const state: HealthState = !hasKey ? "NOT_CONFIGURED" : !stripe.keyMatchesMode ? "INCOMPLETE" : stripe.mode === "test" ? "TEST" : "CONFIGURED";
  const webhookStep = `Déclarer le webhook ${publicBase}/api/stripe/webhook dans Stripe et renseigner son secret de signature dans STRIPE_WEBHOOK_SECRET.`;
  const todo: string[] = [];
  if (!hasKey) {
    todo.push("Dans le tableau de bord Stripe, en mode test d'abord, créer une clé secrète (ou restreinte).");
    todo.push("La renseigner dans STRIPE_SECRET_KEY, avec STRIPE_MODE=test.");
    if (!stripe.webhookConfigured) todo.push(webhookStep);
    todo.push(REDEPLOY);
  } else if (!stripe.keyMatchesMode) {
    todo.push("Accorder STRIPE_MODE et la clé : une clé sk_test_… en mode test, sk_live_… en production.");
    todo.push(REDEPLOY);
  } else if (!stripe.webhookConfigured) {
    todo.push(webhookStep);
  }
  return {
    key: "payments",
    title: "Paiement (Stripe)",
    state,
    summary:
      state === "NOT_CONFIGURED"
        ? "Aucune clé Stripe : les abonnements ne peuvent pas être encaissés en ligne."
        : state === "INCOMPLETE"
          ? stripe.detail
          : state === "TEST"
            ? "Stripe est branché en mode test : aucun paiement réel n'est encaissé."
            : "Stripe est branché en production : les paiements sont réels.",
    facts: [
      { label: "Mode", value: stripe.mode === "test" ? "Test" : "Production" },
      { label: "Événements Stripe", value: stripe.webhookConfigured ? "Reçus et vérifiés" : "Non reçus (webhook non configuré)" },
    ],
    checks: [
      { label: "Clé secrète présente", ok: hasKey },
      { label: "Clé conforme au mode (STRIPE_MODE)", ok: hasKey && stripe.keyMatchesMode },
      { label: "Webhook signé (STRIPE_WEBHOOK_SECRET)", ok: stripe.webhookConfigured },
      { label: "Portail client dédié", ok: Boolean(env.STRIPE_PORTAL_CONFIGURATION_ID), optional: true },
    ],
    todo,
    tips: [],
    links: [
      { label: "Offres & tarifs", href: "/admin/abonnements/offres" },
      { label: "Abonnements", href: "/admin/abonnements" },
      { label: "Paiements", href: "/admin/paiements" },
    ],
  };
}

function signatureHealth(env: Env, publicBase: string): ServiceHealth {
  const info = getSignatureProvider().info;
  const requested = env.SIGNATURE_PROVIDER;
  const live = info.capability === "LIVE";
  const keyName = requested === "yousign" ? "YOUSIGN_API_KEY" : "DOCUSEAL_API_KEY";
  const hasKey = requested === "yousign" ? Boolean(env.YOUSIGN_API_KEY) : requested === "docuseal" ? Boolean(env.DOCUSEAL_API_KEY) : false;
  const hasWebhookSecret = requested === "yousign" ? Boolean(env.YOUSIGN_WEBHOOK_SECRET) : requested === "docuseal" ? Boolean(env.DOCUSEAL_WEBHOOK_SECRET) : false;
  const state: HealthState = live ? (requested === "yousign" && env.YOUSIGN_ENVIRONMENT === "sandbox" ? "TEST" : "CONFIGURED") : requested === "none" ? "NOT_CONFIGURED" : "INCOMPLETE";

  const todo: string[] = [];
  if (requested === "none") {
    todo.push("Choisir le prestataire : SIGNATURE_PROVIDER=docuseal (ou yousign).");
    todo.push("Renseigner sa clé d'API : DOCUSEAL_API_KEY (ou YOUSIGN_API_KEY).");
    todo.push(`Déclarer le webhook ${publicBase}/api/signature/docuseal (ou /api/signature/yousign) et renseigner son secret.`);
    todo.push(REDEPLOY);
  } else if (!live) {
    todo.push(`Renseigner ${keyName}.`);
    todo.push(REDEPLOY);
  }
  const tips: string[] = [];
  if (live && !hasWebhookSecret) {
    tips.push(`Sans secret de webhook, chaque notification est relue chez le prestataire avant d'être prise en compte : c'est sûr, mais plus lent. Renseigner ${requested === "yousign" ? "YOUSIGN_WEBHOOK_SECRET" : "DOCUSEAL_WEBHOOK_SECRET"}.`);
  }

  return {
    key: "signature",
    title: "Signature électronique",
    state,
    summary: live
      ? `Les contrats partent en signature électronique via ${info.label}.`
      : requested === "none"
        ? "Aucun prestataire : le contrat est transmis par lien sécurisé, mais la signature électronique n'est pas disponible."
        : `Le prestataire « ${requested} » est demandé mais ${keyName} est absente : aucune demande de signature ne peut partir.`,
    facts: [
      { label: "Prestataire", value: live ? info.label : requested === "none" ? "Aucun" : `${requested === "yousign" ? "Yousign" : "DocuSeal"} (incomplet)` },
      { label: "Notifications", value: !live ? "—" : hasWebhookSecret ? "Authentifiées par secret" : "Relues chez le prestataire" },
    ],
    checks: [
      { label: "Prestataire choisi (SIGNATURE_PROVIDER)", ok: requested !== "none" },
      { label: "Clé d'API présente", ok: hasKey },
      { label: "Webhook authentifié (secret)", ok: hasWebhookSecret, optional: true },
    ],
    todo,
    tips,
    links: [
      { label: "Contrats", href: "/admin/contrats" },
      { label: "Société exploitante", href: "/admin/societe" },
    ],
  };
}

async function cronHealth(): Promise<ServiceHealth> {
  const hasSecret = Boolean(process.env.CRON_SECRET);
  const crons = declaredCrons();
  const automationDeclared = crons.some((c) => isAutomationTask(c.path));
  const contractDeclared = crons.some((c) => c.path === "/api/cron/relances-contrats");

  const [policy, enabledRules] = await Promise.all([
    loadReminderPolicy().catch(() => null),
    prisma.automationRule.count({ where: { enabled: true } }).catch(() => null),
  ]);

  const state: HealthState = crons.length === 0 ? "NOT_CONFIGURED" : hasSecret ? "CONFIGURED" : "INCOMPLETE";
  const todo: string[] = [];
  if (!hasSecret) {
    todo.push("Générer une valeur aléatoire longue et la renseigner dans CRON_SECRET (variables d'environnement de l'hébergeur).");
    todo.push(REDEPLOY);
  }
  const tips: string[] = [];
  if (!automationDeclared) tips.push("Aucune tâche planifiée n'appelle les relances automatiques (vercel.json) : tant qu'elle n'est pas déclarée, ces relances ne partent pas d'elles-mêmes.");

  return {
    key: "cron",
    title: "Tâches planifiées",
    state,
    summary: !hasSecret
      ? crons.length > 0
        ? "Des tâches sont déclarées, mais sans CRON_SECRET elles refusent de s'exécuter : rien ne part automatiquement."
        : "Aucune tâche planifiée déclarée."
      : "Les tâches déclarées s'exécutent à l'heure prévue, protégées par un secret.",
    facts: [
      ...crons.map((c) => ({ label: CRON_TASK_LABELS[c.path] ?? c.path, value: describeCronSchedule(c.schedule) })),
      { label: "Cadence des relances de contrat", value: policy === null ? "Illisible pour l'instant" : policy.enabled ? `Activée · 1re relance à J+${policy.firstAfterDays}` : "Désactivée" },
      { label: "Règles de relance automatique activées", value: enabledRules === null ? "Illisible pour l'instant" : `${enabledRules} sur ${AUTOMATION_RULES.length}` },
    ],
    checks: [
      { label: "Secret des tâches (CRON_SECRET)", ok: hasSecret },
      { label: "Relances de contrats planifiées", ok: contractDeclared },
      { label: "Relances automatiques planifiées", ok: automationDeclared },
    ],
    todo,
    tips,
    links: [{ label: "Relances automatiques et cadence des contrats", href: "/admin/relances" }],
  };
}

function webhooksHealth(env: Env, publicBase: string): ServiceHealth {
  const endpoints: HealthEndpoint[] = [
    {
      label: "Stripe — paiements et abonnements",
      url: `${publicBase}/api/stripe/webhook`,
      applicable: Boolean(env.STRIPE_SECRET_KEY),
      secured: Boolean(env.STRIPE_WEBHOOK_SECRET),
      note: "Sans secret, les événements sont refusés : paiements et statuts d'abonnement ne se mettent pas à jour.",
    },
    {
      label: "Resend — délivrance des e-mails",
      url: `${publicBase}/api/webhooks/resend`,
      applicable: env.EMAIL_PROVIDER === "resend",
      secured: Boolean(env.RESEND_WEBHOOK_SECRET),
      note: "Sans secret, la route refuse tout : les e-mails restent « envoyés », sans « délivré » ni « rejeté ».",
    },
    {
      label: "DocuSeal — signatures",
      url: `${publicBase}/api/signature/docuseal`,
      applicable: env.SIGNATURE_PROVIDER === "docuseal",
      secured: Boolean(env.DOCUSEAL_WEBHOOK_SECRET),
      note: "Sans secret, chaque notification est relue chez DocuSeal avant d'être prise en compte.",
    },
    {
      label: "Yousign — signatures",
      url: `${publicBase}/api/signature/yousign`,
      applicable: env.SIGNATURE_PROVIDER === "yousign",
      secured: Boolean(env.YOUSIGN_WEBHOOK_SECRET),
      note: "Sans secret, chaque notification est relue chez Yousign avant d'être prise en compte.",
    },
  ];
  const used = endpoints.filter((e) => e.applicable);
  const secured = used.filter((e) => e.secured);
  const state: HealthState = used.length === 0 ? "NOT_CONFIGURED" : secured.length === used.length ? "CONFIGURED" : "INCOMPLETE";
  return {
    key: "webhooks",
    title: "Webhooks",
    state,
    summary:
      used.length === 0
        ? "Aucun service branché n'envoie de notification pour l'instant."
        : secured.length === used.length
          ? "Chaque service branché notifie la plateforme, avec un secret vérifié."
          : `${used.length - secured.length} webhook${used.length - secured.length > 1 ? "s" : ""} sans secret sur ${used.length} service${used.length > 1 ? "s" : ""} branché${used.length > 1 ? "s" : ""}.`,
    facts: [],
    checks: [],
    todo: used.filter((e) => !e.secured).map((e) => `Déclarer ${e.url} chez le prestataire (${e.label.split(" — ")[0]}) et renseigner son secret.`),
    tips: [],
    links: [],
    endpoints,
  };
}

function publicUrlHealth(): ServiceHealth {
  const env = getEnv();
  const resolved = resolvePublicBaseUrl();
  const state: HealthState = resolved.reach === "PUBLIC" ? (resolved.secure ? "CONFIGURED" : "INCOMPLETE") : resolved.reach === "LAN" ? "TEST" : "NOT_CONFIGURED";
  const source = env.PUBLIC_APP_URL ? "PUBLIC_APP_URL" : resolved.url === env.APP_URL.replace(/\/$/, "") ? "APP_URL" : "Adresse du poste sur le réseau local";
  const todo: string[] = [];
  if (state !== "CONFIGURED") {
    todo.push("Renseigner PUBLIC_APP_URL avec l'adresse HTTPS publique (ex. https://pharmaboost.app).");
    todo.push(REDEPLOY);
  }
  return {
    key: "publicUrl",
    title: "Adresse publique",
    state,
    summary:
      state === "CONFIGURED"
        ? "L'adresse des e-mails, des liens de contrat et des webhooks est publique et chiffrée."
        : state === "INCOMPLETE"
          ? "L'adresse est publique mais pas en HTTPS : les liens envoyés ne sont pas chiffrés."
          : state === "TEST"
            ? "Adresse provisoire du réseau local : les liens ne s'ouvrent que depuis le même Wi-Fi."
            : "Adresse locale : les liens des e-mails et des contrats ne s'ouvrent pas depuis l'extérieur.",
    facts: [
      { label: "Adresse", value: resolved.url },
      { label: "Source", value: source },
      { label: "HTTPS", value: resolved.secure ? "Oui" : "Non" },
    ],
    checks: [],
    todo,
    tips: [],
    links: [],
  };
}

function storageHealth(env: Env): ServiceHealth {
  const choice = chooseStorageProvider(env);
  // On ne garde de ce choix que sa nature : l'objet S3 porte des identifiants.
  const kind = choice.kind;
  const state: HealthState = kind === "database" || kind === "s3" ? "CONFIGURED" : kind === "local" ? "TEST" : "NOT_CONFIGURED";
  const where = kind === "database" ? "Base de données PostgreSQL" : kind === "s3" ? "Stockage objet compatible S3" : kind === "local" ? "Dossier local du poste (développement)" : "Non utilisable";
  const todo: string[] = [];
  if (kind === "misconfigured") {
    todo.push(choice.message);
    todo.push("Choisir STORAGE_PROVIDER=database (le plus simple) ou s3 avec S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID et S3_SECRET_ACCESS_KEY.");
    todo.push(REDEPLOY);
  }
  const tips = kind === "local" ? ["Le dossier local ne convient qu'au développement : en production, choisir database ou s3."] : [];
  return {
    key: "storage",
    title: "Stockage des documents",
    state,
    summary:
      kind === "misconfigured"
        ? "Le stockage n'est pas utilisable : la génération des contrats PDF échouera."
        : kind === "local"
          ? "Les documents sont rangés dans un dossier du poste : valable en développement seulement."
          : "Les contrats PDF et documents déposés sont conservés de façon durable.",
    facts: [{ label: "Emplacement", value: where }],
    checks:
      env.STORAGE_PROVIDER === "s3"
        ? [
            { label: "Compartiment (S3_BUCKET)", ok: Boolean(env.S3_BUCKET) },
            { label: "Région (S3_REGION)", ok: Boolean(env.S3_REGION) },
            { label: "Identifiants d'accès", ok: Boolean(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) },
            { label: "Point d'accès hors AWS (S3_ENDPOINT)", ok: Boolean(env.S3_ENDPOINT), optional: true },
          ]
        : [],
    todo,
    tips,
    links: [{ label: "Contrats", href: "/admin/contrats" }],
  };
}

async function companyHealth(): Promise<ServiceHealth> {
  const profile = await prisma.companyProfile
    .findUnique({ where: { id: "default" }, select: { legalName: true, siren: true, addressLine1: true, representativeName: true } })
    .catch(() => null);
  return {
    key: "company",
    title: "Société exploitante",
    state: profile ? "CONFIGURED" : "NOT_CONFIGURED",
    summary: profile ? "La partie signataire est renseignée : elle figure sur chaque contrat généré." : "La partie signataire des contrats n'est pas renseignée : aucun contrat ne peut être généré correctement.",
    facts: profile ? [{ label: "Raison sociale", value: profile.legalName }] : [],
    checks: profile
      ? [
          { label: "SIREN renseigné", ok: Boolean(profile.siren) },
          { label: "Adresse renseignée", ok: Boolean(profile.addressLine1) },
          { label: "Représentant signataire", ok: Boolean(profile.representativeName) },
        ]
      : [],
    todo: profile ? [] : ["Renseigner la raison sociale, l'adresse, le SIREN et le représentant qui signe les contrats."],
    tips: [],
    links: [{ label: "Société exploitante", href: "/admin/societe" }],
  };
}

/**
 * L'état de chaque service, pour la page Paramètres. Ne lève pas : une partie
 * illisible (base indisponible) est dite telle quelle plutôt que de faire
 * tomber la page.
 */
export async function loadPlatformHealth(): Promise<PlatformHealth> {
  const env = getEnv();
  const publicBase = resolvePublicBaseUrl().url;
  const [cron, company] = await Promise.all([cronHealth(), companyHealth()]);
  const services: ServiceHealth[] = [
    messagingHealth(env),
    paymentsHealth(env, publicBase),
    signatureHealth(env, publicBase),
    cron,
    webhooksHealth(env, publicBase),
    publicUrlHealth(),
    storageHealth(env),
    company,
  ];
  const counts: Record<HealthState, number> = { CONFIGURED: 0, TEST: 0, INCOMPLETE: 0, NOT_CONFIGURED: 0 };
  for (const service of services) counts[service.state] += 1;
  return { environment: ENVIRONMENT_LABELS[appEnvironment()], services, counts };
}
