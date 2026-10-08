"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Download, Mail, Monitor, RefreshCw, Send } from "lucide-react";
import { createPostInstallLinkAction, emailPostInstallLinkAction, reissuePostInstallLinkAction, type InstallLinkView } from "@/server/actions/stock-sync";
import type { OverviewSnapshot } from "@/server/actions/stock-sync";
import { POST_LINK_VALIDITY_LABEL } from "@/core/stock/install";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BIG_BUTTON, SetupCard } from "./setup-card";

/**
 * Étape 1 — « Installer sur mes comptoirs ».
 *
 * Un seul geste : « Envoyer un lien d'installation ». Il crée « Comptoir N » et son lien ; la personne le copie
 * ou se l'envoie par e-mail, l'ouvre sur l'ordinateur du comptoir et double-clique le fichier. La liste des
 * comptoirs se met à jour toute seule : « À installer » devient « Connecté » seulement quand le poste s'est
 * réellement présenté (association sécurisée par le lien, à usage unique) ET donne signe de vie. Jamais avant.
 */

type Counter = OverviewSnapshot["overview"]["counters"][number];

const BADGE: Record<Counter["state"], { tone: "success" | "warning" | "neutral"; label: string }> = {
  CONNECTED: { tone: "success", label: "Connecté" },
  OFFLINE: { tone: "warning", label: "Ne répond plus" },
  TO_INSTALL: { tone: "neutral", label: "À installer" },
  EXPIRED: { tone: "warning", label: "Lien expiré" },
};

export function CountersStep({ counters, userEmail, onChanged }: { counters: Counter[]; userEmail: string; onChanged: () => void }) {
  const [link, setLink] = useState<InstallLinkView | null>(null);
  const [pending, start] = useTransition();
  const { push } = useToast();
  const connected = counters.filter((counter) => counter.state === "CONNECTED").length;
  // Le lien affiché disparaît tout seul quand son comptoir est connecté : l'installation est faite.
  const shown = link && counters.find((counter) => counter.id === link.postId)?.state !== "CONNECTED" ? link : null;

  const create = () =>
    start(async () => {
      const result = await createPostInstallLinkAction({});
      if (!result.ok) return push({ tone: "error", title: result.error });
      setLink(result.data);
      onChanged();
    });

  const renew = (postId: string) =>
    start(async () => {
      const result = await reissuePostInstallLinkAction({ postId });
      if (!result.ok) return push({ tone: "error", title: result.error });
      setLink(result.data);
      onChanged();
    });

  return (
    <SetupCard icon={Monitor} title="1. Installer sur mes comptoirs" badge={connected > 0 ? <Badge tone="success">{connected} connecté{connected > 1 ? "s" : ""}</Badge> : undefined}>
      <p className="text-[15px] leading-6 text-text-secondary">Envoyez le lien d&apos;installation sur chaque ordinateur Windows de votre pharmacie.</p>

      <ul aria-label="Mes comptoirs" className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface-sunken/60">
        {counters.length === 0 && <li className="px-4 py-3 text-[14px] text-text-secondary">Aucun comptoir pour l&apos;instant.</li>}
        {counters.map((counter) => {
          const badge = BADGE[counter.state];
          const canRenew = counter.state === "TO_INSTALL" || counter.state === "EXPIRED";
          return (
            <li key={counter.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <span className="min-w-0 flex-1 basis-40">
                <span className="block text-[16px] leading-6 font-medium text-text-primary">{counter.label}</span>
                <span className="block text-[12.5px] leading-5 text-text-secondary">{counter.detail}</span>
              </span>
              {canRenew && (
                <button type="button" disabled={pending} onClick={() => renew(counter.id)} className="inline-flex items-center gap-1 rounded-md px-1 text-[13px] font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none disabled:opacity-50 dark:text-brand-400">
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                  Nouveau lien
                </button>
              )}
              <Badge tone={badge.tone}>{badge.label}</Badge>
            </li>
          );
        })}
      </ul>

      <Button size="xl" className={BIG_BUTTON} loading={pending && !shown} onClick={create} leadingIcon={<Send className="size-5" />}>
        Envoyer un lien d&apos;installation
      </Button>

      {shown ? <LinkReady link={shown} userEmail={userEmail} /> : <p className="text-[13.5px] leading-5 text-text-secondary">Par e-mail ou lien à copier. Chaque poste est reconnu séparément.</p>}
    </SetupCard>
  );
}

/** Le lien est prêt : le copier, ou se l'envoyer par e-mail. Rien d'autre à comprendre. */
function LinkReady({ link, userEmail }: { link: InstallLinkView; userEmail: string }) {
  const [copied, setCopied] = useState(false);
  const [mail, setMail] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [sending, startSend] = useTransition();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.downloadUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Le presse-papiers peut être refusé (prise en main à distance) : le lien reste affiché, à sélectionner.
      setCopied(false);
    }
  };

  const send = () =>
    startSend(async () => {
      setMail(null);
      const result = await emailPostInstallLinkAction({ token: link.token });
      setMail(result.ok ? { tone: "success", text: `Lien envoyé à ${result.data.to}.` } : { tone: "error", text: result.error });
    });

  return (
    <div role="status" aria-live="polite" className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-800 dark:bg-brand-950/30">
      <div>
        <p className="text-[16px] leading-6 font-semibold text-text-primary">Installateur prêt pour {link.label}</p>
        <p className="text-[13.5px] leading-5 text-text-secondary">Sur l&apos;ordinateur du comptoir : téléchargez le fichier, puis double-cliquez dessus. L&apos;installation se fait toute seule, et {link.label} passera à « Connecté » ici.</p>
      </div>
      <Button asChild size="lg" className="w-full rounded-full">
        <a href={link.fileUrl} download>
          <Download className="size-5" aria-hidden="true" />
          Télécharger l&apos;installateur
        </a>
      </Button>
      <p className="text-[13px] leading-5 text-text-secondary">Vous n&apos;êtes pas sur cet ordinateur ? Copiez le lien ou recevez-le par e-mail : il ouvre la page où l&apos;on télécharge le fichier.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" className="rounded-full sm:flex-1" onClick={copy} leadingIcon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}>
          {copied ? "Lien copié" : "Copier le lien"}
        </Button>
        <Button variant="outline" className="rounded-full sm:flex-1" loading={sending} onClick={send} leadingIcon={<Mail className="size-4" />}>
          M&apos;envoyer par e-mail
        </Button>
      </div>
      {mail && (
        <p role={mail.tone === "error" ? "alert" : undefined} className={cn("text-[13.5px] leading-5", mail.tone === "error" ? "text-danger-700 dark:text-danger-400" : "text-success-700 dark:text-success-400")}>
          {mail.text}
        </p>
      )}
      <input readOnly value={link.downloadUrl} aria-label="Lien d'installation" onFocus={(event) => event.currentTarget.select()} className="w-full rounded-lg border border-border-subtle bg-surface-card px-3 py-2 font-mono text-[12px] text-text-secondary" />
      <p className="text-[12.5px] leading-5 text-text-tertiary">
        Valable {POST_LINK_VALIDITY_LABEL}, jusqu&apos;au {formatDateTime(new Date(link.expiresAt))}, pour un seul comptoir. Windows 10 ou 11. L&apos;e-mail part à {userEmail}, jamais ailleurs.
      </p>
      <details className="text-[13px]">
        <summary className="cursor-pointer font-medium text-text-secondary">Pour l&apos;assistance</summary>
        <div className="mt-2 space-y-2 leading-5 text-text-secondary">
          <p>Sur le comptoir, dans PowerShell, une ligne installe tout :</p>
          <pre className="overflow-x-auto rounded-lg bg-ink-950 px-3 py-2.5 font-mono text-[12px] text-white">{link.command}</pre>
        </div>
      </details>
    </div>
  );
}
