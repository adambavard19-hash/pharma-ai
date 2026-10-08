"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Unplug } from "lucide-react";
import { adminDisconnectAgentAction, adminUpdateConnectionSettingsAction } from "@/server/actions/admin-connection";
import { describeAge } from "@/core/stock/connectors";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";

export type AssistanceServerConnection = {
  lgoLabel: string;
  hostname: string | null;
  agentVersion: string | null;
  exportPath: string | null;
  scansPath: string | null;
  intervalSeconds: number;
  lastSyncAt: string | null;
  lastSyncLines: number | null;
  lastError: string | null;
  /** Calculé côté serveur par la même règle que partout : un signe de vie de moins de dix minutes. */
  online: boolean;
  seenAgeSeconds: number | null;
};

/**
 * Le serveur de l'officine, côté assistance : le dossier surveillé, l'intervalle, les ordonnances scannées, la
 * déconnexion. Le code d'installation du serveur se prépare dans « Installation sous AnyDesk », plus haut. Le
 * pharmacien ne voit rien de cela.
 */
export function AssistanceServer({ pharmacyId, connection }: { pharmacyId: string; connection: AssistanceServerConnection | null }) {
  const [settings, setSettings] = useState({ intervalSeconds: String(connection?.intervalSeconds ?? 300), exportPath: connection?.exportPath ?? "", scansPath: connection?.scansPath ?? "" });
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();
  const { push } = useToast();

  if (!connection) {
    return <p className="text-[13.5px] text-text-secondary">Aucun serveur n&apos;est relié. Il est facultatif : le pharmacien peut envoyer un fichier de stock, et ses comptoirs s&apos;installent seuls. Pour relier un serveur : « Installation sous AnyDesk », plus haut.</p>;
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
        <Field label="Intervalle (secondes)" htmlFor="a-int"><Input id="a-int" inputMode="numeric" value={settings.intervalSeconds} onChange={(e) => setSettings({ ...settings, intervalSeconds: e.target.value })} /></Field>
        <Field label="Dossier de l'export de stock" htmlFor="a-exp"><Input id="a-exp" value={settings.exportPath} onChange={(e) => setSettings({ ...settings, exportPath: e.target.value })} placeholder="C:\PharmaBoost\Export" /></Field>
        <Field label="Dossier des ordonnances scannées" htmlFor="a-scan"><Input id="a-scan" value={settings.scansPath} onChange={(e) => setSettings({ ...settings, scansPath: e.target.value })} placeholder="facultatif" /></Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" loading={pending} leadingIcon={<RefreshCw className="size-4" />} onClick={() => start(async () => { const r = await adminUpdateConnectionSettingsAction({ pharmacyId, ...settings }); push({ tone: r.ok ? "success" : "error", title: r.ok ? (r.message ?? "Enregistré.") : r.error }); if (r.ok) router.refresh(); })}>
          Enregistrer les réglages
        </Button>
        {confirming ? (
          <>
            <Button size="sm" variant="danger" loading={pending} leadingIcon={<Unplug className="size-4" />} onClick={() => start(async () => { const r = await adminDisconnectAgentAction({ pharmacyId }); push({ tone: r.ok ? "success" : "error", title: r.ok ? (r.message ?? "Déconnecté.") : r.error }); setConfirming(false); if (r.ok) router.refresh(); })}>
              Confirmer la déconnexion
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>Annuler</Button>
          </>
        ) : (
          <Button size="sm" variant="danger" leadingIcon={<Unplug className="size-4" />} onClick={() => setConfirming(true)}>
            Déconnecter ce serveur
          </Button>
        )}
      </div>
      <p className="text-[12.5px] text-text-tertiary">Le programme ne lit que l&apos;export de stock et, si le dossier est indiqué, les ordonnances scannées. Il n&apos;écrit rien dans le logiciel de l&apos;officine.</p>
    </div>
  );
}
