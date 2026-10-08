"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Check, Copy, Mail, Server } from "lucide-react";
import { createPairingAction, emailInstallInstructionsAction } from "@/server/actions/stock-sync";
import { buildServerInstallCommand } from "@/core/stock/install";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";

/**
 * L'installation du SERVEUR de l'officine (le dossier où l'on enregistre le stock), côté diagnostic technique :
 * un code, à donner à qui installe — l'installation demande un accès administrateur, elle se fait encore avec une
 * ligne de commande. L'installation d'un comptoir, elle, est l'étape 1 de la page (`counters-step.tsx`).
 */

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  return {
    copied,
    copy: async (key: string, text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Le presse-papiers peut être refusé (AnyDesk, page non sécurisée) : le texte reste à l'écran.
      }
      setCopied(key);
      setTimeout(() => setCopied((current) => (current === key ? null : current)), 2500);
    },
  };
}

function CopyButton({ copied, id, onCopy, children }: { copied: string | null; id: string; onCopy: () => void; children: ReactNode }) {
  return (
    <Button size="sm" variant="outline" leadingIcon={copied === id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} onClick={onCopy}>
      {copied === id ? "Copié" : children}
    </Button>
  );
}

/** Le serveur de l'officine : un code, à donner à qui l'installe. */
export function ServerInstallFlow({ lgo, serverUrl, onCreated }: { lgo: string; serverUrl: string; onCreated?: () => void }) {
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [pending, start] = useTransition();
  const [mailing, startMail] = useTransition();
  const { push } = useToast();
  const { copied, copy } = useCopy();

  const generate = () =>
    start(async () => {
      const result = await createPairingAction({ lgo });
      if (!result.ok) return push({ tone: "error", title: result.error });
      setCode(result.data);
      onCreated?.();
    });

  const command = code ? buildServerInstallCommand(serverUrl, code.code) : null;

  return (
    <div className="space-y-4">
      <p className="text-[13.5px] leading-5 text-text-secondary">
        L&apos;installation sur le serveur demande un accès administrateur : le plus simple est de transmettre le code à votre informaticien ou à votre conseiller PharmaBoost.
      </p>
      <Button size="lg" loading={pending} leadingIcon={<Server className="size-[18px]" />} onClick={generate}>
        {code ? "Générer un nouveau code" : "Obtenir mon code d'installation"}
      </Button>

      {code && command && (
        <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-800 dark:bg-brand-950/30">
          <p className="text-center text-[40px] font-semibold tracking-[0.3em] text-brand-700 tabular dark:text-brand-400">{code.code}</p>
          <p className="text-center text-[12.5px] text-text-secondary">Valable jusqu&apos;au {formatDateTime(new Date(code.expiresAt))} · ne sert qu&apos;une fois</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              size="sm"
              loading={mailing}
              leadingIcon={<Mail className="size-3.5" />}
              onClick={() =>
                startMail(async () => {
                  const result = await emailInstallInstructionsAction({ lgo, code: code.code, serverUrl });
                  push({ tone: result.ok ? "success" : "error", title: result.ok ? "Instructions envoyées à votre adresse." : result.error });
                })
              }
            >
              M&apos;envoyer les instructions par e-mail
            </Button>
            <CopyButton copied={copied} id="code" onCopy={() => copy("code", code.code)}>Copier le code</CopyButton>
          </div>
          <details className="rounded-lg border border-border-subtle bg-surface-card px-3.5 py-2.5">
            <summary className="cursor-pointer text-[13px] font-medium text-text-secondary">Pour l&apos;informaticien : la ligne de commande</summary>
            <div className="mt-3 space-y-2 text-[13px] leading-5 text-text-secondary">
              <p>Sur le serveur, ouvrez PowerShell en administrateur (clic droit sur le bouton Windows), collez la ligne, puis Entrée :</p>
              <pre className="overflow-x-auto rounded-lg bg-ink-950 px-3 py-2.5 font-mono text-[12.5px] text-white">{command}</pre>
              <CopyButton copied={copied} id="line" onCopy={() => copy("line", command)}>Copier la ligne</CopyButton>
              <p>
                Elle crée le dossier d&apos;export, installe Node.js s&apos;il manque et lance le programme au démarrage du serveur. Sans accès Internet sur le serveur : <a href="/api/agent/telecharger" className="font-medium text-brand-700 underline dark:text-brand-400">l&apos;archive à décompresser</a>, puis{" "}
                <code className="rounded bg-surface-sunken px-1 font-mono text-[12px]">{`.\\install-windows.ps1 -Code ${code.code} -Lgo ${lgo}`}</code>.
              </p>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
