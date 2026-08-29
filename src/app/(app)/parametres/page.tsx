import type { Metadata } from "next";
import {
  Building2,
  Cpu,
  CreditCard,
  Database,
  FileWarning,
  Mail,
  PlayCircle,
  ScanLine,
  ScrollText,
  ShieldCheck,
  Video,
} from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { getProviderSnapshot } from "@/server/ai/registry";
import { getReferenceCatalogState } from "@/server/services/reference";
import {
  BDPM_SOURCE,
  referenceAttribution,
  type ReferenceCatalogState,
} from "@/core/reference";
import { isDemoMode } from "@/config/env";
import { ENGINE_VERSION } from "@/config/constants";
import { PageHeader, DataItem, Grid } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { SettingsTabs } from "./settings-tabs";
import { formatCents, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import type { ProviderInfo } from "@/core/ai/ports";

export const metadata: Metadata = { title: "Paramètres" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.PHARMACY_VIEW);
  const params = await searchParams;
  const tab = params.onglet ?? "officine";

  const [pharmacy, subscription, auditLogs] = await Promise.all([
    prisma.pharmacy.findUniqueOrThrow({
      where: { id: session.scope.pharmacyId },
      include: { organization: { select: { name: true, slug: true } } },
    }),
    prisma.subscription.findUnique({
      where: { organizationId: session.scope.organizationId },
      include: { plan: true },
    }),
    session.permissions.has(PERMISSIONS.AUDIT_VIEW)
      ? prisma.auditLog.findMany({
          where: { pharmacyId: session.scope.pharmacyId },
          orderBy: { createdAt: "desc" },
          take: 40,
          include: { user: { select: { firstName: true, lastName: true } } },
        })
      : Promise.resolve([]),
  ]);

  const providers = getProviderSnapshot();
  const referenceState = await getReferenceCatalogState();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paramètres"
        description="Officine, équipe, règles de conseil, moteur et conformité — tout ce qui se règle une fois, pas à chaque patient."
      />

      <SettingsTabs
        canSeeTeam={session.permissions.has(PERMISSIONS.TEAM_VIEW)}
        canSeeRules={session.permissions.has(PERMISSIONS.RECOMMENDATION_VIEW)}
        canSeeAudit={session.permissions.has(PERMISSIONS.AUDIT_VIEW)}
        auditCount={auditLogs.length}
      />

      {tab === "moteur" ? (
        <EngineSettings providers={providers} reference={referenceState} />
      ) : tab === "conformite" ? (
        <ComplianceSettings isDemo={isDemoMode()} />
      ) : tab === "abonnement" ? (
        <SubscriptionSettings
          subscription={
            subscription
              ? {
                  planName: subscription.plan.name,
                  planDescription: subscription.plan.description,
                  monthlyPriceCents: subscription.plan.monthlyPriceCents,
                  status: subscription.status,
                  seats: subscription.seats,
                  trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
                  currentPeriodStart: subscription.currentPeriodStart.toISOString(),
                }
              : null
          }
          organizationName={pharmacy.organization.name}
        />
      ) : tab === "audit" ? (
        <AuditLog
          logs={auditLogs.map((log) => ({
            id: log.id,
            action: log.action,
            entityType: log.entityType,
            entityId: log.entityId,
            createdAt: log.createdAt.toISOString(),
            user: log.user ? `${log.user.firstName} ${log.user.lastName}` : null,
            ipAddress: log.ipAddress,
          }))}
        />
      ) : (
        <PharmacySettings
          pharmacy={{
            name: pharmacy.name,
            finessNumber: pharmacy.finessNumber,
            siret: pharmacy.siret,
            email: pharmacy.email,
            phone: pharmacy.phone,
            address: [
              pharmacy.addressLine1,
              [pharmacy.postalCode, pharmacy.city].filter(Boolean).join(" "),
            ]
              .filter(Boolean)
              .join(", "),
            brandColor: pharmacy.brandColor,
            timezone: pharmacy.timezone,
            isDemo: pharmacy.isDemo,
            organizationName: pharmacy.organization.name,
          }}
        />
      )}
    </div>
  );
}

function PharmacySettings({
  pharmacy,
}: {
  pharmacy: {
    name: string;
    finessNumber: string | null;
    siret: string | null;
    email: string | null;
    phone: string | null;
    address: string;
    brandColor: string;
    timezone: string;
    isDemo: boolean;
    organizationName: string;
  };
}) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Identité de l'officine"
          description="Ces informations apparaissent sur la fiche remise au patient."
        />
        <CardContent>
          <dl className="space-y-3.5">
            <DataItem label="Nom">{pharmacy.name}</DataItem>
            <DataItem label="Groupe">{pharmacy.organizationName}</DataItem>
            <DataItem label="Numéro FINESS">{pharmacy.finessNumber ?? "—"}</DataItem>
            <DataItem label="SIRET">{pharmacy.siret ?? "—"}</DataItem>
            <DataItem label="Adresse">{pharmacy.address || "—"}</DataItem>
            <DataItem label="Téléphone">{pharmacy.phone ?? "—"}</DataItem>
            <DataItem label="E-mail">{pharmacy.email ?? "—"}</DataItem>
            <DataItem label="Fuseau horaire">{pharmacy.timezone}</DataItem>
            <DataItem label="Couleur de marque">
              <span className="inline-flex items-center gap-2">
                <span
                  className="size-4 rounded border border-border-default"
                  style={{ backgroundColor: pharmacy.brandColor }}
                />
                <span className="font-mono text-[12px]">{pharmacy.brandColor}</span>
              </span>
            </DataItem>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Mode de fonctionnement" />
        <CardContent className="space-y-3">
          {pharmacy.isDemo ? (
            <Alert tone="warning" title="Officine de démonstration">
              Toutes les données de cette officine sont fictives. Aucun patient réel,
              aucune ordonnance réelle, aucune vente réelle.
            </Alert>
          ) : (
            <Alert tone="success" title="Officine réelle">
              Cette officine traite des données réelles. Les obligations de sécurité et de
              conformité s&apos;appliquent pleinement.
            </Alert>
          )}

          <p className="text-[12.5px] leading-5 text-text-secondary">
            La modification des informations de l&apos;officine et du logo sera pilotée depuis
            cet écran. Dans cette version, elles sont définies à la création de l&apos;officine.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * L'état du catalogue national des médicaments.
 *
 * Cette carte porte la mention de source et la date de mise à jour exigées par
 * la licence BDPM. Tant qu'aucun import n'a eu lieu, elle le dit franchement
 * plutôt que de laisser croire à un référentiel officiel absent.
 */
function ReferenceCatalogCard({ state }: { state: ReferenceCatalogState }) {
  const attribution = referenceAttribution(state);

  if (state.status === "NOT_IMPORTED" || state.status === "FAILED") {
    return (
      <Card>
        <CardHeader
          title="Catalogue national des médicaments"
          description="Le référentiel officiel des spécialités commercialisées en France."
          action={<Database className="size-[18px] text-text-tertiary" />}
        />
        <CardContent className="space-y-3">
          <Alert
            tone={state.status === "FAILED" ? "danger" : "warning"}
            title={
              state.status === "FAILED"
                ? "La dernière synchronisation a échoué"
                : "Aucun catalogue officiel n'est chargé"
            }
          >
            {state.status === "FAILED" ? (
              <>
                Tentative du {formatDateTime(state.attemptedAt)}
                {state.error ? ` — ${state.error}` : ""}. Aucun catalogue officiel n&apos;a encore
                été chargé : l&apos;application reste sur son jeu de démonstration fictif.
              </>
            ) : (
              <>
                L&apos;application fonctionne sur son jeu de démonstration fictif, signalé comme
                tel à chaque écran. Elle ne prétend pas disposer de données officielles.
              </>
            )}
          </Alert>
          <div className="space-y-1.5 text-[13px] leading-5 text-text-secondary">
            <p>
              Téléchargez les fichiers publiés sur{" "}
              <a
                href={BDPM_SOURCE.downloadUrl}
                className="text-brand-700 hover:underline dark:text-brand-400"
                target="_blank"
                rel="noreferrer"
              >
                {BDPM_SOURCE.url.replace("https://", "")}
              </a>
              , puis lancez l&apos;import en reprenant la date de mise à jour affichée par le
              site :
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border-subtle bg-surface-sunken px-3.5 py-2.5 font-mono text-[12.5px] text-text-primary">
              npm run bdpm:sync -- --from &lt;dossier&gt; --source-date AAAA-MM-JJ
            </pre>
            <p className="text-text-tertiary">
              L&apos;import ne touche jamais au stock des officines : il alimente un catalogue
              partagé que chaque stock référence sans le copier.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Catalogue national des médicaments"
        description="Partagé par toutes les officines. Le stock de chacune le référence sans le copier."
        action={
          <Badge tone={state.status === "STALE" ? "warning" : "success"}>
            {state.status === "STALE" ? "À resynchroniser" : "À jour"}
          </Badge>
        }
      />
      <CardContent className="space-y-4">
        <Grid cols={3}>
          <DataItem label="Spécialités">{formatNumber(state.counts.specialties)}</DataItem>
          <DataItem label="Présentations">{formatNumber(state.counts.presentations)}</DataItem>
          <DataItem label="Substances">{formatNumber(state.counts.substances)}</DataItem>
        </Grid>

        {state.status === "STALE" && (
          <Alert tone="warning" title="Le référentiel a vieilli">
            La base officielle est mise à jour chaque mois et celle-ci date de {state.ageDays}{" "}
            jours. Relancez <code className="font-mono text-[12px]">npm run bdpm:sync</code>.
          </Alert>
        )}

        {state.lastFailure && (
          <Alert tone="danger" title="La dernière synchronisation a échoué">
            Tentative du {formatDateTime(state.lastFailure.attemptedAt)}
            {state.lastFailure.error ? ` — ${state.lastFailure.error}` : ""}. Les chiffres
            ci-dessus sont ceux du dernier import réussi : une synchronisation ratée n&apos;efface
            rien.
          </Alert>
        )}

        <p className="border-t border-border-subtle pt-3 text-[12.5px] leading-5 text-text-tertiary">
          {attribution}
          <br />
          Importé dans Pharma.ai le {formatDateTime(state.importedAt)}. Données publiées par{" "}
          {BDPM_SOURCE.publishersLabel} ; cette mention ne vaut aucune reconnaissance de
          Pharma.ai par ces organismes.
        </p>
      </CardContent>
    </Card>
  );
}

function EngineSettings({
  providers,
  reference,
}: {
  providers: {
    ocr: ProviderInfo;
    ai: ProviderInfo;
    knowledge: ProviderInfo;
    storage: ProviderInfo;
    messaging: ProviderInfo;
    video: ProviderInfo;
    anySimulated: boolean;
  };
  reference: ReferenceCatalogState;
}) {
  const entries: { key: string; icon: typeof Cpu; label: string; info: ProviderInfo }[] = [
    { key: "ocr", icon: ScanLine, label: "Extraction d'ordonnance", info: providers.ocr },
    { key: "ai", icon: Cpu, label: "Reformulation", info: providers.ai },
    { key: "knowledge", icon: Database, label: "Référentiel médicamenteux", info: providers.knowledge },
    { key: "storage", icon: Database, label: "Stockage des fichiers", info: providers.storage },
    { key: "messaging", icon: Mail, label: "Envoi au patient", info: providers.messaging },
    { key: "video", icon: Video, label: "Génération vidéo", info: providers.video },
  ];

  return (
    <div className="space-y-5">
      <ReferenceCatalogCard state={reference} />

      {providers.anySimulated && (
        <Alert tone="warning" title="Des maillons de la chaîne sont simulés">
          L&apos;application signale explicitement chaque fournisseur simulé. Aucun résultat
          produit par un fournisseur simulé n&apos;est présenté comme réel.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Fournisseurs"
          description={`Moteur métier v${ENGINE_VERSION}. Chaque fournisseur est branchable indépendamment.`}
        />
        <CardContent className="pt-0">
          <ul className="divide-y divide-border-subtle">
            {entries.map((entry) => (
              <li key={entry.key} className="flex items-start gap-3.5 py-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-text-tertiary">
                  <entry.icon className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-medium text-text-primary">
                      {entry.label}
                    </p>
                    <Badge tone={entry.info.capability === "LIVE" ? "success" : "warning"}>
                      {entry.info.capability === "LIVE" ? "Actif" : "Simulé"}
                    </Badge>
                  </div>
                  <p className="text-[12.5px] text-text-secondary">{entry.info.label}</p>
                  <p className="text-[12px] leading-4 text-text-tertiary">
                    {entry.info.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Architecture"
          description="Le moteur métier ne dépend d'aucun fournisseur en particulier."
        />
        <CardContent className="space-y-3">
          <p className="text-[13px] leading-6 text-text-secondary">
            Les règles de sécurité, de pertinence et de classement vivent dans un moteur pur,
            testable sans base de données ni API. Les fournisseurs — OCR, modèle de langage,
            référentiel médicamenteux, stockage, messagerie — sont des adaptateurs branchés à
            des interfaces stables. Changer de modèle ne modifie aucune règle métier.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {["OCRProvider", "AIProvider", "DrugKnowledgeProvider", "StorageProvider", "MessagingProvider", "VideoProvider"].map(
              (port) => (
                <Badge key={port} tone="neutral">
                  {port}
                </Badge>
              ),
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Vidéo personnalisée"
          description="Module futur — architecture préparée."
          action={<PlayCircle className="size-[18px] text-text-tertiary" />}
        />
        <CardContent>
          <p className="text-[13px] leading-6 text-text-secondary">
            Le port <code className="font-mono text-[12px]">VideoProvider</code> permettra de
            générer une courte vidéo reprenant le traitement et les conseils validés. Aucun
            moteur n&apos;est branché aujourd&apos;hui, et la fiche patient n&apos;en dit donc
            rien : annoncer « bientôt disponible » à un patient venu lire ses conseils
            n&apos;aide personne. Le jour où un moteur sera branché, le bloc apparaîtra parce
            qu&apos;il y aura une vidéo à montrer.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ComplianceSettings({ isDemo }: { isDemo: boolean }) {
  return (
    <div className="space-y-5">
      <Alert tone="danger" title="Validation juridique nécessaire avant toute mise en production">
        Le fait qu&apos;une fonctionnalité soit codée ne la rend pas juridiquement conforme. Les
        points listés ci-dessous doivent être validés par un conseil juridique et, le cas
        échéant, par un délégué à la protection des données.
      </Alert>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {COMPLIANCE_ITEMS.map((item) => (
          <Card key={item.title}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <item.icon className="size-4 text-brand-600 dark:text-brand-400" />
                  {item.title}
                </span>
              }
            />
            <CardContent className="space-y-2.5">
              <div>
                <p className="text-[11.5px] font-medium tracking-wide text-success-700 uppercase dark:text-success-500">
                  Implémenté
                </p>
                <ul className="mt-1 space-y-0.5">
                  {item.implemented.map((entry) => (
                    <li key={entry} className="text-[12.5px] leading-5 text-text-secondary">
                      • {entry}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[11.5px] font-medium tracking-wide text-warning-700 uppercase dark:text-warning-500">
                  À valider avant production
                </p>
                <ul className="mt-1 space-y-0.5">
                  {item.todo.map((entry) => (
                    <li key={entry} className="text-[12.5px] leading-5 text-text-secondary">
                      • {entry}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {isDemo && (
        <Alert tone="info" title="Environnement de démonstration">
          Aucune donnée réelle n&apos;est traitée. Les obligations réglementaires s&apos;appliquent
          dès qu&apos;une donnée de santé réelle entre dans le système.
        </Alert>
      )}
    </div>
  );
}

function SubscriptionSettings({
  subscription,
  organizationName,
}: {
  subscription: {
    planName: string;
    planDescription: string;
    monthlyPriceCents: number;
    status: string;
    seats: number;
    trialEndsAt: string | null;
    currentPeriodStart: string;
  } | null;
  organizationName: string;
}) {
  if (!subscription) {
    return (
      <Card>
        <CardContent className="pt-5">
          <p className="text-[13px] text-text-secondary">
            Aucun abonnement associé à {organizationName}.
          </p>
        </CardContent>
      </Card>
    );
  }

  const STATUS_LABELS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "info" }> = {
    TRIALING: { label: "Période d'essai", tone: "info" },
    ACTIVE: { label: "Actif", tone: "success" },
    PAST_DUE: { label: "Paiement en retard", tone: "warning" },
    CANCELED: { label: "Résilié", tone: "danger" },
    SUSPENDED: { label: "Suspendu", tone: "danger" },
  };
  const status = STATUS_LABELS[subscription.status] ?? { label: subscription.status, tone: "info" as const };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <CreditCard className="size-4 text-brand-600 dark:text-brand-400" />
              Abonnement
            </span>
          }
        />
        <CardContent>
          <dl className="space-y-3.5">
            <DataItem label="Groupe">{organizationName}</DataItem>
            <DataItem label="Formule">
              <span className="flex items-center gap-2">
                {subscription.planName}
                <Badge tone={status.tone}>{status.label}</Badge>
              </span>
            </DataItem>
            <DataItem label="Description">{subscription.planDescription}</DataItem>
            <DataItem label="Tarif">
              {formatCents(subscription.monthlyPriceCents)} par mois
            </DataItem>
            <DataItem label="Postes">{subscription.seats}</DataItem>
            <DataItem label="Début de période">
              {formatDate(subscription.currentPeriodStart)}
            </DataItem>
            {subscription.trialEndsAt && (
              <DataItem label="Fin de l'essai">{formatDate(subscription.trialEndsAt)}</DataItem>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Facturation" />
        <CardContent>
          <Alert tone="info" title="Aucun prestataire de paiement branché">
            Le modèle de données prévoit le plan, l&apos;abonnement, le statut, la période
            d&apos;essai et les limites. Le rattachement à un prestataire de paiement se fera
            via le champ <code className="font-mono text-[12px]">externalCustomerId</code>,
            sans modification du reste du produit.
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}

function AuditLog({
  logs,
}: {
  logs: {
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    createdAt: string;
    user: string | null;
    ipAddress: string | null;
  }[];
}) {
  return (
    <Card>
      <CardHeader
        title="Journal d'audit"
        description="Les 40 dernières actions enregistrées. Aucune donnée de santé n'y figure en clair."
        action={<ScrollText className="size-[18px] text-text-tertiary" />}
      />
      <CardContent className="pt-0">
        {logs.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-text-tertiary">
            Aucune entrée pour le moment.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {logs.map((log) => (
              <li key={log.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <code className="font-mono text-[12px] text-brand-700 dark:text-brand-400">
                  {log.action}
                </code>
                <span className="text-[12.5px] text-text-secondary">{log.entityType}</span>
                <span className="ml-auto text-[12px] text-text-tertiary">
                  {log.user ?? "système"} · {formatDateTime(log.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const COMPLIANCE_ITEMS = [
  {
    title: "Isolation et accès",
    icon: ShieldCheck,
    implemented: [
      "Chaque table métier porte l'identifiant de l'officine",
      "L'officine active provient exclusivement de la session serveur",
      "Contrôle par permission sur chaque écran et chaque action",
      "Sessions révocables, jeton stocké sous forme d'empreinte",
    ],
    todo: [
      "Revue de sécurité indépendante",
      "Politique de mots de passe et authentification à deux facteurs",
      "Procédure de gestion des habilitations",
    ],
  },
  {
    title: "Données de santé",
    icon: Database,
    implemented: [
      "Profil de santé isolé dans une table dédiée",
      "Champs libres chiffrés en AES-256-GCM au niveau applicatif",
      "Accès au profil de santé tracé dans le journal d'audit",
      "Consentements horodatés et révocables",
    ],
    todo: [
      "Hébergement agréé HDS pour la production",
      "Durées de conservation à arrêter et automatiser",
      "Analyse d'impact relative à la protection des données",
      "Registre des traitements",
    ],
  },
  {
    title: "Information et conseil",
    icon: FileWarning,
    implemented: [
      "Aucune donnée incertaine n'est complétée automatiquement",
      "Une information absente du référentiel n'est jamais inventée",
      "Chaque conseil est validé par un professionnel avant remise",
      "Les allégations affichées proviennent des fiches produit de l'officine",
    ],
    todo: [
      "Validation du socle de règles par un pharmacien",
      "Référentiel médicamenteux sous licence et tenu à jour",
      "Revue des allégations au regard de la réglementation applicable",
    ],
  },
  {
    title: "Traçabilité",
    icon: Building2,
    implemented: [
      "Version du moteur enregistrée sur chaque analyse",
      "Trace complète du pipeline conservée",
      "Cycle de vie de chaque recommandation historisé",
      "Instantané figé du document remis au patient",
    ],
    todo: [
      "Politique de sauvegarde et de restauration",
      "Durée de conservation des journaux",
      "Procédure de réponse aux demandes d'exercice des droits",
    ],
  },
];
