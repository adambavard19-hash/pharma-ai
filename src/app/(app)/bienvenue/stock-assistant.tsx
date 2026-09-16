"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cable, Check, ClipboardCopy, Download, FileSpreadsheet, Loader2, Mail, Monitor, RefreshCw } from "lucide-react";
import { createPairingAction, emailInstallInstructionsAction, getConnectionStatusAction } from "@/server/actions/stock-sync";
import type { LgoDefinition } from "@/core/stock/connectors";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";
import { describeAge } from "@/core/stock/connectors";
import { cn } from "@/lib/utils";

/**
 * Mettre son stock dans PharmaBoost, sans se perdre.
 *
 * Un titulaire qui arrive n'a pas à deviner : il dit quel logiciel il utilise,
 * on lui montre où cliquer dedans pour sortir le stock, puis il choisit entre
 * déposer le fichier tout de suite et brancher l'agent une fois pour toutes.
 * Dans le second cas, la commande est prête à copier, et l'écran attend
 * l'agent : « connecté », puis « stock synchronisé », sans rien rafraîchir.
 */

type ConnectionSummary = {
  status: string;
  lgo: string | null;
  hostname: string | null;
  lastSyncAt: string | null;
  lastSyncLines: number | null;
  /** Faux quand l'agent ne s'est pas présenté depuis plus d'une heure. */
  reachable: boolean;
  seenAgeSeconds: number | null;
};

const REQUIRED_COLUMNS = ["Code CIP 13 ou EAN", "Désignation", "Quantité en stock", "Prix de vente TTC (sinon, le prix se saisit au comptoir)"];

export function StockAssistant({
  lgos,
  serverUrl,
  connection,
  stockDone,
  userEmail,
}: {
  lgos: LgoDefinition[];
  serverUrl: string;
  connection: ConnectionSummary | null;
  stockDone: boolean;
  userEmail: string;
}) {
  const paired = Boolean(connection && connection.status !== "PENDING" && connection.status !== "DISCONNECTED" && connection.status !== "NONE" && connection.reachable);
  const gone = Boolean(connection && connection.status !== "PENDING" && connection.status !== "DISCONNECTED" && connection.status !== "NONE" && !connection.reachable);
  const [lgo, setLgo] = useState<string | null>(connection?.lgo ?? null);
  const [mode, setMode] = useState<"file" | "agent" | null>(paired ? "agent" : null);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [live, setLive] = useState<{ status: string; reachable: boolean; hostname: string | null; lastSyncAt: string | null; lastSyncLines: number | null; lastError: string | null } | null>(null);
  const [pending, start] = useTransition();
  const [mailing, startMail] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  const definition = lgos.find((l) => l.id === lgo) ?? null;

  // Tant qu'un code est affiché, on regarde toutes les dix secondes si l'agent
  // s'est présenté : le titulaire voit « connecté » sans toucher à l'écran.
  useEffect(() => {
    if (!code && !paired && !gone) return;
    let stopped = false;
    const tick = async () => {
      const result = await getConnectionStatusAction();
      if (stopped || !result.ok) return;
      setLive(result.data);
      if (result.data.lastSyncAt) router.refresh();
    };
    void tick();
    const timer = setInterval(() => void tick(), 10_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [code, paired, gone, router]);

  const command = code
    ? `powershell -ExecutionPolicy Bypass -File .\\install-windows.ps1 -Code ${code.code} -Lgo ${lgo}${serverUrl === "https://pharmaboost.app" ? "" : ` -Serveur ${serverUrl}`}`
    : null;

  const generate = () =>
    start(async () => {
      if (!lgo) return;
      const result = await createPairingAction({ lgo });
      if (!result.ok) return push({ tone: "error", title: result.error });
      setCode(result.data);
    });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      push({ tone: "success", title: "Copié." });
    } catch {
      push({ tone: "error", title: "Copie impossible : sélectionnez le texte à la main." });
    }
  };

  // « Connecté » veut dire : appairé ET vu depuis moins d'une heure. Un agent
  // parti depuis cinq jours n'est pas connecté, quel que soit son dernier état.
  const connected = live ? live.reachable : paired;
  const synced = live?.lastSyncAt ?? connection?.lastSyncAt ?? null;
  const syncedLines = live?.lastSyncLines ?? connection?.lastSyncLines ?? null;

  return (
    <div className="space-y-5">
      {/* ---- A. Le logiciel ------------------------------------------------ */}
      <section className="space-y-2.5">
        <StepHeading n="A" title="Quel logiciel utilisez-vous à l'officine ?" />
        <div className="grid gap-2 sm:grid-cols-3">
          {lgos.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => {
                setLgo(candidate.id);
                setCode(null);
              }}
              className={cn(
                "rounded-xl border px-3.5 py-3 text-left transition-colors",
                lgo === candidate.id ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40" : "border-border-subtle bg-surface-card hover:border-border-strong",
              )}
            >
              <span className="block text-[14px] font-semibold text-text-primary">{candidate.label}</span>
              <span className="block text-[12px] text-text-tertiary">{candidate.editor === "—" ? "CSV, Excel ou PDF" : candidate.editor}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ---- B. Sortir le stock du logiciel ---------------------------------- */}
      {definition && (
        <section className="space-y-2.5">
          <StepHeading n="B" title={`Sortir le stock de ${definition.label}`} />
          <p className="text-[13.5px] text-text-secondary">{definition.exportHint}</p>
          <ol className="space-y-2 rounded-xl border border-border-subtle bg-surface-card px-4 py-3.5">
            {definition.exportSteps.map((step, index) => (
              <li key={step} className="flex gap-3 text-[13.5px] leading-5 text-text-primary">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[12px] font-semibold text-text-secondary">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl bg-surface-sunken/70 px-4 py-3 text-[12.5px] leading-5 text-text-secondary">
              <p className="font-semibold text-text-primary">Ce que le fichier doit contenir</p>
              <ul className="mt-1 list-disc pl-4">
                {REQUIRED_COLUMNS.map((column) => (
                  <li key={column}>{column}</li>
                ))}
              </ul>
              <p className="mt-1.5">Le nom des colonnes n&apos;a pas d&apos;importance : PharmaBoost les reconnaît.</p>
            </div>
            <div className="rounded-xl bg-surface-sunken/70 px-4 py-3 text-[12.5px] leading-5 text-text-secondary">
              <p className="font-semibold text-text-primary">Rien n&apos;est modifié dans votre logiciel</p>
              <p className="mt-1">Une édition ou un export lit le stock, il ne le change pas. Votre inventaire, votre comptable et vos commandes ne voient rien.</p>
              {definition.adapter === "GENERIC" && (
                <p className="mt-1.5">Menu introuvable ? Demandez à votre éditeur « un export du stock en CSV ou Excel », c&apos;est une demande courante.</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ---- C. Le mettre dans PharmaBoost ---------------------------------- */}
      {definition && (
        <section className="space-y-2.5">
          <StepHeading n="C" title="Le mettre dans PharmaBoost" />
          <div className="grid gap-2 sm:grid-cols-2">
            <ModeCard
              active={mode === "file"}
              icon={<FileSpreadsheet className="size-5" />}
              title="Maintenant, à la main"
              description="Déposez le fichier, deux minutes. Idéal pour commencer aujourd'hui. À refaire à chaque mise à jour."
              onClick={() => setMode("file")}
            />
            <ModeCard
              active={mode === "agent"}
              icon={<Cable className="size-5" />}
              title="Automatiquement, une fois pour toutes"
              description="Un petit programme sur l'ordinateur serveur de l'officine envoie chaque nouvel export tout seul. Dix minutes, une seule fois."
              onClick={() => setMode("agent")}
            />
          </div>

          {mode === "file" && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle bg-surface-card px-4 py-3.5">
              <p className="min-w-0 flex-1 text-[13.5px] text-text-secondary">Glissez le fichier exporté ; PharmaBoost lit les colonnes, rattache chaque ligne au catalogue national, et vous montre ce qu&apos;il a compris avant d&apos;écrire.</p>
              <Button asChild leadingIcon={<FileSpreadsheet className="size-[18px]" />}>
                <Link href="/stock/import?retour=bienvenue">{stockDone ? "Importer une mise à jour" : "Déposer mon fichier"}</Link>
              </Button>
            </div>
          )}

          {mode === "agent" && (
            <div className="space-y-3 rounded-xl border border-border-subtle bg-surface-card px-4 py-4">
              {!connected && (gone || live?.status === "CONNECTED" || live?.status === "STALE" || live?.status === "ERROR") && !code && (
                <div className="rounded-xl border border-warning-300 bg-warning-50/50 px-4 py-3 text-[13.5px] dark:border-warning-800 dark:bg-warning-950/20">
                  <p className="font-medium text-text-primary">L&apos;agent installé{connection?.hostname ? ` sur ${connection.hostname}` : ""} ne répond plus{connection?.seenAgeSeconds !== null && connection?.seenAgeSeconds !== undefined ? ` (dernier signe de vie ${describeAge(connection.seenAgeSeconds)})` : ""}.</p>
                  <p className="text-text-secondary">Le serveur est peut-être éteint, ou l&apos;agent a été arrêté. Redémarrez le serveur, ou réinstallez l&apos;agent avec un nouveau code ci-dessous.</p>
                </div>
              )}
              {connected ? (
                <div className="flex items-start gap-3 rounded-xl border border-success-300 bg-success-50/40 px-4 py-3 dark:border-success-800 dark:bg-success-950/20">
                  <Check className="mt-0.5 size-5 shrink-0 text-success-700 dark:text-success-400" strokeWidth={2.5} />
                  <div className="text-[13.5px]">
                    <p className="font-medium text-text-primary">Agent connecté{(live?.hostname ?? connection?.hostname) ? ` sur ${live?.hostname ?? connection?.hostname}` : ""}.</p>
                    <p className="text-text-secondary">
                      {synced
                        ? `Stock synchronisé le ${formatDateTime(new Date(synced))}${syncedLines !== null ? ` · ${syncedLines} lignes` : ""}.`
                        : `En attente du premier export : enregistrez l'édition de stock dans ${definition.defaultExportPath}, elle part dans la minute.`}
                    </p>
                    {live?.lastError && <p className="mt-1 text-warning-800 dark:text-warning-400">{live.lastError}</p>}
                  </div>
                </div>
              ) : (
                <>
                  <ol className="space-y-3 text-[13.5px] text-text-primary">
                    <li className="flex gap-3">
                      <Num n={1} />
                      <div className="min-w-0 flex-1 space-y-2">
                        <p>Générez votre code d&apos;appairage. Il vaut une heure et ne sert qu&apos;une fois.</p>
                        {code ? (
                          <p className="flex flex-wrap items-center gap-3">
                            <span className="rounded-xl bg-brand-50 px-4 py-2 text-[28px] font-semibold tracking-[0.3em] text-brand-700 tabular dark:bg-brand-950/40 dark:text-brand-400">{code.code}</span>
                            <span className="text-[12.5px] text-text-tertiary">valable jusqu&apos;à {formatDateTime(new Date(code.expiresAt))}</span>
                          </p>
                        ) : (
                          <Button loading={pending} leadingIcon={<Cable className="size-[18px]" />} onClick={generate}>
                            Générer mon code d&apos;appairage
                          </Button>
                        )}
                      </div>
                    </li>
                    <li className={cn("flex gap-3", !code && "opacity-50")}>
                      <Num n={2} />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p>
                          <span className="font-medium">Sur l&apos;ordinateur serveur de l&apos;officine</span> (celui où tourne {definition.label}), connecté à PharmaBoost avec votre compte, téléchargez l&apos;agent et décompressez le dossier.
                        </p>
                        <a className="inline-flex items-center gap-1.5 text-[13px] text-brand-700 underline underline-offset-2 dark:text-brand-400" href="/api/agent/telecharger">
                          <Download className="size-3.5" /> pharmaboost-connect.zip
                        </a>
                      </div>
                    </li>
                    <li className={cn("flex gap-3", !code && "opacity-50")}>
                      <Num n={3} />
                      <div className="min-w-0 flex-1 space-y-2">
                        <p>
                          Ouvrez <span className="font-medium">PowerShell en administrateur</span> (clic droit sur le menu Démarrer, « Terminal (administrateur) »), placez-vous dans le dossier décompressé, et collez cette commande :
                        </p>
                        {command ? (
                          <div className="flex items-start gap-2">
                            <pre className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-surface-sunken px-4 py-3 text-[12.5px]">{command}</pre>
                            <Button size="sm" variant="outline" leadingIcon={<ClipboardCopy className="size-4" />} onClick={() => copy(command)}>
                              Copier
                            </Button>
                          </div>
                        ) : (
                          <pre className="overflow-x-auto rounded-xl bg-surface-sunken px-4 py-3 text-[12.5px] text-text-tertiary">{`powershell -ExecutionPolicy Bypass -File .\\install-windows.ps1 -Code ······ -Lgo ${lgo}`}</pre>
                        )}
                        <p className="text-[12.5px] text-text-tertiary">
                          L&apos;installateur crée {definition.defaultExportPath} et {definition.defaultScansPath}, installe ce qu&apos;il faut, et démarre l&apos;agent au démarrage du serveur.
                        </p>
                      </div>
                    </li>
                    <li className={cn("flex gap-3", !code && "opacity-50")}>
                      <Num n={4} />
                      <div className="min-w-0 flex-1">
                        <p>
                          Dans {definition.label}, enregistrez l&apos;export du stock (étape B) dans <span className="font-medium">{definition.defaultExportPath}</span>. Il part dans la minute. À refaire quand le stock doit être rafraîchi.
                        </p>
                      </div>
                    </li>
                  </ol>

                  {code && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">
                      <p className="flex items-center gap-2 text-[13px] text-text-secondary">
                        <Loader2 className="size-4 animate-spin text-brand-600" />
                        En attente de l&apos;agent… cette page se met à jour toute seule dès qu&apos;il se présente.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          loading={mailing}
                          leadingIcon={<Mail className="size-4" />}
                          onClick={() =>
                            startMail(async () => {
                              const result = await emailInstallInstructionsAction({ lgo: lgo as string, code: code.code, serverUrl });
                              push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Envoyé.") : result.error });
                            })
                          }
                        >
                          M&apos;envoyer ces instructions ({userEmail})
                        </Button>
                        <Button size="sm" variant="ghost" leadingIcon={<RefreshCw className="size-4" />} onClick={generate} loading={pending}>
                          Nouveau code
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
              <p className="flex items-center gap-2 text-[12.5px] text-text-tertiary">
                <Monitor className="size-3.5" /> L&apos;agent lit le dossier d&apos;export et, si vous l&apos;indiquez, les ordonnances scannées. Il n&apos;écrit rien dans votre logiciel.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function StepHeading({ n, title }: { n: string; title: string }) {
  return (
    <h3 className="flex items-center gap-2.5 text-[15px] font-semibold text-text-primary">
      <span className="flex size-7 items-center justify-center rounded-lg bg-brand-600 text-[13px] text-white">{n}</span>
      {title}
    </h3>
  );
}

function Num({ n }: { n: number }) {
  return <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[12px] font-semibold text-text-secondary">{n}</span>;
}

function ModeCard({ active, icon, title, description, onClick }: { active: boolean; icon: React.ReactNode; title: string; description: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors",
        active ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40" : "border-border-subtle bg-surface-card hover:border-border-strong",
      )}
    >
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", active ? "bg-brand-600 text-white" : "bg-surface-sunken text-text-secondary")}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-text-primary">{title}</span>
        <span className="block text-[12.5px] leading-4 text-text-secondary">{description}</span>
      </span>
    </button>
  );
}
