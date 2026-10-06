"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, MessageCircleQuestion, RotateCcw, ScanLine } from "lucide-react";
import { resetDemoAction, simulateDeliveryStepAction } from "@/server/actions/demo";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type ScenarioCard = {
  id: string;
  title: string;
  situation: string;
  group: "ordonnance" | "chronique" | "sans-ordonnance";
  /** Les boîtes passées à la douchette, dans l'ordre. */
  boxes: string[];
  /** Une demande sans ordonnance : pas de bips, la demande est déjà saisie sur l'écran du comptoir. */
  isRequest: boolean;
  show: string[];
  tip: string;
};

const GROUPS: { key: ScenarioCard["group"]; title: string; hint: string }[] = [
  { key: "ordonnance", title: "Ordonnances", hint: "Des boîtes passées à la caisse." },
  { key: "chronique", title: "Traitements chroniques", hint: "Renouvellements, suivi au long cours." },
  { key: "sans-ordonnance", title: "Sans ordonnance", hint: "Le client décrit ce qu'il ressent." },
];

/** Le temps entre deux bips : celui d'un geste au comptoir, assez lent pour être lu à l'écran. */
const BEEP_GAP_MS = 1300;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Running = { scenario: ScenarioCard; received: string[] };

export function DemoPanel({ scenarios, canReset, hint }: { scenarios: ScenarioCard[]; canReset: boolean; hint: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [running, setRunning] = useState<Running | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const run = async (scenario: ScenarioCard) => {
    if (running) return;
    if (scenario.isRequest) {
      router.push(`/vente/nouvelle?demande=${scenario.id}#demande`);
      return;
    }
    setRunning({ scenario, received: [] });
    for (let step = 0; step < scenario.boxes.length; step += 1) {
      const result = await simulateDeliveryStepAction({ scenarioId: scenario.id, step });
      if (!result.ok) {
        push({ tone: "error", title: result.error });
        setRunning(null);
        return;
      }
      setRunning((current) => (current ? { ...current, received: [...current.received, result.data.drugName] } : current));
      if (result.data.done) {
        await wait(900);
        router.push(`/vente/${result.data.prescriptionId}`);
        return;
      }
      await wait(BEEP_GAP_MS);
    }
  };

  return (
    <div className="space-y-8">
      {GROUPS.map((group) => {
        const items = scenarios.filter((scenario) => scenario.group === group.key);
        if (items.length === 0) return null;
        return (
          <section key={group.key} aria-labelledby={`demo-${group.key}`} className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 id={`demo-${group.key}`} className="text-[15px] font-semibold text-text-primary">{group.title}</h2>
              <p className="text-[12.5px] text-text-tertiary">{group.hint}</p>
            </div>
            <ul className="grid gap-3 md:grid-cols-2">
              {items.map((scenario) => (
                <li key={scenario.id}>
                  <Card className="h-full">
                    <CardContent className="flex h-full flex-col gap-3 p-4">
                      <div className="space-y-1">
                        <h3 className="text-[15px] leading-5 font-semibold text-text-primary">{scenario.title}</h3>
                        <p className="text-[13px] text-text-secondary">{scenario.situation}</p>
                      </div>
                      {scenario.isRequest ? (
                        <p className="flex items-center gap-1.5 text-[12.5px] text-text-tertiary"><MessageCircleQuestion className="size-3.5" aria-hidden="true" /> Demande déjà saisie sur l&apos;écran du comptoir</p>
                      ) : (
                        <ul className="flex flex-wrap gap-1.5" aria-label="Boîtes passées à la caisse">
                          {scenario.boxes.map((box, index) => (
                            <li key={`${box}-${index}`}><Badge tone="neutral">{box}</Badge></li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setOpen(open === scenario.id ? null : scenario.id)}
                          aria-expanded={open === scenario.id}
                          className="inline-flex items-center gap-1 text-[12.5px] text-text-tertiary hover:text-text-secondary"
                        >
                          Voir le déroulé <ChevronDown className={cn("size-3.5 transition-transform", open === scenario.id && "rotate-180")} aria-hidden="true" />
                        </button>
                        <Button size="sm" leadingIcon={<ScanLine className="size-4" />} onClick={() => run(scenario)} disabled={running !== null}>
                          {scenario.isRequest ? "Ouvrir la demande" : "Simuler"}
                        </Button>
                      </div>
                      {open === scenario.id && (
                        <div className="space-y-2 rounded-lg bg-surface-sunken px-3 py-2.5 text-[12.5px] text-text-secondary">
                          <ul className="list-disc space-y-0.5 pl-4">
                            {scenario.show.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                          <p className="text-text-tertiary">{scenario.tip}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {canReset && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-card px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-text-primary">Remettre la démonstration à zéro</p>
            <p className="text-[12.5px] text-text-tertiary">{hint}</p>
          </div>
          <ConfirmAction
            label="Réinitialiser la démo"
            icon={<RotateCcw className="size-3.5" />}
            variant="outline"
            title="Réinitialiser la démonstration ?"
            confirmLabel="Réinitialiser"
            consequences={["Les ventes simulées pendant le rendez-vous sont effacées.", "Le stock, l'équipe et l'historique retrouvent leur état initial, datés d'aujourd'hui.", "Rien de réel n'est touché : seule l'officine de démonstration est concernée."]}
            onConfirm={() => resetDemoAction()}
          />
        </section>
      )}

      {running && (
        <div role="dialog" aria-modal="true" aria-label="Délivrance simulée" className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-border-subtle bg-surface-card p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"><ScanLine className="size-5" aria-hidden="true" /></span>
              <div>
                <p className="text-[15px] font-semibold text-text-primary">Poste de caisse : délivrance en cours</p>
                <p className="text-[12.5px] text-text-tertiary">{running.scenario.title}</p>
              </div>
            </div>
            <ul className="space-y-2" aria-live="polite">
              {running.scenario.boxes.map((box, index) => {
                const received = running.received[index];
                return (
                  <li key={`${box}-${index}`} className={cn("flex items-center gap-2.5 text-[13.5px]", received ? "text-text-primary" : "text-text-tertiary")}>
                    {received ? <Check className="size-4 text-success-600" aria-hidden="true" /> : index === running.received.length ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <span className="size-4" />}
                    <span className="min-w-0 truncate">{received ?? box}</span>
                  </li>
                );
              })}
            </ul>
            <p className="text-[12px] text-text-tertiary">Les boîtes d&apos;une même minute forment une seule ordonnance. L&apos;analyse démarre à l&apos;ouverture de la vente.</p>
          </div>
        </div>
      )}
    </div>
  );
}
