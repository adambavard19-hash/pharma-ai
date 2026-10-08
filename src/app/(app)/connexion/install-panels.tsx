"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import { Check, CircleDot, Copy, Download, Mail, MousePointerClick, Server } from "lucide-react";
import { createPairingAction, createPostInstallLinkAction, createPostPairingAction, emailInstallInstructionsAction } from "@/server/actions/stock-sync";
import { buildServerInstallCommand } from "@/core/stock/install";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";

/**
 * Les deux installations de PharmaBoost Connect, en un geste chacune :
 *   • un POSTE de comptoir (là où la douchette est branchée) : un lien, un
 *     fichier à double-cliquer ;
 *   • le SERVEUR de l'officine (le dossier où l'on enregistre le stock) : un
 *     code, à donner à qui installe — l'installation demande un accès
 *     administrateur, elle se fait encore avec une ligne de commande.
 * Ce qui est technique (la ligne de commande, le code à six chiffres, l'archive)
 * reste derrière « Pour un technicien » : on ne le lit pas pour installer.
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

function BigStep({ n, icon: Icon, title, children }: { n: number; icon: typeof Download; title: string; children?: ReactNode }) {
  return (
    <li className="flex flex-1 basis-0 flex-col gap-2 rounded-xl border border-border-subtle bg-surface-sunken/50 p-4">
      <span className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-brand-600 text-[12px] font-semibold text-white">{n}</span>
        <Icon className="size-4 text-text-tertiary" aria-hidden="true" />
      </span>
      <p className="text-[14px] leading-5 font-semibold text-text-primary">{title}</p>
      {children}
    </li>
  );
}

/** Un poste de comptoir : l'installateur Windows à télécharger, double-cliquer. */
export function PostInstallFlow({ onCreated }: { onCreated?: (postId: string) => void }) {
  const inputId = useId();
  const [label, setLabel] = useState("");
  const [link, setLink] = useState<{ downloadUrl: string; command: string; expiresAt: string; postId: string } | null>(null);
  const [six, setSix] = useState<{ code: string; expiresAt: string } | null>(null);
  const [pending, start] = useTransition();
  const { push } = useToast();
  const { copied, copy } = useCopy();

  const generate = () =>
    start(async () => {
      const result = await createPostInstallLinkAction({ label: label || null });
      if (!result.ok) return push({ tone: "error", title: result.error });
      setLink({ downloadUrl: result.data.downloadUrl, command: result.data.command, expiresAt: result.data.expiresAt, postId: result.data.postId });
      setSix(null);
      onCreated?.(result.data.postId);
    });

  const generateSix = () =>
    start(async () => {
      const result = await createPostPairingAction({ label: label || null });
      if (!result.ok) return push({ tone: "error", title: result.error });
      setSix(result.data);
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Nom du poste (facultatif)" htmlFor={inputId}>
          <Input id={inputId} value={label} maxLength={60} onChange={(event) => setLabel(event.target.value)} placeholder="Caisse 1" className="w-52" />
        </Field>
        <Button size="lg" loading={pending} onClick={generate}>
          {link ? "Générer un autre lien" : "Obtenir mon lien d'installation"}
        </Button>
      </div>

      {link && (
        <div className="space-y-3">
          <ol className="flex flex-col gap-3 sm:flex-row">
            <BigStep n={1} icon={Download} title="Téléchargez l'installateur">
              <Button asChild size="sm">
                <a href={link.downloadUrl} target="_blank" rel="noopener noreferrer">Ouvrir la page</a>
              </Button>
            </BigStep>
            <BigStep n={2} icon={MousePointerClick} title="Double-cliquez le fichier">
              <p className="text-[12.5px] leading-5 text-text-secondary">Une minute, rien à taper.</p>
            </BigStep>
            <BigStep n={3} icon={CircleDot} title="Le point vert apparaît près de l'horloge">
              <p className="text-[12.5px] leading-5 text-text-secondary">Le poste s&apos;affiche ici, en ligne.</p>
            </BigStep>
          </ol>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-text-secondary">
            <CopyButton copied={copied} id="link" onCopy={() => copy("link", link.downloadUrl)}>Copier le lien</CopyButton>
            <span>À ouvrir sur l&apos;ordinateur de la douchette (Windows 10 ou 11). Valable jusqu&apos;au {formatDateTime(new Date(link.expiresAt))}, pour un seul poste.</span>
          </div>
        </div>
      )}

      <details className="rounded-xl border border-border-subtle px-4 py-3">
        <summary className="cursor-pointer text-[13.5px] font-medium text-text-secondary">Pour un technicien : ligne de commande ou code</summary>
        <div className="mt-3 space-y-3 text-[13px] leading-5 text-text-secondary">
          {link ? (
            <>
              <p>Dans PowerShell sur le poste, collez la ligne puis Entrée :</p>
              <pre className="overflow-x-auto rounded-lg bg-ink-950 px-3 py-2.5 font-mono text-[12.5px] text-white">{link.command}</pre>
              <CopyButton copied={copied} id="line" onCopy={() => copy("line", link.command)}>Copier la ligne</CopyButton>
            </>
          ) : (
            <p>Obtenez d&apos;abord le lien : la ligne de commande équivalente s&apos;affiche ici.</p>
          )}
          <p>
            Autre méthode : un <button type="button" onClick={generateSix} className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">code à six chiffres</button> avec l&apos;archive à télécharger.
          </p>
          {six && (
            <div className="space-y-2">
              <p className="text-center text-[34px] font-semibold tracking-[0.3em] text-brand-700 tabular dark:text-brand-400">{six.code}</p>
              <p>
                Valable jusqu&apos;au {formatDateTime(new Date(six.expiresAt))}. Téléchargez <a href="/api/agent/telecharger" className="font-medium text-brand-700 underline dark:text-brand-400">PharmaBoost Connect</a>, décompressez, puis dans le dossier :
              </p>
              <pre className="overflow-x-auto rounded-lg bg-ink-950 px-3 py-2.5 font-mono text-[12.5px] text-white">{`powershell -ExecutionPolicy Bypass -File .\\install-poste-windows.ps1 -Code ${six.code}`}</pre>
            </div>
          )}
        </div>
      </details>
    </div>
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
