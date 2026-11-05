"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, CreditCard, Download, FileSignature, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { payMySubscriptionAction, prepareMyContractAction } from "@/server/actions/my-subscription";
import type { SubscriptionSteps } from "@/server/services/subscription-steps";

/**
 * Les trois étapes de l'abonnement, dans l'espace du titulaire (fondateur, 5 nov. 2026) : 1. signer le contrat, 2. payer,
 * 3. recevoir le logiciel. Une étape ne s'ouvre qu'après la précédente ; le logiciel n'arrive qu'une fois le paiement reçu.
 */
export function SubscriptionStepsCard({ steps }: { steps: SubscriptionSteps }) {
  const [error, setError] = useState<string | null>(null);
  const [signingUrl, setSigningUrl] = useState<string | null>(steps.contract.signingUrl);
  const [pending, startTransition] = useTransition();
  const signed = steps.contract.state === "SIGNED";

  const prepare = () =>
    startTransition(async () => {
      const result = await prepareMyContractAction();
      if (!result.ok) return setError(result.error);
      setError(null);
      if (result.data.signingUrl) {
        setSigningUrl(result.data.signingUrl);
        window.open(result.data.signingUrl, "_blank", "noopener");
      }
    });
  const pay = () =>
    startTransition(async () => {
      const result = await payMySubscriptionAction();
      if (!result.ok) return setError(result.error);
      window.location.href = result.data.url;
    });

  return (
    <section aria-labelledby="etapes-abonnement" className="rounded-2xl border border-white/70 bg-white/60 p-5 shadow-[0_12px_32px_-16px_rgba(15,43,38,.22)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
      <h2 id="etapes-abonnement" className="text-[17px] font-semibold text-text-primary">
        Votre abonnement en 3 étapes
      </h2>
      <ol className="mt-4 space-y-3">
        <Step n={1} done={signed} active={!signed} icon={<FileSignature className="size-4" />} title="Signer votre contrat" text={signed ? "Contrat signé." : "Votre contrat, prérempli : relisez-le et signez en ligne."}>
          {!signed &&
            (signingUrl ? (
              <Button asChild size="sm">
                <a href={signingUrl} target="_blank" rel="noreferrer">
                  Signer mon contrat
                </a>
              </Button>
            ) : (
              <Button size="sm" loading={pending} onClick={prepare}>
                Préparer et signer mon contrat
              </Button>
            ))}
        </Step>
        <Step n={2} done={steps.paid} active={signed && !steps.paid} icon={<CreditCard className="size-4" />} title="Régler votre abonnement" text={steps.paid ? "Paiement reçu, merci." : "Prélèvement SEPA ou carte, sur une page de paiement sécurisée."}>
          {signed && !steps.paid && (
            <Button size="sm" loading={pending} onClick={pay}>
              Payer mon abonnement
            </Button>
          )}
        </Step>
        <Step
          n={3}
          done={steps.softwareUnlocked}
          active={steps.paid && !steps.softwareUnlocked}
          icon={steps.softwareUnlocked ? <Download className="size-4" /> : <Lock className="size-4" />}
          title="Installer PharmaBoost"
          text={steps.softwareUnlocked ? "Le logiciel est à vous : Paramètres → Postes du comptoir, ou le lien reçu par e-mail." : "Le logiciel arrive par e-mail dès que le paiement est reçu."}
        >
          {steps.softwareUnlocked && (
            <Button asChild size="sm" variant="outline">
              <a href="/parametres/postes">Installer sur un ordinateur</a>
            </Button>
          )}
        </Step>
      </ol>
      {error && (
        <div className="mt-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
    </section>
  );
}

function Step({ n, done, active, icon, title, text, children }: { n: number; done: boolean; active: boolean; icon: React.ReactNode; title: string; text: string; children?: React.ReactNode }) {
  return (
    <li className={cn("flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3", done ? "border-emerald-200 bg-emerald-50/70 dark:bg-emerald-700/10" : active ? "border-brand-300 bg-white/80 dark:bg-white/5" : "border-border-subtle opacity-70")}>
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold", done ? "bg-emerald-600 text-white" : active ? "bg-brand-700 text-white" : "bg-surface-sunken text-text-tertiary")}>
        {done ? <CheckCircle2 className="size-4" aria-label="fait" /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[14.5px] font-semibold text-text-primary">
          <span className="text-brand-600">{icon}</span>
          {title}
        </p>
        <p className="text-[13px] text-text-secondary">{text}</p>
      </div>
      {children}
    </li>
  );
}
