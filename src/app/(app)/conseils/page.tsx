import type { Metadata } from "next";
import Link from "next/link";
import { Ban, Info, Sparkles, Star } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { SCORE_WEIGHTS, DIMENSION_LABELS } from "@/core/ai/engines/scoring";
import { PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { RECOMMENDATION_STATUS } from "@/config/statuses";
import { PageHeader, Grid } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState, Progress } from "@/components/ui/feedback";
import { LinkTabs } from "@/components/ui/tabs";
import { formatCents, formatDate, formatPercent } from "@/lib/format";
import { RulesManager } from "./rules-manager";
import type { ProductCategoryCode } from "@/core/ai/types";

export const metadata: Metadata = { title: "Conseils IA" };

export default async function AdvicePage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_VIEW);
  const params = await searchParams;
  const tab = params.onglet ?? "recommandations";

  const [recommendations, rules, products, statusCounts] = await Promise.all([
    prisma.recommendation.findMany({
      where: { pharmacyId: session.scope.pharmacyId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        product: { select: { id: true, name: true, brand: true } },
        opportunity: { select: { title: true, category: true } },
        prescription: { select: { id: true, reference: true } },
        decidedBy: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.pharmacyRule.findMany({
      where: { pharmacyId: session.scope.pharmacyId },
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { name: true, brand: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.product.findMany({
      where: { pharmacyId: session.scope.pharmacyId, deletedAt: null, isActive: true },
      select: { id: true, name: true, brand: true },
      orderBy: { name: "asc" },
      take: 300,
    }),
    prisma.recommendation.groupBy({
      by: ["status"],
      where: { pharmacyId: session.scope.pharmacyId },
      _count: true,
    }),
  ]);

  const total = statusCounts.reduce((sum, row) => sum + row._count, 0);
  const purchased = statusCounts.find((r) => r.status === "PURCHASED")?._count ?? 0;
  const removed = statusCounts.find((r) => r.status === "REMOVED")?._count ?? 0;

  const canManageRules = session.permissions.has(PERMISSIONS.RECOMMENDATION_RULES_MANAGE);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conseils IA"
        description="Comment Pharma.ai identifie une opportunité de conseil, comment il la classe, et comment votre officine l'oriente."
      />

      <Grid cols={4}>
        <StatCard
          label="Conseils générés"
          value={total}
          sublabel="depuis l'origine"
          icon={<Sparkles className="size-4" />}
          emphasis="brand"
        />
        <StatCard
          label="Achetés"
          value={purchased}
          sublabel={total > 0 ? formatPercent(purchased / total) : "—"}
          icon={<Star className="size-4" />}
          emphasis="accent"
        />
        <StatCard
          label="Retirés par un pharmacien"
          value={removed}
          sublabel={total > 0 ? formatPercent(removed / total) : "—"}
          icon={<Ban className="size-4" />}
        />
        <StatCard
          label="Règles de l'officine"
          value={rules.filter((r) => r.isActive).length}
          sublabel="préférences actives"
          icon={<Info className="size-4" />}
        />
      </Grid>

      <LinkTabs
        items={[
          { key: "recommandations", label: "Historique", count: recommendations.length },
          { key: "regles", label: "Règles de l'officine", count: rules.length },
          { key: "moteur", label: "Comment ça marche" },
        ]}
      />

      {tab === "regles" ? (
        <RulesManager
          rules={rules.map((rule) => ({
            id: rule.id,
            type: rule.type,
            productName: rule.product
              ? `${rule.product.name}${rule.product.brand ? ` (${rule.product.brand})` : ""}`
              : null,
            category: rule.category,
            note: rule.note,
            isActive: rule.isActive,
            createdAt: rule.createdAt.toISOString(),
            createdBy: rule.createdBy
              ? `${rule.createdBy.firstName} ${rule.createdBy.lastName}`
              : null,
          }))}
          products={products.map((product) => ({
            id: product.id,
            label: `${product.name}${product.brand ? ` — ${product.brand}` : ""}`,
          }))}
          canManage={canManageRules}
        />
      ) : tab === "moteur" ? (
        <EngineExplainer />
      ) : recommendations.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Sparkles className="size-5" />}
            title="Aucun conseil généré"
            description="Analysez une ordonnance pour voir apparaître les propositions du moteur."
          />
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-0">
            <ul className="divide-y divide-border-subtle">
              {recommendations.map((recommendation) => {
                const status = RECOMMENDATION_STATUS[recommendation.status];
                return (
                  <li key={recommendation.id} className="space-y-1.5 py-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-[13.5px] font-medium text-text-primary">
                          {recommendation.product?.name ?? "Produit supprimé"}
                        </p>
                        {recommendation.opportunity && (
                          <p className="text-[12px] text-text-tertiary">
                            {recommendation.opportunity.title} ·{" "}
                            {
                              PRODUCT_CATEGORY_LABELS[
                                recommendation.opportunity.category as ProductCategoryCode
                              ]
                            }
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {recommendation.origin === "MANUAL" && (
                          <Badge tone="brand">Ajouté</Badge>
                        )}
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-text-tertiary">
                      <Link
                        href={`/ordonnances/${recommendation.prescription.id}`}
                        className="font-mono hover:underline"
                      >
                        {recommendation.prescription.reference}
                      </Link>
                      <span>{formatDate(recommendation.createdAt)}</span>
                      <span className="tabular">
                        Score {Math.round(recommendation.totalScore * 100)} %
                      </span>
                      <span className="tabular">
                        {formatCents(recommendation.unitPriceCents)}
                      </span>
                      {recommendation.decidedBy && (
                        <span>
                          {recommendation.decidedBy.firstName}{" "}
                          {recommendation.decidedBy.lastName}
                        </span>
                      )}
                    </div>

                    {recommendation.pharmacistNote && (
                      <p className="text-[12px] text-text-secondary">
                        « {recommendation.pharmacistNote} »
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EngineExplainer() {
  const dimensions = (Object.keys(SCORE_WEIGHTS) as (keyof typeof SCORE_WEIGHTS)[]).sort(
    (a, b) => SCORE_WEIGHTS[b] - SCORE_WEIGHTS[a],
  );

  return (
    <div className="space-y-5">
      <Alert tone="warning" title="Les règles ci-dessous doivent être validées par un pharmacien">
        Ce socle de règles est structuré pour le MVP. Avant toute utilisation réelle, il doit
        être revu par un professionnel et idéalement adossé à des recommandations
        professionnelles référencées.
      </Alert>

      <Card>
        <CardHeader
          title="L'ordre des étapes"
          description="Chaque étape ne reçoit que la sortie de la précédente : une considération commerciale ne peut donc pas influencer la sécurité."
        />
        <CardContent>
          <ol className="space-y-3">
            {PIPELINE_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-[12px] font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                  {index + 1}
                </span>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[13.5px] font-medium text-text-primary">{step.title}</p>
                  <p className="text-[12.5px] leading-5 text-text-secondary">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Les dimensions du score"
          description="Un score explicable, jamais une boîte noire."
        />
        <CardContent>
          <ul className="space-y-3">
            {dimensions.map((dimension) => (
              <li key={dimension} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium text-text-primary">
                    {DIMENSION_LABELS[dimension]}
                  </span>
                  <span className="text-[12.5px] tabular text-text-tertiary">
                    poids {Math.round(SCORE_WEIGHTS[dimension] * 100)} %
                  </span>
                </div>
                <Progress
                  value={SCORE_WEIGHTS[dimension]}
                  max={0.4}
                  tone={dimension === "commercial" ? "accent" : "brand"}
                  label={DIMENSION_LABELS[dimension]}
                />
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-border-subtle pt-3 text-[12px] leading-5 text-text-secondary">
            La dimension commerciale pèse {Math.round(SCORE_WEIGHTS.commercial * 100)} % du score.
            Elle ne peut départager que deux références déjà jugées cliniquement équivalentes.
            Un produit écarté pour raison de sécurité obtient un score total nul, quel que soit
            le reste.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title={`Règles de conseil (${ADVICE_RULES.length})`}
          description="Ce que le moteur sait détecter, et ce qui le bloque."
        />
        <CardContent className="pt-0">
          <ul className="divide-y divide-border-subtle">
            {ADVICE_RULES.map((rule) => (
              <li key={rule.key} className="space-y-1.5 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-[13.5px] font-medium text-text-primary">{rule.title}</p>
                  <div className="flex gap-1.5">
                    <Badge tone="neutral">{PRODUCT_CATEGORY_LABELS[rule.category]}</Badge>
                    <Badge tone="brand">priorité {rule.basePriority}</Badge>
                  </div>
                </div>
                <p className="text-[12.5px] leading-5 text-text-secondary">
                  {rule.rationaleTemplate.replace("{drug}", "le traitement")}
                </p>
                <p className="text-[12px] leading-4 text-text-tertiary">
                  {rule.clinicalContext}
                </p>
                {rule.safetyNotes.length > 0 && (
                  <ul className="space-y-0.5">
                    {rule.safetyNotes.map((note) => (
                      <li
                        key={note}
                        className="text-[12px] leading-4 text-warning-700 dark:text-warning-500"
                      >
                        ⚠ {note}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {rule.atcPrefixes.map((prefix) => (
                    <span
                      key={prefix}
                      className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[10.5px] text-text-tertiary"
                    >
                      ATC {prefix}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

const PIPELINE_STEPS = [
  {
    title: "Sécurité",
    body: "Contrôle de l'extraction, couverture du référentiel, contre-indications déclarées, interactions documentées. Un signal bloquant écarte définitivement une piste.",
  },
  {
    title: "Compréhension du traitement",
    body: "Reformulation de ce que dit le référentiel médicamenteux — jamais un fait inventé. En l'absence d'information, aucune explication n'est produite.",
  },
  {
    title: "Pertinence",
    body: "Identification des opportunités de conseil, sans aucun accès au catalogue. On détermine d'abord ce qui serait utile, pas ce qui est disponible.",
  },
  {
    title: "Appariement avec le stock",
    body: "Recherche des références de votre officine correspondant à l'opportunité, en excluant celles en rupture et celles écartées pour raison de sécurité.",
  },
  {
    title: "Classement explicable",
    body: "Score multi-dimensionnel : chaque contribution est conservée et restituée au pharmacien.",
  },
  {
    title: "Optimisation commerciale autorisée",
    body: "Dernière étape, périmètre restreint : départager deux références cliniquement équivalentes et limiter le nombre de propositions. Rien d'autre.",
  },
];
