"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, CircleAlert, Info, Loader2, ScanBarcode, ShieldCheck, XCircle } from "lucide-react";
import { adminScanCountAction, adminTestConnectionAction, type AdminConnectionTest } from "@/server/actions/admin-connection";
import { GROUP_LABELS, type CheckGroup, type CheckStatus } from "@/core/stock/connection-test";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TONE_STYLES } from "@/app/(app)/connexion/status";

/**
 * « Tester ma connexion » : un bouton, des contrôles réels, une phrase par contrôle — ce qui a été
 * constaté, et quoi faire si ce n'est pas bon. Le test lit ce que les programmes ont envoyé à
 * PharmaBoost ; il le dit en bas, il ne se connecte à aucun ordinateur.
 *
 * L'essai du bip est le seul contrôle qui demande un geste : on bipe une boîte, et la page attend
 * que PharmaBoost la reçoive. C'est la preuve que le suivi des ventes marche, pas une supposition.
 */

const STATUS: Record<CheckStatus, { Icon: typeof CheckCircle2; className: string; label: string }> = {
  ok: { Icon: CheckCircle2, className: "text-success-600 dark:text-success-500", label: "Réussi" },
  warn: { Icon: AlertTriangle, className: "text-warning-600 dark:text-warning-500", label: "À regarder" },
  fail: { Icon: XCircle, className: "text-danger-600 dark:text-danger-500", label: "Erreur" },
  info: { Icon: Info, className: "text-text-tertiary", label: "Information" },
};

const GROUP_ORDER: CheckGroup[] = ["software", "connect", "stock", "sales", "robot"];
const BIP_POLL_MS = 3_000;
const BIP_WAIT_MS = 90_000;

export function AssistanceTest({ pharmacyId, salesFollowed, scanCount }: { pharmacyId: string; salesFollowed: boolean; scanCount: number }) {
  const { result, running, run: onRun } = useAssistanceTest(pharmacyId);
  const canTestScan = salesFollowed;
  const tone = result ? TONE_STYLES[result.tone] : null;
  return (
    <section aria-label="Tester ma connexion" className="space-y-4 rounded-2xl border border-border-subtle bg-surface-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface-sunken">
          <ShieldCheck className="size-5 text-text-secondary" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] leading-6 font-semibold text-text-primary">Test de connexion</h2>
          <p className="text-[13.5px] leading-5 text-text-secondary">Contrôle chaque point à partir de ce que les programmes de l&apos;officine ont envoyé, et dit quoi corriger.</p>
        </div>
        <Button size="lg" loading={running} onClick={onRun} leadingIcon={!running ? <ShieldCheck className="size-[18px]" /> : undefined}>
          {result ? "Relancer le test" : "Lancer le test"}
        </Button>
      </div>

      {result && tone && (
        <div className="space-y-4" aria-live="polite">
          <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3", tone.box)}>
            <tone.Icon className={cn("mt-0.5 size-5 shrink-0", tone.text)} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[16px] leading-6 font-semibold text-text-primary">{result.title}</p>
              <p className="text-[13.5px] leading-5 text-text-secondary">{result.detail}</p>
            </div>
          </div>

          <div className="space-y-3">
            {GROUP_ORDER.map((group) => {
              const checks = result.checks.filter((check) => check.group === group);
              if (checks.length === 0) return null;
              return (
                <div key={group}>
                  <p className="mb-1.5 text-[12px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">{GROUP_LABELS[group]}</p>
                  <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
                    {checks.map((check) => {
                      const look = STATUS[check.status];
                      return (
                        <li key={check.id} className="flex items-start gap-3 px-4 py-3">
                          <look.Icon className={cn("mt-0.5 size-[18px] shrink-0", look.className)} aria-hidden="true" />
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="text-[14px] leading-5 font-medium text-text-primary">
                              {check.title}
                              <span className="sr-only"> : {look.label}</span>
                            </p>
                            <p className="text-[13.5px] leading-5 text-text-secondary">{check.detail}</p>
                            {check.fix && check.status !== "ok" && (
                              <p className="flex items-start gap-1.5 text-[13.5px] leading-5 text-text-primary">
                                <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-brand-600" aria-hidden="true" />
                                <span>{check.fix}</span>
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>

          {canTestScan && <ScanTrial pharmacyId={pharmacyId} initialCount={scanCount} />}

          <p className="text-[12.5px] leading-5 text-text-tertiary">
            Test du {formatDateTime(new Date(result.at))}. {result.limits}
          </p>
        </div>
      )}
    </section>
  );
}

/** L'essai du bip : on bipe une boîte au comptoir, PharmaBoost dit s'il l'a reçue. */
function ScanTrial({ pharmacyId, initialCount }: { pharmacyId: string; initialCount: number }) {
  const [phase, setPhase] = useState<"idle" | "waiting" | "received" | "missed">("idle");
  const baseline = useRef(initialCount);
  const timers = useRef<{ poll?: ReturnType<typeof setInterval>; stop?: ReturnType<typeof setTimeout> }>({});

  const clear = () => {
    clearInterval(timers.current.poll);
    clearTimeout(timers.current.stop);
  };
  useEffect(() => clear, []);

  const start = async () => {
    clear();
    // La référence est lue maintenant : seul un bip POSTÉRIEUR au clic compte.
    const first = await adminScanCountAction({ pharmacyId });
    baseline.current = first.ok ? first.data.scanCount : initialCount;
    setPhase("waiting");
    timers.current.poll = setInterval(async () => {
      const next = await adminScanCountAction({ pharmacyId });
      if (next.ok && next.data.scanCount > baseline.current) {
        clear();
        setPhase("received");
      }
    }, BIP_POLL_MS);
    timers.current.stop = setTimeout(() => {
      clear();
      setPhase((current) => (current === "waiting" ? "missed" : current));
    }, BIP_WAIT_MS);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle bg-surface-sunken/50 px-4 py-3" aria-live="polite">
      <ScanBarcode className="size-5 shrink-0 text-text-secondary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-text-primary">Essai du bip (facultatif)</p>
        <p className="text-[13.5px] leading-5 text-text-secondary">
          {phase === "idle" && "Faites biper une boîte au comptoir : on vérifie que PharmaBoost la reçoit."}
          {phase === "waiting" && "En attente d'un bip… faites biper une boîte maintenant (90 secondes)."}
          {phase === "received" && "Bip reçu : le suivi des ventes fonctionne."}
          {phase === "missed" && "Aucun bip reçu. Vérifiez que la douchette est branchée sur le poste relié et que l'icône PharmaBoost est visible, puis réessayez."}
        </p>
      </div>
      {phase === "waiting" ? (
        <Loader2 className="size-5 animate-spin text-brand-600" aria-label="En attente" />
      ) : (
        <Button size="sm" variant={phase === "received" ? "outline" : "primary"} onClick={() => void start()}>
          {phase === "idle" ? "Faire l'essai" : "Réessayer"}
        </Button>
      )}
    </div>
  );
}

/** Le test, lancé depuis la fiche : un seul endroit sait le lancer. */
function useAssistanceTest(pharmacyId: string) {
  const [result, setResult] = useState<AdminConnectionTest | null>(null);
  const [running, start] = useTransition();
  const { push } = useToast();
  const run = () =>
    start(async () => {
      try {
        const next = await adminTestConnectionAction({ pharmacyId });
        if (!next.ok) return push({ tone: "error", title: next.error });
        setResult(next.data);
      } catch {
        push({ tone: "error", title: "Le test n'a pas pu se faire. Vérifiez la connexion Internet et réessayez." });
      }
    });
  return { result, running, run };
}
