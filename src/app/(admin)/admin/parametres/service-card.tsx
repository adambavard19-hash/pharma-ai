import Link from "next/link";
import { ArrowUpRight, Building2, CalendarClock, CheckCircle2, CircleDashed, CreditCard, FileSignature, Globe, HardDrive, Lightbulb, ListChecks, Mail, Webhook, XCircle } from "lucide-react";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { HEALTH_STATE_LABELS, type ServiceHealth, type ServiceKey } from "@/server/services/admin/platform-health";
import { CopyButton } from "./copy-button";

const ICONS: Record<ServiceKey, typeof Mail> = {
  messaging: Mail,
  payments: CreditCard,
  signature: FileSignature,
  cron: CalendarClock,
  webhooks: Webhook,
  publicUrl: Globe,
  storage: HardDrive,
  company: Building2,
};

const ICON_TONE = {
  CONFIGURED: "bg-success-50 text-success-700 dark:bg-success-700/20 dark:text-success-500",
  TEST: "bg-info-50 text-info-700 dark:bg-info-700/20 dark:text-info-500",
  INCOMPLETE: "bg-warning-50 text-warning-700 dark:bg-warning-700/20 dark:text-warning-500",
  NOT_CONFIGURED: "bg-danger-50 text-danger-700 dark:bg-danger-700/20 dark:text-danger-500",
} as const;

/**
 * Une carte par service : son état en badge, une phrase, les faits publics,
 * les vérifications (présent / absent), puis ce qu'il reste à faire.
 */
export function ServiceCard({ service }: { service: ServiceHealth }) {
  const Icon = ICONS[service.key];
  const blocking = service.state !== "CONFIGURED" && service.todo.length > 0;
  return (
    <section id={`service-${service.key}`} className="flex scroll-mt-28 flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-card">
      <header className="flex items-start gap-3 border-b border-border-subtle px-5 py-4">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", ICON_TONE[service.state])} aria-hidden="true">
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] leading-6 font-semibold text-text-primary">{service.title}</h2>
            <StatusBadge status={HEALTH_STATE_LABELS[service.state]} />
          </div>
          <p className="mt-0.5 text-[13px] leading-5 text-text-secondary">{service.summary}</p>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-5">
        {service.facts.length > 0 && (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {service.facts.map((fact) => (
              <div key={fact.label} className="min-w-0">
                <dt className="text-[12px] font-medium text-text-tertiary">{fact.label}</dt>
                <dd className="mt-0.5 text-[13.5px] leading-5 break-words text-text-primary">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {service.endpoints && service.endpoints.length > 0 && (
          <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
            {service.endpoints.map((endpoint) => (
              <li key={endpoint.url} className={cn("space-y-1.5 px-3.5 py-3", !endpoint.applicable && "opacity-60")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-text-primary">{endpoint.label}</span>
                  {!endpoint.applicable ? <Badge tone="neutral">Non utilisé</Badge> : endpoint.secured ? <Badge tone="success">Secret présent</Badge> : <Badge tone="warning">Sans secret</Badge>}
                </div>
                <div className="flex min-w-0 items-center gap-1">
                  <code className="min-w-0 flex-1 truncate rounded-md bg-surface-sunken px-2 py-1 font-mono text-[12px] text-text-secondary" title={endpoint.url}>
                    {endpoint.url}
                  </code>
                  <CopyButton value={endpoint.url} />
                </div>
                {endpoint.applicable && !endpoint.secured && <p className="text-[12px] leading-4 text-text-tertiary">{endpoint.note}</p>}
              </li>
            ))}
          </ul>
        )}

        {service.checks.length > 0 && (
          <ul className="space-y-1.5" aria-label="Vérifications">
            {service.checks.map((check) => (
              <li key={check.label} className="flex items-center gap-2 text-[13px] leading-5">
                {check.ok ? (
                  <CheckCircle2 className="size-4 shrink-0 text-success-600" aria-hidden="true" />
                ) : check.optional ? (
                  <CircleDashed className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                ) : (
                  <XCircle className="size-4 shrink-0 text-danger-600" aria-hidden="true" />
                )}
                <span className={check.ok ? "text-text-primary" : "text-text-secondary"}>{check.label}</span>
                <span className="sr-only">{check.ok ? " : oui" : " : non"}</span>
                {check.optional && !check.ok && <span className="text-[11.5px] text-text-tertiary">facultatif</span>}
              </li>
            ))}
          </ul>
        )}

        {service.todo.length > 0 && (
          <div className={cn("rounded-xl px-4 py-3", blocking ? "bg-warning-50/80 dark:bg-warning-700/10" : "bg-surface-sunken")}>
            <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text-primary">
              <ListChecks className="size-4 text-text-tertiary" aria-hidden="true" />À faire
            </p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[13px] leading-5 text-text-secondary marker:text-text-tertiary">
              {service.todo.map((step) => (
                <li key={step} className="break-words">{step}</li>
              ))}
            </ol>
          </div>
        )}

        {service.tips.length > 0 && (
          <div className="rounded-xl bg-surface-sunken px-4 py-3">
            {service.tips.map((tip) => (
              <p key={tip} className="flex gap-2 text-[12.5px] leading-5 text-text-secondary">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
                <span>{tip}</span>
              </p>
            ))}
          </div>
        )}

        {service.links.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
            {service.links.map((link) => (
              <Link key={link.href + link.label} href={link.href} className="group inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300">
                {link.label}
                <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
