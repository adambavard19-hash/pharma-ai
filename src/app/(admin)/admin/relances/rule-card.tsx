"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, FileText, Mail, Power, PowerOff, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { StatusBadge } from "@/components/admin/status-badge";
import { CATCH_UP_DAYS, describeOffset, type ResolvedRule } from "@/core/admin/automations";
import type { StatusLabel } from "@/core/admin/statuses";
import type { TemplateText } from "@/core/admin/email-templates";
import { saveAutomationRuleAction } from "@/server/actions/admin-communication";
import { sendTestEmailAction } from "@/server/actions/admin-email";
import { AutomationPreviewButton, AutomationPreviewList } from "./automation-preview";

export type RuleCardTemplate = { key: string; label: string; customized: boolean; text: TemplateText };
export type RuleCardDispatch = { id: string; at: string; status: StatusLabel; recipient: string | null; detail: string | null; targetLabel: string | null; href: string | null };

/**
 * « 5 jours avant la fin de l'essai », « 1 jour après le début de l'essai »,
 * « Le jour même de l'enregistrement de la demande » : le délai en clair, à
 * partir du déclencheur écrit dans la règle.
 */
export function delayPhrase(trigger: string, offsetDays: number): string {
  const match = /^Jours (après|avant) (.+)$/.exec(trigger);
  if (!match) return describeOffset(offsetDays);
  const [, direction, anchor] = match;
  const days = Math.abs(offsetDays);
  if (offsetDays === 0) return `Le jour même de ${anchor}`.replace(/ de le /g, " du ").replace(/ de les /g, " des ");
  return `${days} jour${days > 1 ? "s" : ""} ${direction} ${anchor}`;
}

/** Une règle de relance : interrupteur confirmé, délai dans ses bornes, modèle, derniers déclenchements. */
export function RuleCard({ rule, template, recent, messagingLive, schedulerActive }: { rule: ResolvedRule; template: RuleCardTemplate | null; recent: RuleCardDispatch[]; messagingLive: boolean; schedulerActive: boolean }) {
  // Les règles « avant l'échéance » se saisissent en jours positifs : on garde le signe pour soi.
  const before = rule.maxOffsetDays < 0;
  const toInput = (offset: number) => (before ? -offset : offset);
  const fromInput = (value: number) => (before ? -value : value);
  const inputMin = before ? -rule.maxOffsetDays : rule.minOffsetDays;
  const inputMax = before ? -rule.minOffsetDays : rule.maxOffsetDays;

  const [draft, setDraft] = useState<string>(String(toInput(rule.offsetDays)));
  const [testing, startTest] = useTransition();
  const [saving, startSave] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  const parsed = Number.parseInt(draft, 10);
  const draftValid = Number.isFinite(parsed) && parsed >= inputMin && parsed <= inputMax;
  const draftOffset = draftValid ? fromInput(parsed) : rule.offsetDays;
  const dirty = draftValid && draftOffset !== rule.offsetDays;
  const phrase = delayPhrase(rule.trigger, draftOffset);
  const isEmail = rule.channel === "EMAIL";
  const toPartner = rule.audience === "Partenaire";
  const recipientNoun = toPartner ? "partenaire" : "officine";

  const schedule = schedulerActive ? "Passage automatique chaque jour à 8 h 15 (UTC), ou à la demande avec « Lancer maintenant »." : "La tâche planifiée n'est pas active sur ce serveur : les relances ne partent que par « Lancer maintenant ».";
  const activationConsequences = isEmail
    ? [
        toPartner ? "Des e-mails partiront automatiquement aux partenaires concernés, sans autre validation." : "Des e-mails partiront automatiquement aux officines concernées, sans autre validation.",
        ...(rule.alsoDoes ? [rule.alsoDoes] : []),
        `Délai appliqué : ${phrase.toLowerCase()} (${describeOffset(draftOffset)}).`,
        schedule,
        `Chaque relance part une seule fois par ${recipientNoun} et par occurrence ; rien n'est rattrapé au-delà de ${CATCH_UP_DAYS} jours.`,
        ...(messagingLive ? [] : ["La messagerie n'est pas configurée : les envois seront tracés « non transmis » tant qu'elle ne l'est pas."]),
      ]
    : [
        "Des alertes internes seront créées pour l'équipe PharmaBoost, et pour le commercial du dossier le cas échéant.",
        "Aucun e-mail ne part vers les officines.",
        `Délai appliqué : ${phrase.toLowerCase()} (${describeOffset(draftOffset)}).`,
        schedule,
      ];

  const saveDelay = () =>
    startSave(async () => {
      const result = await saveAutomationRuleAction({ key: rule.key, enabled: rule.enabled, offsetDays: draftOffset });
      if (!result.ok) {
        push({ tone: "error", title: result.error });
        return;
      }
      push({ tone: "success", title: "Délai enregistré.", description: "La règle reste désactivée." });
      router.refresh();
    });

  const sendTest = () =>
    startTest(async () => {
      if (!template) return;
      const result = await sendTestEmailAction({ templateKey: template.key, text: template.text });
      if (!result.ok) {
        push({ tone: "error", title: result.error });
        return;
      }
      push({ tone: result.data.status === "SENT" ? "success" : "warning", title: result.message ?? "Test traité." });
    });

  return (
    <article className={"flex flex-col gap-4 rounded-xl border p-4 transition-colors " + (rule.enabled ? "border-brand-200 bg-brand-50/30 dark:border-brand-800/60 dark:bg-brand-950/20" : "border-border-subtle bg-surface-card")}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14.5px] leading-5 font-semibold text-text-primary">{rule.label}</h3>
            <Badge tone={rule.enabled ? "success" : "neutral"}>{rule.enabled ? "Activée" : "Désactivée"}</Badge>
            <Badge tone={isEmail ? "info" : "brand"} icon={isEmail ? <Mail className="size-3" aria-hidden="true" /> : <BellRing className="size-3" aria-hidden="true" />}>
              {isEmail ? `E-mail ${toPartner ? "au partenaire" : "à l'officine"}` : "Alerte interne"}
            </Badge>
          </div>
          <p className="text-[12.5px] leading-5 text-text-secondary">
            <span className="font-medium text-text-primary tabular-nums">{describeOffset(rule.offsetDays)}</span> · {delayPhrase(rule.trigger, rule.offsetDays)}
          </p>
        </div>
        {rule.enabled ? (
          <ConfirmAction
            label="Désactiver"
            icon={<PowerOff className="size-4" />}
            variant="outline"
            title={`Désactiver « ${rule.label} » ?`}
            consequences={["Plus aucun envoi automatique pour cette règle.", "L'historique des déclenchements est conservé.", "Vous pourrez la réactiver à tout moment."]}
            confirmLabel="Désactiver la règle"
            onConfirm={() => saveAutomationRuleAction({ key: rule.key, enabled: false, offsetDays: rule.offsetDays })}
          />
        ) : (
          <ConfirmAction
            label="Activer"
            icon={<Power className="size-4" />}
            variant="primary"
            title={`Activer « ${rule.label} » ?`}
            description={isEmail ? "À partir de maintenant, cette relance part toute seule." : "À partir de maintenant, cette alerte se déclenche toute seule."}
            consequences={activationConsequences}
            confirmLabel={isEmail ? "Activer les envois automatiques" : "Activer l'alerte"}
            disabled={!draftValid}
            onConfirm={() => saveAutomationRuleAction({ key: rule.key, enabled: true, offsetDays: draftOffset })}
          >
            <div className="space-y-2">
              <p className="text-[12px] font-semibold tracking-[0.04em] text-text-tertiary uppercase">Aujourd&apos;hui, avec ce délai</p>
              <AutomationPreviewList ruleKey={rule.key} offsetDays={draftOffset} />
            </div>
          </ConfirmAction>
        )}
      </header>

      {rule.overlap && (
        <Alert tone="warning" className="text-[12.5px]">
          {rule.overlap}
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={`delay-${rule.key}`} className="block text-[12px] font-medium text-text-tertiary">
            Délai
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`delay-${rule.key}`}
              type="number"
              inputMode="numeric"
              min={inputMin}
              max={inputMax}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-invalid={!draftValid}
              aria-describedby={`delay-help-${rule.key}`}
              className="h-9 w-20 rounded-lg border border-border-default bg-surface-card px-2.5 text-[13.5px] text-text-primary tabular-nums focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none aria-[invalid=true]:border-danger-500"
            />
            <span className="text-[13px] text-text-secondary">{before ? "jours avant" : "jours après"}</span>
          </div>
          <p id={`delay-help-${rule.key}`} className="text-[12px] leading-4 text-text-tertiary">
            {draftValid ? phrase : `Entre ${inputMin} et ${inputMax} jours.`}
            {draftValid && <> · réglable de {inputMin} à {inputMax}</>}
          </p>
          {dirty &&
            (rule.enabled ? (
              <ConfirmAction
                label="Enregistrer le délai"
                variant="secondary"
                title={`Nouveau délai pour « ${rule.label} »`}
                consequences={[`${describeOffset(rule.offsetDays)} devient ${describeOffset(draftOffset)} : ${phrase.toLowerCase()}.`, "La règle étant activée, les prochains passages appliqueront ce délai.", "Ce qui est déjà parti ne repart pas."]}
                confirmLabel="Enregistrer"
                onConfirm={() => saveAutomationRuleAction({ key: rule.key, enabled: true, offsetDays: draftOffset })}
              >
                <AutomationPreviewList ruleKey={rule.key} offsetDays={draftOffset} />
              </ConfirmAction>
            ) : (
              <Button type="button" variant="secondary" size="sm" loading={saving} onClick={saveDelay}>
                Enregistrer le délai
              </Button>
            ))}
        </div>

        <div className="space-y-1.5">
          <p className="text-[12px] font-medium text-text-tertiary">{isEmail ? "Modèle envoyé" : "Destinataires"}</p>
          {isEmail ? (
            template ? (
              <div className="space-y-1">
                <Link href={`/admin/emails/modeles/${template.key}`} className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-brand-700 hover:underline dark:text-brand-400">
                  <FileText className="size-4" aria-hidden="true" />
                  {template.label}
                </Link>
                <p>
                  <Badge tone={template.customized ? "brand" : "neutral"}>{template.customized ? "Personnalisé" : "Texte par défaut"}</Badge>
                </p>
              </div>
            ) : (
              <p className="text-[13px] text-text-secondary">Modèle introuvable.</p>
            )
          ) : (
            <p className="text-[13px] leading-5 text-text-secondary">L&apos;équipe PharmaBoost (cloche de la console){rule.scenario === "COMMERCIAL" ? ", et le commercial qui suit le dossier." : "."}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[12px] font-medium text-text-tertiary">Derniers déclenchements</p>
        {recent.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-subtle px-3 py-2.5 text-[12.5px] text-text-tertiary">Aucun déclenchement pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-card">
            {recent.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="w-[118px] shrink-0 text-[12px] text-text-tertiary tabular-nums">{d.at}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary" title={d.detail ?? undefined}>
                  {d.href ? (
                    <Link href={d.href} className="hover:underline">
                      {d.targetLabel ?? "—"}
                    </Link>
                  ) : (
                    (d.targetLabel ?? "—")
                  )}
                  {d.recipient && <span className="text-text-tertiary"> · {d.recipient}</span>}
                </span>
                <StatusBadge status={d.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="mt-auto flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
        <AutomationPreviewButton ruleKey={rule.key} offsetDays={draftOffset} title={`Aperçu — ${rule.label}`} />
        {isEmail && template && (
          <Button type="button" variant="ghost" size="sm" leadingIcon={<Send className="size-4" />} loading={testing} onClick={sendTest}>
            M&apos;envoyer un test
          </Button>
        )}
      </footer>
    </article>
  );
}
