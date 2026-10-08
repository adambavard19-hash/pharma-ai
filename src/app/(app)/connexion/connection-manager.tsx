"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Unplug } from "lucide-react";
import { disconnectAgentAction, updateConnectionSettingsAction } from "@/server/actions/stock-sync";
import { describeAge } from "@/core/stock/connectors";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";
import { ServerInstallFlow } from "./install-panels";

type ServerConnection = {
  lgo: string;
  lgoLabel: string;
  hostname: string | null;
  agentVersion: string | null;
  exportPath: string | null;
  scansPath: string | null;
  intervalSeconds: number;
  lastSeenAt: string | null;
  lastSyncAt: string | null;
  lastSyncLines: number | null;
  lastError: string | null;
  /** Calculé côté serveur par la même règle que l'aperçu : un signe de vie de moins de dix minutes. */
  online: boolean;
  seenAgeSeconds: number | null;
};

/**
 * Le serveur de l'officine, côté réglages : le dossier surveillé, l'intervalle,
 * un nouveau code, la déconnexion. Les statuts viennent de l'aperçu — la même
 * phrase qu'en haut de la page —, pas d'un second calcul : ici on ne dit « en
 * ligne » que d'un serveur qui a donné signe de vie, et la date de la dernière
 * lecture du stock est dite à part, sans la confondre avec la connexion.
 */
export function ConnectionManager({ serverUrl, connection, lgo }: { serverUrl: string; connection: ServerConnection | null; lgo: string | null }) {
  const [settings, setSettings] = useState({ intervalSeconds: String(connection?.intervalSeconds ?? 300), exportPath: connection?.exportPath ?? "", scansPath: connection?.scansPath ?? "" });
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  if (!connection) {
    return (
      <div className="space-y-3">
        <p className="text-[13.5px] text-text-secondary">Aucun serveur n&apos;est relié. Il est facultatif : un fichier de stock suffit, et les comptoirs s&apos;installent à l&apos;étape 1.</p>
        {lgo ? <ServerInstallFlow lgo={lgo} serverUrl={serverUrl} /> : <p className="text-[13.5px] text-text-secondary">Pour obtenir un code d&apos;installation du serveur, choisissez d&apos;abord « Mon logiciel » à l&apos;étape 2.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
        <Badge tone={connection.online ? "success" : "warning"}>{connection.online ? "En ligne" : "Ne répond plus"}</Badge>
        <span className="text-text-secondary">
          {connection.lgoLabel}
          {connection.hostname ? ` · ${connection.hostname}` : ""}
          {connection.agentVersion ? ` · version ${connection.agentVersion}` : ""}
        </span>
        <span className="text-text-tertiary">· dernier signe de vie {describeAge(connection.seenAgeSeconds)}</span>
      </div>
      <p className="text-[13px] text-text-secondary">
        Dernier stock lu par ce serveur : {connection.lastSyncAt ? `${formatDateTime(new Date(connection.lastSyncAt))}${connection.lastSyncLines !== null ? ` · ${connection.lastSyncLines} lignes` : ""}` : "aucun"}.
      </p>
      {connection.lastError && <Alert tone="warning" title="Ce que signale le programme">{connection.lastError}</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Intervalle (secondes)" htmlFor="c-int"><Input id="c-int" inputMode="numeric" value={settings.intervalSeconds} onChange={(e) => setSettings({ ...settings, intervalSeconds: e.target.value })} /></Field>
        <Field label="Dossier de l'export de stock" htmlFor="c-exp"><Input id="c-exp" value={settings.exportPath} onChange={(e) => setSettings({ ...settings, exportPath: e.target.value })} placeholder="C:\PharmaBoost\Export" /></Field>
        <Field label="Dossier des ordonnances scannées" htmlFor="c-scan"><Input id="c-scan" value={settings.scansPath} onChange={(e) => setSettings({ ...settings, scansPath: e.target.value })} placeholder="facultatif" /></Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={pending} leadingIcon={<RefreshCw className="size-4" />} onClick={() => start(async () => { const r = await updateConnectionSettingsAction(settings); push({ tone: r.ok ? "success" : "error", title: r.ok ? (r.message ?? "Enregistré.") : r.error }); if (r.ok) router.refresh(); })}>
          Enregistrer les réglages
        </Button>
        <Button size="sm" variant="danger" loading={pending} leadingIcon={<Unplug className="size-4" />} onClick={() => start(async () => { const r = await disconnectAgentAction(); push({ tone: r.ok ? "success" : "error", title: r.ok ? (r.message ?? "Déconnecté.") : r.error }); if (r.ok) router.refresh(); })}>
          Déconnecter ce serveur
        </Button>
      </div>
      <details className="rounded-xl border border-border-subtle px-4 py-3">
        <summary className="cursor-pointer text-[13.5px] font-medium text-text-secondary">Nouveau code d&apos;installation</summary>
        <div className="mt-3"><ServerInstallFlow lgo={connection.lgo} serverUrl={serverUrl} /></div>
      </details>
      <p className="text-[12.5px] text-text-tertiary">Le programme ne lit que l&apos;export de stock et, si vous l&apos;indiquez, les ordonnances scannées. Il n&apos;écrit rien dans votre logiciel.</p>
    </div>
  );
}
