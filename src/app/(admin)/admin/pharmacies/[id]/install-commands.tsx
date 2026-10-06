"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Monitor, Server } from "lucide-react";
import { prepareInstallationAction, preparePostInstallAction } from "@/server/actions/admin-install";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatDateTime, formatTime } from "@/lib/format";

type Prepared = { command: string; expiresAt: string };
type ServerPrepared = Prepared & { baseline: string | null };
type PostPrepared = Prepared & { postId: string };

/** Les deux gestes de l'équipe sous AnyDesk : la ligne du serveur, la ligne d'un poste. Chaque ligne se copie d'un clic. */
export function InstallCommands({
  pharmacyId,
  lgos,
  defaultLgo,
  serverPairedAt,
  unusedServerCode,
  linkedPostIds,
}: {
  pharmacyId: string;
  lgos: { id: string; label: string }[];
  defaultLgo: string;
  /** Quand le serveur s'est relié (ISO), ou `null` : sert à reconnaître qu'il vient de le faire. */
  serverPairedAt: string | null;
  /** Un code a été émis pour le serveur, il n'a pas servi et vaut encore : la ligne existe, mais elle n'est lisible que là où elle a été demandée. */
  unusedServerCode: boolean;
  linkedPostIds: string[];
}) {
  const [lgo, setLgo] = useState(defaultLgo);
  const [label, setLabel] = useState("");
  const [server, setServer] = useState<ServerPrepared | null>(null);
  const [post, setPost] = useState<PostPrepared | null>(null);
  const [copied, setCopied] = useState<"server" | "post" | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"server" | "post" | null>(null);
  const router = useRouter();
  const { push } = useToast();

  // Le serveur est relié dès que sa date d'appairage change ; un poste, dès qu'il figure parmi les reliés.
  const serverDone = server !== null && serverPairedAt !== server.baseline;
  const postDone = post !== null && linkedPostIds.includes(post.postId);
  const waiting = (server !== null && !serverDone) || (post !== null && !postDone);

  // Tant qu'une installation est attendue, la fiche se rafraîchit seule : l'équipe voit « relié » sans recharger.
  // Au bout d'une heure sans nouvelle, elle s'arrête (un rechargement de la page suffit alors).
  useEffect(() => {
    if (!waiting) return;
    const stopAt = Date.now() + 60 * 60 * 1000;
    const timer = setInterval(() => (Date.now() > stopAt ? clearInterval(timer) : router.refresh()), 10_000);
    return () => clearInterval(timer);
  }, [waiting, router]);

  const prepareServer = () => {
    setBusy("server");
    start(async () => {
      const result = await prepareInstallationAction({ pharmacyId, lgo });
      setBusy(null);
      if (!result.ok) return push({ tone: "error", title: result.error });
      setServer({ command: result.data.serverCommand, expiresAt: result.data.serverCodeExpiresAt, baseline: serverPairedAt });
      setCopied(null);
    });
  };

  const preparePost = () => {
    setBusy("post");
    start(async () => {
      const result = await preparePostInstallAction({ pharmacyId, label: label.trim() || null });
      setBusy(null);
      if (!result.ok) return push({ tone: "error", title: result.error });
      setPost({ command: result.data.postCommand, expiresAt: result.data.expiresAt, postId: result.data.postId });
      setLabel("");
      setCopied(null);
    });
  };

  const copy = async (which: "server" | "post", command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(which);
      setTimeout(() => setCopied((current) => (current === which ? null : current)), 2500);
    } catch {
      // Le presse-papiers peut être refusé (AnyDesk, page non sécurisée) : un clic sur la ligne la sélectionne.
      push({ tone: "error", title: "Copie impossible. Cliquez sur la ligne pour la sélectionner, puis Ctrl+C." });
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Logiciel de l'officine" htmlFor="install-lgo" className="w-56">
            <Select id="install-lgo" value={lgo} onChange={(event) => setLgo(event.target.value)}>
              {lgos.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button leadingIcon={<Server className="size-4" />} loading={pending && busy === "server"} disabled={pending} onClick={prepareServer}>
            Préparer l&apos;installation du serveur
          </Button>
        </div>
        {/* Après un rechargement, la ligne n'existe plus à l'écran (le code n'est gardé nulle part) : on le dit, au lieu de laisser croire qu'on peut la recopier. */}
        {!server && unusedServerCode && (
          <p className="text-[12.5px] leading-5 text-text-secondary">Une ligne a été préparée mais n&apos;est plus affichée : cliquez de nouveau sur Préparer l&apos;installation du serveur.</p>
        )}
        {server && (
          <CommandBox
            title="Sur le serveur, collez cette ligne"
            command={server.command}
            validity={`Valable 1 heure, jusqu'à ${formatTime(new Date(server.expiresAt))}.`}
            steps={["Ouvrez PowerShell en administrateur sur le serveur (clic droit sur le bouton Windows).", "Collez la ligne, puis Entrée.", "Attendez « Installation terminée » en vert : 1 à 3 minutes."]}
            copied={copied === "server"}
            onCopy={() => copy("server", server.command)}
            done={serverDone ? "Le serveur vient de se relier : l'installation est terminée." : null}
          />
        )}
      </div>

      <div className="space-y-3 border-t border-border-subtle pt-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Nom du poste" htmlFor="install-post-label" hint="Facultatif, par exemple Comptoir 1." className="w-56">
            <Input id="install-post-label" value={label} maxLength={60} onChange={(event) => setLabel(event.target.value)} placeholder="Comptoir 1" />
          </Field>
          <Button variant="outline" leadingIcon={<Monitor className="size-4" />} loading={pending && busy === "post"} disabled={pending} onClick={preparePost}>
            Ajouter un poste
          </Button>
        </div>
        {post && (
          <CommandBox
            title="Sur le poste, collez cette ligne"
            command={post.command}
            validity={`Valable 7 jours, jusqu'au ${formatDateTime(new Date(post.expiresAt))}. Un seul poste.`}
            steps={["Sur le poste, dans la session de la personne qui utilise le logiciel, ouvrez PowerShell.", "Collez la ligne, puis Entrée.", "Attendez « Le poste est relié » : 1 à 2 minutes."]}
            copied={copied === "post"}
            onCopy={() => copy("post", post.command)}
            done={postDone ? "Le poste vient de se relier : l'installation est terminée." : null}
          />
        )}
      </div>
    </div>
  );
}

/** Une ligne à copier, en grand, avec ses trois étapes. Un clic dessus la sélectionne en entier. */
export function CommandBox({ title, command, validity, steps, copied, onCopy, done }: { title: string; command: string; validity: string; steps: string[]; copied: boolean; onCopy: () => void; done: ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-800 dark:bg-brand-950/30">
      <p className="text-[14px] font-semibold text-text-primary">{title}</p>
      <pre aria-label="Ligne à copier" className="rounded-lg bg-ink-950 px-3.5 py-3 font-mono text-[13px] leading-5 break-all whitespace-pre-wrap text-white select-all">{command}</pre>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" leadingIcon={copied ? <Check className="size-4" /> : <Copy className="size-4" />} onClick={onCopy}>
          {copied ? "Copié" : "Copier la ligne"}
        </Button>
        <span className="text-[12.5px] text-text-secondary">{validity}</span>
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-[13.5px] leading-5 text-text-primary">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {done && (
        <p role="status" className="flex items-center gap-1.5 text-[13.5px] font-medium text-success-700 dark:text-success-500">
          <Check className="size-4" aria-hidden="true" />
          {done}
        </p>
      )}
    </div>
  );
}
