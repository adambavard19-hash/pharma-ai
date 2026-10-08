"use client";

import { useRef, useState, useTransition } from "react";
import { Download, Monitor } from "lucide-react";
import { revokePostAction, type OverviewSnapshot } from "@/server/actions/stock-sync";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";
import { Alert } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { BIG_BUTTON, SetupCard } from "./setup-card";

/**
 * Étape 1 — « Installer sur mes comptoirs ».
 *
 * Un seul bouton : « Télécharger PharmaBoost ». Il télécharge l'installateur Windows, que la personne ouvre sur
 * le comptoir ; au premier lancement, le poste s'associe tout seul à son officine (un jeton à usage unique, porté
 * par le nom du fichier). Aucun lien n'est montré. Les comptoirs apparaissent dans la petite liste quand ils se
 * sont réellement présentés : « Connecté » demande un appairage ET un signe de vie récent — jamais avant.
 *
 * Si l'installateur n'est pas disponible et vérifié, il n'y a pas de bouton : on le dit, on ne le simule pas.
 */

type Counter = OverviewSnapshot["overview"]["counters"][number];

const COOLDOWN_MS = 4000;

export function CountersStep({ counters, installerAvailable, onChanged }: { counters: Counter[]; installerAvailable: boolean; onChanged: () => void }) {
  const [started, setStarted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { push } = useToast();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const listed = counters.filter((counter) => counter.state === "CONNECTED" || counter.state === "OFFLINE");
  const waiting = counters.filter((counter) => counter.state === "TO_INSTALL").length;
  const connected = listed.filter((counter) => counter.state === "CONNECTED").length;

  const remove = (postId: string) =>
    start(async () => {
      const result = await revokePostAction({ postId });
      setRemoving(null);
      if (!result.ok) return push({ tone: "error", title: result.error });
      push({ tone: "success", title: result.message ?? "Comptoir retiré." });
      onChanged();
    });

  return (
    <SetupCard icon={Monitor} title="1. Installer sur mes comptoirs" badge={connected > 0 ? <Badge tone="success">{connected} connecté{connected > 1 ? "s" : ""}</Badge> : undefined}>
      <p className="text-[15px] leading-6 text-text-secondary">Téléchargez PharmaBoost sur chaque ordinateur Windows de votre pharmacie, puis ouvrez le fichier.</p>

      {listed.length > 0 && (
        <ul aria-label="Mes comptoirs" className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface-sunken/60">
          {listed.map((counter) => (
            <li key={counter.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block text-[16px] leading-6 font-medium text-text-primary">{counter.label}</span>
                  <span className="block text-[12.5px] leading-5 text-text-secondary">{counter.detail}</span>
                </span>
                <Badge tone={counter.state === "CONNECTED" ? "success" : "warning"}>{counter.title}</Badge>
                {removing !== counter.id && (
                  <button type="button" onClick={() => setRemoving(counter.id)} className="rounded-md px-1 text-[12.5px] font-medium text-text-secondary underline underline-offset-2 hover:text-danger-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none">
                    Retirer
                  </button>
                )}
              </div>
              {removing === counter.id && (
                <div role="alert" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-warning-50/70 px-3 py-2 text-[13.5px] leading-5 text-text-primary dark:bg-warning-950/30">
                  <span className="min-w-0 flex-1 basis-48">Retirer {counter.label} ? Cet ordinateur ne pourra plus utiliser PharmaBoost.</span>
                  <Button size="sm" variant="danger" loading={pending} onClick={() => remove(counter.id)}>Retirer</Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => setRemoving(null)}>Annuler</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {installerAvailable ? (
        <form
          method="post"
          action="/api/connexion/installateur"
          onSubmit={() => {
            // Le fichier arrive en pièce jointe : la page reste là. On empêche le double clic, puis on relit l'état.
            setStarted(true);
            setLocked(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => {
              setLocked(false);
              onChanged();
            }, COOLDOWN_MS);
          }}
        >
          <Button type="submit" size="xl" className={BIG_BUTTON} disabled={locked} leadingIcon={<Download className="size-5" />}>
            Télécharger PharmaBoost
          </Button>
        </form>
      ) : (
        <Alert tone="warning" title="Téléchargement indisponible pour le moment">
          Le fichier d&apos;installation n&apos;est pas prêt sur cette version de PharmaBoost. Écrivez-nous à {PUBLIC_CONTACT_EMAIL} : nous vous rappelons.
        </Alert>
      )}

      <div role="status" aria-live="polite" className="space-y-1.5 text-[13.5px] leading-5">
        {started && <p className="font-medium text-text-primary">Téléchargement lancé. Ouvrez le fichier sur ce comptoir : il s&apos;associe tout seul à votre officine et apparaît ici.</p>}
        {waiting > 0 && <p className="text-text-secondary">{waiting} installation{waiting > 1 ? "s" : ""} en attente : ouvrez le fichier téléchargé sur le comptoir concerné.</p>}
        {installerAvailable && <p className="text-text-secondary">Windows 10 ou 11. Si Windows demande confirmation : « Informations complémentaires », puis « Exécuter quand même ».</p>}
      </div>
    </SetupCard>
  );
}
