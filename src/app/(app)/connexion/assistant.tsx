"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Boxes, Check, FileUp, Link2Off, Monitor, Plug, Server, ShoppingCart, type LucideIcon } from "lucide-react";
import { chooseLgoAction, type OverviewSnapshot } from "@/server/actions/stock-sync";
import { connectionMethods } from "@/core/stock/connection-overview";
import type { LgoDefinition } from "@/core/stock/connectors";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { PostInstallFlow, ServerInstallFlow } from "./install-panels";
import { HeadlineBar, StatusTile } from "./status";
import { useLiveSnapshot } from "./use-live-snapshot";

/**
 * « Connecter ma pharmacie » : un seul parcours, trois étapes.
 *
 *   1. Je choisis mon logiciel.
 *   2. PharmaBoost me montre ce qui existe vraiment pour lui — envoyer un
 *      fichier, installer PharmaBoost Connect — et me guide.
 *   3. Je vois si la connexion, le stock et les ventes fonctionnent.
 *
 * Tout ce qui se lit en haut vient de `buildConnectionOverview` : la connexion,
 * le stock reçu et les ventes sont trois états séparés, jamais fondus en un
 * seul « connecté ». Rien n'est présenté comme automatique quand ça ne l'est pas.
 */

export type Step = 1 | 2 | 3;
export const STEP_LABELS: Record<Step, string> = { 1: "Choisir mon logiciel", 2: "Envoyer mon stock", 3: "Vérifier la connexion" };

/**
 * L'assistant seul, avec sa phrase de dix secondes : c'est ce que voit un titulaire qui ouvre sa
 * pharmacie pour la première fois (page d'accueil). La page « Ma connexion » prend les mêmes étapes
 * (`ConnectSteps`) et y ajoute le tableau d'état, le test et le robot.
 */
export function ConnectAssistant({
  lgos,
  initial,
  serverUrl,
  continueHref,
}: {
  lgos: LgoDefinition[];
  initial: OverviewSnapshot;
  serverUrl: string;
  /** Dans l'accueil d'une nouvelle officine : où continuer une fois le stock reçu. */
  continueHref?: string;
}) {
  const { snapshot, refresh } = useLiveSnapshot(initial);
  const [step, setStep] = useState<Step>(initial.lgo ? initial.overview.headline.step : 1);
  const headline = snapshot.overview.headline;
  return (
    <div className="space-y-5">
      <HeadlineBar
        tone={headline.tone}
        title={headline.title}
        detail={headline.detail}
        action={headline.action ? <Button onClick={() => setStep(snapshot.lgo || headline.step === 1 ? headline.step : 1)} trailingIcon={<ArrowRight className="size-4" />}>{headline.action}</Button> : undefined}
      />
      <ConnectSteps lgos={lgos} snapshot={snapshot} serverUrl={serverUrl} step={step} onStep={setStep} continueHref={continueHref} onChanged={() => void refresh()} />
    </div>
  );
}

/**
 * Les trois étapes, rien d'autre : l'étape ouverte, et les deux autres repliées en dessous.
 * `step3` remplace le contenu de la dernière étape (la page « Ma connexion » y met son test).
 */
export function ConnectSteps({
  lgos,
  snapshot,
  serverUrl,
  step,
  onStep,
  continueHref,
  step3,
  onChanged,
}: {
  lgos: LgoDefinition[];
  snapshot: OverviewSnapshot;
  serverUrl: string;
  step: Step;
  onStep: (step: Step) => void;
  continueHref?: string;
  step3?: ReactNode;
  /** Le logiciel vient d'être choisi, ou un poste d'être créé : relire l'état tout de suite. */
  onChanged?: () => void;
}) {
  const [lgo, setLgo] = useState<string | null>(snapshot.lgo);
  const [method, setMethod] = useState<"file" | "connect" | null>(null);
  const [device, setDevice] = useState<"post" | "server" | null>(null);
  const [saving, startSave] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  const { overview } = snapshot;
  const methods = connectionMethods(lgo);
  const lgoName = methods.lgo && methods.lgo.id !== "autre" ? methods.lgo.label : "votre logiciel";

  const chooseAndContinue = () => {
    if (!lgo) return;
    startSave(async () => {
      const result = await chooseLgoAction({ lgo });
      if (!result.ok) return push({ tone: "error", title: result.error });
      onStep(2);
      onChanged?.();
      router.refresh();
    });
  };

  const goTo = (target: Step) => {
    if (target > 1 && !lgo) return;
    onStep(target);
  };

  return (
    <div className="space-y-5">
      <section className="space-y-5 rounded-3xl border border-border-subtle bg-surface-card p-5 sm:p-6">
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[20px] font-semibold text-text-primary">Étape {step} sur 3</p>
            <p className="text-[14px] text-text-tertiary">{STEP_LABELS[step]}</p>
          </div>
          <div className="flex gap-2" role="tablist" aria-label="Étapes">
            {([1, 2, 3] as const).map((n) => (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={step === n}
                aria-label={`Étape ${n} : ${STEP_LABELS[n]}`}
                disabled={n > 1 && !lgo}
                onClick={() => goTo(n)}
                className={cn("h-1.5 flex-1 rounded-full transition-colors disabled:cursor-not-allowed", n <= step ? "bg-success-600" : "bg-ink-200 dark:bg-ink-700")}
              />
            ))}
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-[22px] leading-7 font-semibold tracking-[-0.01em] text-text-primary">Quel logiciel utilisez-vous ?</h3>
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Logiciel de l'officine">
              {lgos.map((candidate) => {
                const selected = lgo === candidate.id;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setLgo(candidate.id)}
                    className={cn(
                      "flex min-h-16 items-center justify-between gap-2 rounded-2xl border px-5 py-3 text-left text-[18px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none",
                      selected ? "border-success-600 bg-success-50 text-text-primary dark:bg-success-950/30" : "border-border-default bg-surface-sunken/40 text-text-primary hover:border-brand-400",
                    )}
                  >
                    <span>{candidate.id === "autre" ? "Autre" : candidate.label}</span>
                    {selected && <Check className="size-5 text-success-600" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            <Button size="xl" className="w-full" disabled={!lgo} loading={saving} onClick={chooseAndContinue} trailingIcon={<ArrowRight className="size-5" />}>
              Continuer
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-[22px] leading-7 font-semibold tracking-[-0.01em] text-text-primary">Comment envoyer votre stock ?</h3>
              <p className="text-[14px] text-text-secondary">
                Avec {lgoName}. <button type="button" onClick={() => onStep(1)} className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">Changer de logiciel</button>
              </p>
            </div>

            <div className="grid gap-3">
              <MethodTile
                icon={FileUp}
                title="Envoyer un fichier"
                subtitle="Le plus simple : disponible tout de suite."
                badge="Disponible"
                tone="success"
                selected={method === "file"}
                onClick={() => setMethod(method === "file" ? null : "file")}
              >
                <ol className="grid gap-2 text-[14px] text-text-primary sm:grid-cols-3">
                  <MiniStep n={1}>Sortez le stock de {lgoName}</MiniStep>
                  <MiniStep n={2}>Choisissez le fichier ici</MiniStep>
                  <MiniStep n={3}>PharmaBoost le lit en une minute</MiniStep>
                </ol>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="lg" trailingIcon={<ArrowRight className="size-4" />}>
                    <Link href="/stock/mise-a-jour">Choisir mon fichier</Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" leadingIcon={<BookOpen className="size-4" />}>
                    <Link href={`/connexion/guide${lgo ? `?logiciel=${lgo}` : ""}`}>Guide pas à pas</Link>
                  </Button>
                </div>
              </MethodTile>

              <MethodTile
                icon={Plug}
                title="Installer PharmaBoost Connect"
                subtitle="Lit le fichier dès que vous l'enregistrez, et suit les ventes du comptoir."
                badge={methods.connect.badge}
                tone={methods.connect.tested ? "info" : "warning"}
                selected={method === "connect"}
                onClick={() => setMethod(method === "connect" ? null : "connect")}
              >
                <p className="text-[13.5px] leading-5 text-text-secondary">{methods.connect.note}</p>
                <p className="text-[14px] font-medium text-text-primary">Sur quel ordinateur ?</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DeviceButton icon={Monitor} title="Poste de comptoir" subtitle="Là où la douchette est branchée" selected={device === "post"} onClick={() => setDevice("post")} />
                  <DeviceButton icon={Server} title="Serveur de l'officine" subtitle="Là où le stock est enregistré" selected={device === "server"} onClick={() => setDevice("server")} />
                </div>
                {device === "post" && <PostInstallFlow onCreated={() => onStep(2)} />}
                {device === "server" && lgo && <ServerInstallFlow lgo={lgo} serverUrl={serverUrl} />}
              </MethodTile>

              <MethodTile icon={Link2Off} title="Lire votre logiciel en direct" subtitle={methods.direct.reason} badge={methods.direct.badge} tone="neutral" disabled />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
              <Button variant="ghost" onClick={() => onStep(1)}>Retour</Button>
              <Button variant="outline" onClick={() => onStep(3)} trailingIcon={<ArrowRight className="size-4" />}>Vérifier la connexion</Button>
            </div>
          </div>
        )}

        {step === 3 && (step3 ?? (
          <div className="space-y-4">
            <h3 className="text-[22px] leading-7 font-semibold tracking-[-0.01em] text-text-primary">Où en est votre connexion ?</h3>
            <div className="grid gap-3">
              <StatusTile
                icon={Plug}
                label="PharmaBoost Connect"
                tone={overview.agent.tone}
                title={overview.agent.title}
                detail={overview.agent.detail}
                action={
                  <Button size="sm" variant="outline" onClick={() => { onStep(2); setMethod("connect"); }}>
                    {overview.agent.items.length > 0 ? "Ajouter un appareil" : "Installer"}
                  </Button>
                }
              >
                {overview.agent.items.length > 0 && (
                  <ul className="space-y-1 pt-1 text-[13px]">
                    {overview.agent.items.map((item) => (
                      <li key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center gap-x-2 text-text-secondary">
                        <span className={cn("size-2 shrink-0 rounded-full", item.online ? "bg-success-600" : "bg-ink-300 dark:bg-ink-600")} aria-hidden="true" />
                        <span className="font-medium text-text-primary">{item.label}</span>
                        <span>{item.online ? "en ligne" : "hors ligne"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </StatusTile>

              <StatusTile
                icon={Boxes}
                label="Stock reçu"
                tone={overview.stock.tone}
                title={overview.stock.title}
                detail={overview.stock.detail}
                action={
                  <Button asChild size="sm" variant={overview.stock.state === "FRESH" ? "outline" : "primary"}>
                    <Link href="/stock/mise-a-jour">{overview.stock.state === "NONE" ? "Envoyer mon stock" : "Mettre à jour"}</Link>
                  </Button>
                }
              >
                {overview.agent.state === "ONLINE" && lgo && <p className="text-[12.5px] leading-5 text-text-tertiary">{methods.connect.note}</p>}
              </StatusTile>

              <StatusTile
                icon={ShoppingCart}
                label="Ventes"
                tone={overview.sales.tone}
                title={overview.sales.title}
                detail={overview.sales.detail}
                action={overview.sales.state === "NO_POST" ? <Button size="sm" variant="outline" onClick={() => { onStep(2); setMethod("connect"); setDevice("post"); }}>Ajouter un poste</Button> : undefined}
              />
            </div>
            {overview.stock.problem && (
              <p className="rounded-xl border border-warning-300 bg-warning-50/60 px-4 py-2.5 text-[13.5px] text-text-primary dark:border-warning-800 dark:bg-warning-950/20">{overview.stock.problem}</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
              <Button variant="ghost" onClick={() => onStep(2)}>Retour</Button>
              <div className="flex gap-2">
                <Button asChild variant="outline"><Link href="/stock">Voir mon stock</Link></Button>
                {continueHref && overview.stock.state !== "NONE" && (
                  <Button asChild trailingIcon={<ArrowRight className="size-4" />}><Link href={continueHref}>Continuer</Link></Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Les deux autres étapes, repliées : on voit d'un coup d'œil où l'on est. */}
      <ul className="divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface-card">
        {([1, 2, 3] as const)
          .filter((n) => n !== step)
          .map((n) => (
            <li key={n}>
              <button
                type="button"
                disabled={n > 1 && !lgo}
                onClick={() => goTo(n)}
                className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-sunken/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border-default text-[14px] font-semibold text-text-secondary">{n}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold text-text-primary">Étape {n} — {STEP_LABELS[n]}</span>
                  <span className="block text-[13.5px] text-text-secondary">{n === 1 ? (lgo ? `Logiciel : ${methods.lgo?.label ?? lgo}` : "LGPI, Winpharma, Smart Rx…") : n === 2 ? "Fichier ou PharmaBoost Connect" : "Connexion, stock reçu, ventes"}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}

function MethodTile({
  icon: Icon,
  title,
  subtitle,
  badge,
  tone,
  selected = false,
  disabled = false,
  onClick,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  badge: string;
  tone: "success" | "info" | "warning" | "neutral";
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className={cn("rounded-2xl border transition-colors", selected ? "border-brand-400 bg-brand-50/30 dark:bg-brand-950/20" : "border-border-default", disabled && "opacity-70")}>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={disabled ? undefined : selected}
        onClick={onClick}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-4 py-4 text-left focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none disabled:cursor-not-allowed sm:flex-nowrap sm:px-5"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-text-secondary">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 basis-44">
          <span className="block text-[17px] leading-6 font-semibold text-text-primary">{title}</span>
          <span className="block text-[13.5px] leading-5 text-text-secondary">{subtitle}</span>
        </span>
        <Badge tone={tone}>{badge}</Badge>
      </button>
      {selected && children && <div className="space-y-4 border-t border-border-subtle px-5 py-4">{children}</div>}
    </div>
  );
}

function DeviceButton({ icon: Icon, title, subtitle, selected, onClick }: { icon: LucideIcon; title: string; subtitle: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn("flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none", selected ? "border-success-600 bg-success-50 dark:bg-success-950/30" : "border-border-default hover:border-brand-400")}
    >
      <Icon className="size-5 shrink-0 text-text-secondary" aria-hidden="true" />
      <span>
        <span className="block text-[15px] font-semibold text-text-primary">{title}</span>
        <span className="block text-[12.5px] text-text-secondary">{subtitle}</span>
      </span>
    </button>
  );
}

function MiniStep({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 rounded-xl bg-surface-sunken/60 px-3.5 py-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[12px] font-semibold text-white">{n}</span>
      <span className="leading-5">{children}</span>
    </li>
  );
}
