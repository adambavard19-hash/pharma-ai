"use client";

import { useRef, useState, useTransition } from "react";
import { Download, Monitor, Pencil, UserRound } from "lucide-react";
import { revokePostAction, type OverviewSnapshot } from "@/server/actions/stock-sync";
import { assignComptoirAction, renameComptoirAction } from "@/server/actions/comptoirs";
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

export function CountersStep({ counters, installerAvailable, members, assignments, onChanged }: { counters: Counter[]; installerAvailable: boolean; members: { id: string; name: string }[]; assignments: Record<string, string | null>; onChanged: () => void }) {
  const [started, setStarted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [owners, setOwners] = useState(assignments);
  const [names, setNames] = useState<Record<string, string>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const { push } = useToast();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const listed = counters.filter((counter) => counter.state === "CONNECTED" || counter.state === "OFFLINE");
  const waiting = counters.filter((counter) => counter.state === "TO_INSTALL").length;
  const connected = listed.filter((counter) => counter.state === "CONNECTED").length;

  const assign = (postId: string, userId: string | null) => {
    const before = owners[postId] ?? null;
    setOwners((current) => ({ ...current, [postId]: userId }));
    start(async () => {
      const result = await assignComptoirAction({ postId, userId });
      if (!result.ok) {
        setOwners((current) => ({ ...current, [postId]: before }));
        return push({ tone: "error", title: result.error });
      }
      push({ tone: "success", title: result.message ?? "Comptoir attribué." });
    });
  };

  const rename = (postId: string) =>
    start(async () => {
      const result = await renameComptoirAction({ postId, name: draft });
      if (!result.ok) return push({ tone: "error", title: result.error });
      setNames((current) => ({ ...current, [postId]: result.data.name }));
      setRenaming(null);
      push({ tone: "success", title: result.message ?? "Comptoir renommé." });
      onChanged();
    });

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
      <p className="text-[13.5px] leading-5 text-text-secondary">
        Chaque comptoir est un espace à part, attribué à une personne : elle ne voit que les délivrances de son comptoir, et personne ne voit les siennes. Choisissez qui travaille à quel comptoir.
      </p>

      {listed.length > 0 && (
        <ul aria-label="Mes comptoirs" className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface-sunken/60">
          {listed.map((counter) => (
            <li key={counter.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0 flex-1 basis-40">
                  {renaming === counter.id ? (
                    <form
                      className="flex items-center gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        rename(counter.id);
                      }}
                    >
                      <input
                        autoFocus
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        maxLength={40}
                        aria-label="Nom du comptoir"
                        className="h-9 w-44 rounded-md border border-border-default bg-surface-card px-2.5 text-[15px] text-text-primary focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
                      />
                      <Button type="submit" size="sm" loading={pending}>Enregistrer</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>Annuler</Button>
                    </form>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <span className="block text-[16px] leading-6 font-medium text-text-primary">{names[counter.id] ?? counter.label}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(names[counter.id] ?? counter.label);
                          setRenaming(counter.id);
                        }}
                        aria-label={`Renommer ${names[counter.id] ?? counter.label}`}
                        className="rounded-md p-1 text-text-tertiary hover:bg-surface-card hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    </span>
                  )}
                  <span className="block text-[12.5px] leading-5 text-text-secondary">{counter.detail}</span>
                </span>
                <label className="flex items-center gap-1.5 text-[13px] text-text-secondary">
                  <UserRound className="size-4 text-text-tertiary" aria-hidden />
                  <span className="sr-only">Collaborateur de {names[counter.id] ?? counter.label}</span>
                  <select
                    value={owners[counter.id] ?? ""}
                    onChange={(event) => assign(counter.id, event.target.value || null)}
                    disabled={pending}
                    className="h-9 max-w-[11rem] rounded-md border border-border-default bg-surface-card px-2 text-[14px] text-text-primary focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
                  >
                    <option value="">Non attribué</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </label>
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
