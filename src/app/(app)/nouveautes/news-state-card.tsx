"use client";

import Link from "next/link";
import { useOptimistic, useTransition, type ReactNode } from "react";
import { Check, Mail } from "lucide-react";
import { setPatientNewsEnabledAction } from "@/server/actions/patient-news";
import { NEWS_RETENTION_MONTHS } from "@/core/patient-news";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { Switch } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatNumber } from "@/lib/format";

/**
 * L'état des nouveautés : combien de patients ont choisi d'être prévenus,
 * l'interrupteur de la proposition, et le parcours du patient dit tel qu'il
 * est. Un nombre, jamais une adresse ni une liste : le titulaire n'a pas à
 * connaître les personnes, seulement leur nombre.
 */
export function NewsStateCard({ enabled, activeCount, messagingLive, isDemo }: { enabled: boolean; activeCount: number; messagingLive: boolean; isDemo: boolean }) {
  // Le réglage s'affiche tout de suite et revient seul à la valeur du serveur si l'enregistrement échoue.
  const [shown, setShown] = useOptimistic(enabled);
  const [pending, start] = useTransition();
  const { push } = useToast();

  const toggle = (next: boolean) =>
    start(async () => {
      setShown(next);
      const result = await setPatientNewsEnabledAction(next);
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré") : result.error });
    });

  return (
    <Card>
      <CardHeader
        title="Vos abonnés"
        description="Les patients qui ont demandé à être prévenus des nouveautés de votre pharmacie."
        action={messagingLive ? <Badge tone="success">Messagerie active</Badge> : <Badge tone="warning">Envoi simulé</Badge>}
      />
      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-8">
        <div className="space-y-5">
          <div>
            <p className="text-[11.5px] font-medium tracking-wide text-text-tertiary uppercase">Abonnés actifs</p>
            <p className="mt-1 text-[34px] leading-none font-semibold text-text-primary tabular">{formatNumber(activeCount)}</p>
            <p className="mt-2 text-[12.5px] leading-5 text-text-secondary">
              {activeCount === 0
                ? "Personne ne s'est abonné pour l'instant. Le lien figure dans l'e-mail du plan : c'est le patient qui décide de cliquer."
                : "Seul le nombre est affiché : vous ne voyez jamais leurs adresses."}
            </p>
          </div>

          <Switch
            id="news-enabled"
            label="Proposer l'abonnement dans l'e-mail du plan"
            description={
              shown
                ? "Un lien facultatif figure dans l'e-mail du plan que reçoit le patient."
                : "Le lien ne figure plus dans l'e-mail du plan, les liens déjà envoyés ne fonctionnent plus et aucune annonce ne peut partir. Vos abonnés actuels restent abonnés."
            }
            checked={shown}
            disabled={pending}
            onChange={(event) => toggle(event.target.checked)}
          />

          {isDemo && (
            <Alert tone="info" title="Officine de démonstration">
              Le lien d&apos;abonnement n&apos;est pas proposé aux patients d&apos;une officine de démonstration : personne ne doit s&apos;abonner à une pharmacie fictive.
            </Alert>
          )}

          {!messagingLive && (
            <Alert
              tone="warning"
              title="La messagerie n'est pas configurée : les envois sont simulés"
              icon={<Mail className="size-[18px]" aria-hidden="true" />}
            >
              Aucun message ne part, ni vers vos abonnés ni vers vous. L&apos;historique le dit, et un envoi simulé ne bloque pas le suivant.{" "}
              <Link href="/parametres?onglet=moteur" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">
                Voir la messagerie
              </Link>
            </Alert>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-[13.5px] font-semibold text-text-primary">Comment le patient s&apos;abonne</h3>
          <ul className="space-y-2.5 text-[13px] leading-5 text-text-secondary">
            <Step>Le patient reçoit l&apos;e-mail de son plan avec, en bas, un lien facultatif pour être prévenu des nouveautés de la pharmacie.</Step>
            <Step>Il n&apos;est abonné que s&apos;il clique sur ce lien, puis confirme. Ouvrir l&apos;e-mail ne suffit pas.</Step>
            <Step>Il se désinscrit en un clic, sans compte, depuis chaque message que vous lui envoyez.</Step>
            <Step>
              Son adresse est chiffrée et conservée {NEWS_RETENTION_MONTHS} mois au plus après son accord, puis supprimée.
            </Step>
            <Step>Elle n&apos;est reliée ni à son plan, ni à son ordonnance, ni à son traitement.</Step>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function Step({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <Check className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}
