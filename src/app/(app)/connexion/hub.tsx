"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AppWindow, ArrowRight, Boxes, Bot, ChevronDown, Plug, ShieldCheck, ShoppingCart } from "lucide-react";
import type { OverviewSnapshot } from "@/server/actions/stock-sync";
import { connectionMethods } from "@/core/stock/connection-overview";
import { describeRobot, resolveRobotIntegration, type RobotSetup } from "@/core/robot/integration";
import { lgoLabel, type LgoDefinition } from "@/core/stock/connectors";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ConnectSteps, STEP_LABELS, type Step } from "./assistant";
import { ConnectionTestPanel, useConnectionTest } from "./connection-test";
import { HelpTip } from "./help-tip";
import { RobotCard } from "./robot-card";
import { HeadlineBar, StatusTile } from "./status";
import { useLiveSnapshot } from "./use-live-snapshot";

/**
 * « Ma connexion » : tout au même endroit.
 *
 *   • l'état en cinq lignes — le logiciel, PharmaBoost Connect, le stock, les ventes, le robot —,
 *     chacune avec sa couleur, sa phrase et son seul geste ;
 *   • « Tester ma connexion », qui contrôle chaque point pour de vrai ;
 *   • le parcours guidé en trois étapes, ouvert quand il reste quelque chose à faire ;
 *   • « Connecter mon robot », qui prépare l'intégration sans rien simuler.
 *
 * Les trois premières questions (Connect, stock, ventes) restent SÉPARÉES : un stock peut être à jour
 * sans programme installé, un programme peut être en ligne sans stock. Tout vient d'une seule fonction
 * (`buildConnectionOverview`), la même que lisent la page Stock et l'accueil.
 */

function scrollTo(element: HTMLElement | null) {
  if (!element) return;
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

function Fact({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "warning" }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 rounded-lg px-2.5 py-1 text-[13px]", tone === "warning" ? "bg-warning-50 text-warning-800 dark:bg-warning-950/30 dark:text-warning-400" : "bg-surface-sunken text-text-secondary")}>
      <span>{label}</span>
      <strong className="font-semibold text-text-primary">{value}</strong>
    </span>
  );
}

export function ConnectionHub({ lgos, initial, serverUrl, robot, continueHref }: { lgos: LgoDefinition[]; initial: OverviewSnapshot; serverUrl: string; robot: RobotSetup | null; continueHref?: string }) {
  const { snapshot, refresh } = useLiveSnapshot(initial);
  const test = useConnectionTest();
  const { overview, lgo } = snapshot;
  const [step, setStep] = useState<Step>(initial.lgo ? initial.overview.headline.step : 1);
  const [guideOpen, setGuideOpen] = useState(!initial.lgo || initial.overview.headline.tone !== "success");
  const guideRef = useRef<HTMLDivElement>(null);
  const testRef = useRef<HTMLDivElement>(null);
  const robotRef = useRef<HTMLDivElement>(null);

  const methods = connectionMethods(lgo);
  const headline = overview.headline;
  const postsOnline = overview.agent.items.filter((item) => item.kind === "post" && item.online).length;
  const robotIntegration = resolveRobotIntegration(robot?.manufacturer, lgo);

  const openStep = (target: Step) => {
    const next = !lgo && target > 1 ? 1 : target;
    setStep(next);
    setGuideOpen(true);
    // Laisser le panneau s'ouvrir avant de faire défiler jusqu'à lui.
    requestAnimationFrame(() => scrollTo(guideRef.current));
  };
  const runTest = () => {
    test.run();
    requestAnimationFrame(() => scrollTo(testRef.current));
  };

  const step3: ReactNode = (
    <div className="space-y-4">
      <h3 className="text-[22px] leading-7 font-semibold tracking-[-0.01em] text-text-primary">Tout fonctionne-t-il ?</h3>
      <p className="text-[14px] leading-6 text-text-secondary">PharmaBoost contrôle votre logiciel, PharmaBoost Connect, votre stock et vos ventes, et vous dit quoi corriger.</p>
      <Button size="xl" className="w-full" onClick={runTest} leadingIcon={<ShieldCheck className="size-5" />}>
        Tester ma connexion
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
        <Button variant="ghost" onClick={() => setStep(2)}>Retour</Button>
        {continueHref && overview.stock.state !== "NONE" && (
          <Button asChild trailingIcon={<ArrowRight className="size-4" />}><Link href={continueHref}>Continuer</Link></Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <HeadlineBar
        tone={headline.tone}
        title={headline.title}
        detail={headline.detail}
        action={headline.action ? <Button onClick={() => openStep(headline.step)} trailingIcon={<ArrowRight className="size-4" />}>{headline.action}</Button> : undefined}
      />

      <section aria-label="L'état de ma connexion" className="space-y-3">
        <StatusTile
          icon={AppWindow}
          label="Mon logiciel"
          tone="neutral"
          title={lgo ? (methods.lgo?.id === "autre" ? "Autre logiciel" : lgoLabel(lgo)) : "Pas encore choisi"}
          detail={lgo ? (methods.connect.tested ? "L'export du stock a été essayé avec un vrai fichier de ce logiciel." : "L'export du stock de ce logiciel n'a pas encore été essayé : un fichier fonctionne.") : "Dites-nous quel logiciel vous utilisez : PharmaBoost adapte ses explications."}
          action={<Button size="sm" variant="outline" onClick={() => openStep(1)}>{lgo ? "Changer" : "Choisir"}</Button>}
        />

        <StatusTile
          icon={Plug}
          label="PharmaBoost Connect"
          help={<HelpTip label="PharmaBoost Connect">Un petit programme à installer sur un ordinateur de la pharmacie : il envoie votre stock quand un fichier est enregistré et suit les boîtes bipées. « En ligne » veut dire un signe de vie depuis moins de 10 minutes. Il est facultatif : un fichier suffit pour le stock.</HelpTip>}
          tone={overview.agent.tone}
          title={overview.agent.title}
          detail={overview.agent.detail}
          action={
            <Button size="sm" variant="outline" onClick={() => openStep(2)}>
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
                  {item.version && <span className="text-text-tertiary">· version {item.version}</span>}
                </li>
              ))}
            </ul>
          )}
        </StatusTile>

        <StatusTile
          icon={Boxes}
          label="Mon stock"
          help={<HelpTip label="le stock">PharmaBoost ne conseille que ce que vous avez en rayon. Un stock est à jour s&apos;il date de moins de 3 jours. Il peut arriver par un fichier envoyé à la main : aucun programme n&apos;est nécessaire.</HelpTip>}
          tone={overview.stock.tone}
          title={overview.stock.title}
          detail={overview.stock.detail}
          action={
            <Button asChild size="sm" variant={overview.stock.state === "FRESH" ? "outline" : "primary"}>
              <Link href="/stock/mise-a-jour">{overview.stock.state === "NONE" ? "Envoyer mon stock" : "Mettre à jour"}</Link>
            </Button>
          }
        >
          {overview.stock.state !== "NONE" && (
            <div className="flex flex-wrap gap-2 pt-1">
              {overview.stock.references !== null && <Fact label="Références en stock" value={overview.stock.references.toLocaleString("fr-FR")} />}
              {overview.stock.lines !== null && <Fact label="Lignes du fichier" value={overview.stock.lines.toLocaleString("fr-FR")} />}
              {overview.stock.ignored !== null && overview.stock.ignored > 0 && <Fact label="Lignes illisibles" value={overview.stock.ignored.toLocaleString("fr-FR")} tone="warning" />}
            </div>
          )}
          {overview.stock.problem && <p className="rounded-lg bg-warning-50 px-3 py-2 text-[13.5px] leading-5 text-text-primary dark:bg-warning-950/30">{overview.stock.problem}</p>}
          {overview.agent.state === "ONLINE" && lgo && <p className="text-[12.5px] leading-5 text-text-tertiary">{methods.connect.note}</p>}
        </StatusTile>

        <StatusTile
          icon={ShoppingCart}
          label="Mes ventes"
          help={<HelpTip label="les ventes">Les ventes sont suivies quand un poste de comptoir relié reçoit le bip de la douchette. Lire les ventes de votre logiciel en direct n&apos;est pas disponible.</HelpTip>}
          tone={overview.sales.tone}
          title={overview.sales.title}
          detail={overview.sales.detail}
          action={overview.sales.state === "NO_POST" ? <Button size="sm" variant="outline" onClick={() => openStep(2)}>Ajouter un poste</Button> : undefined}
        />

        <StatusTile
          icon={Bot}
          label="Mon robot"
          tone="neutral"
          title={robot ? (describeRobot(robot) ?? "Robot") : "Aucun robot renseigné"}
          detail={robot ? `${robotIntegration.label} : rien n'est encore lu du robot.` : "Facultatif. Si vous avez un robot, désignez-le : l'intégration est en préparation."}
          action={
            <Button size="sm" variant="outline" onClick={() => scrollTo(robotRef.current)}>
              {robot ? "Voir" : "Renseigner"}
            </Button>
          }
        >
          <Badge tone="info">{robotIntegration.label}</Badge>
        </StatusTile>
      </section>

      <div ref={testRef} className="scroll-mt-4">
        <ConnectionTestPanel result={test.result} running={test.running} canTestScan={overview.sales.state === "FOLLOWED"} scanCount={overview.sales.scanCount} onRun={runTest} />
      </div>

      <div ref={guideRef} className="scroll-mt-4 space-y-3">
        <button
          type="button"
          aria-expanded={guideOpen}
          aria-controls="parcours"
          onClick={() => setGuideOpen((open) => !open)}
          className="flex w-full items-center gap-4 rounded-2xl border border-border-subtle bg-surface-card px-5 py-4 text-left transition-colors hover:bg-surface-sunken/60 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[18px] leading-6 font-semibold text-text-primary">Connecter ma pharmacie, en 3 étapes</span>
            <span className="block text-[13.5px] leading-5 text-text-secondary">
              {guideOpen ? `Étape ${step} sur 3 : ${STEP_LABELS[step]}` : headline.tone === "success" ? "Tout est en place. Rouvrez le parcours pour changer de logiciel ou ajouter un poste." : "Un geste à la fois, avec l'aide pour chaque étape."}
            </span>
          </span>
          <ChevronDown className={cn("size-5 shrink-0 text-text-tertiary transition-transform", guideOpen && "rotate-180")} aria-hidden="true" />
        </button>
        {guideOpen && (
          <div id="parcours">
            <ConnectSteps lgos={lgos} snapshot={snapshot} serverUrl={serverUrl} step={step} onStep={setStep} continueHref={continueHref} step3={step3} onChanged={() => void refresh()} />
          </div>
        )}
      </div>

      <div ref={robotRef} className="scroll-mt-4">
        <RobotCard setup={robot} lgo={lgo} postsOnline={postsOnline} onChangeLgo={() => openStep(1)} />
      </div>
    </div>
  );
}
