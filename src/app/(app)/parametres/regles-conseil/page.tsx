import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { CONTEXT_RULES, NEED_DEFINITIONS } from "@/core/understanding";
import { PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { SettingsTabs } from "../settings-tabs";

export const metadata: Metadata = { title: "Règles du moteur de conseil" };

/**
 * Le registre des règles — la page interne.
 *
 * Tout ce que le moteur peut dire au comptoir est écrit ici, avec son
 * déclencheur, ce qu'il propose, sa justification, sa version et l'état de
 * sa validation. Rien de ce qui n'est pas validé n'est présenté comme une
 * vérité médicale : au comptoir, la règle parle au conditionnel ; ici, elle
 * porte son statut en clair.
 */
export default async function AdviceRulesRegistryPage() {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_RULES_MANAGE);

  const pending = ADVICE_RULES.filter((rule) => rule.validation.status === "PENDING").length;
  const validated = ADVICE_RULES.length - pending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Règles du moteur de conseil"
        description="Ce que PharmaBoost peut proposer au comptoir, règle par règle : déclencheur, proposition, justification, version et validation."
      />
      <SettingsTabs
        canSeeTeam={session.permissions.has(PERMISSIONS.TEAM_MANAGE)}
        canSeeRules={true}
        canSeeAudit={session.permissions.has(PERMISSIONS.AUDIT_VIEW)}
      />

      <Alert tone={pending > 0 ? "warning" : "success"} title={`${validated} règle${validated > 1 ? "s" : ""} validée${validated > 1 ? "s" : ""} · ${pending} à valider`}>
        Une règle « à valider » est écrite, testée et versionnée, mais n&apos;a pas encore été relue
        par un pharmacien. Elle parle au comptoir avec des « peut », jamais des « doit », et la
        décision reste celle du professionnel. Aucune règle non validée n&apos;est présentée comme
        une vérité médicale.
      </Alert>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-text-primary">
          Règles de conseil ({ADVICE_RULES.length})
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface-card">
          <table className="w-full min-w-[960px] text-[13px]">
            <thead className="bg-surface-sunken/60 text-left text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">
              <tr>
                <th className="px-4 py-2.5">Règle</th>
                <th className="px-4 py-2.5">Déclencheur</th>
                <th className="px-4 py-2.5">Propose</th>
                <th className="px-4 py-2.5">Justification</th>
                <th className="px-4 py-2.5">Version</th>
                <th className="px-4 py-2.5">Statut</th>
                <th className="px-4 py-2.5">Validée le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle align-top">
              {ADVICE_RULES.map((rule) => {
                const triggers = [
                  ...rule.atcPrefixes.map((prefix) => `ATC ${prefix}`),
                  ...rule.therapeuticClasses,
                  ...(rule.needTriggers ?? []).map((need) => `Besoin : ${NEED_DEFINITIONS[need].label}`),
                ];
                return (
                  <tr key={rule.key}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-text-primary">{rule.title}</p>
                      <p className="mt-0.5 font-mono text-[11.5px] text-text-tertiary">{rule.key}</p>
                      <p className="mt-1">
                        <Badge tone={rule.kind === "SAFETY" ? "danger" : rule.kind === "TOLERANCE" ? "warning" : "neutral"}>
                          {rule.kind === "SAFETY" ? "Sécurité" : rule.kind === "TOLERANCE" ? "Tolérance" : "Confort"}
                        </Badge>
                      </p>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      <ul className="space-y-0.5">
                        {triggers.map((trigger) => (
                          <li key={trigger}>{trigger}</li>
                        ))}
                      </ul>
                      {rule.question && (
                        <p className="mt-1.5 text-[12px] text-text-tertiary">
                          Question au patient : « {rule.question} »
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      <p>{PRODUCT_CATEGORY_LABELS[rule.category] ?? rule.category}</p>
                      <p className="mt-0.5 text-[12px] text-text-tertiary">{rule.matchingTags.join(", ")}</p>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      <p>{rule.rationaleTemplate.replaceAll("{drug}", "[médicament]")}</p>
                      {rule.clinicalContext && (
                        <p className="mt-1 text-[12px] text-text-tertiary">{rule.clinicalContext}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular text-text-secondary">v{rule.version}</td>
                    <td className="px-4 py-3">
                      <Badge tone={rule.validation.status === "VALIDATED" ? "success" : "warning"}>
                        {rule.validation.status === "VALIDATED" ? "Validée" : "À valider"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {rule.validation.status === "VALIDATED"
                        ? `${rule.validation.validatedAt} · ${rule.validation.validatedBy}`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-text-primary">
          Règles de contexte ({CONTEXT_RULES.length})
        </h2>
        <p className="text-[13px] leading-5 text-text-secondary">
          Comment un besoin est dérivé des codes ATC de l&apos;ordonnance, localement, sans appel
          à un modèle. Un besoin n&apos;est pas un conseil : il déclenche une règle ci-dessus, qui
          pose sa question au patient.
        </p>
        <Card>
          <CardContent className="pt-3 pb-3">
            <ul className="divide-y divide-border-subtle">
              {CONTEXT_RULES.map((rule) => (
                <li key={rule.need} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-2.5 text-[13px]">
                  <span className="w-56 shrink-0 font-medium text-text-primary">
                    {NEED_DEFINITIONS[rule.need].label}
                  </span>
                  <span className="min-w-0 flex-1 text-text-secondary">
                    Déclencheurs ATC {rule.triggers.join(", ")}
                    {rule.coveredBy ? ` · couvert par ${rule.coveredBy.join(", ")}` : ""}
                    {rule.when ? " · condition supplémentaire" : ""}
                    <span className="block text-[12px] text-text-tertiary">{rule.justification}</span>
                  </span>
                  <Badge tone="warning">À valider</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
