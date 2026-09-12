"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Cable, Download, KeyRound, RefreshCw, Unplug } from "lucide-react";
import { createPairingAction, disconnectAgentAction, updateConnectionSettingsAction } from "@/server/actions/stock-sync";
import { describeAge, type LgoDefinition } from "@/core/stock/connectors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";

type ConnectionProps = {
  lgo: string;
  lgoLabel: string;
  status: string;
  hostname: string | null;
  agentVersion: string | null;
  exportPath: string | null;
  scansPath: string | null;
  intervalSeconds: number;
  lastSeenAt: string | null;
  lastSyncAt: string | null;
  lastSyncLines: number | null;
  lastError: string | null;
  pairedAt: string | null;
  pairingExpiresAt: string | null;
  freshness: "FRESH" | "STALE" | "DISCONNECTED";
  ageSeconds: number | null;
  /** Âge du dernier signe de vie, calculé côté serveur. */
  seenAgeSeconds: number | null;
};

export function ConnectionManager({ lgos, serverUrl, connection }: { lgos: LgoDefinition[]; serverUrl: string; connection: ConnectionProps | null }) {
  const [lgo, setLgo] = useState(connection?.lgo ?? "lgpi");
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [settings, setSettings] = useState({ intervalSeconds: String(connection?.intervalSeconds ?? 300), exportPath: connection?.exportPath ?? "", scansPath: connection?.scansPath ?? "" });
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  const definition = lgos.find((l) => l.id === lgo) ?? lgos[0];
  const paired = connection && connection.status !== "PENDING" && connection.status !== "DISCONNECTED";

  const generate = () =>
    start(async () => {
      const result = await createPairingAction({ lgo });
      if (!result.ok) return push({ tone: "error", title: result.error });
      setCode(result.data);
      router.refresh();
    });

  return (
    <div className="space-y-5">
      {paired && connection && (
        <Card>
          <CardHeader title={`${connection.lgoLabel} — agent connecté`} description={connection.hostname ? `Sur ${connection.hostname}${connection.agentVersion ? ` · version ${connection.agentVersion}` : ""}` : undefined} />
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
              <Badge tone={connection.freshness === "FRESH" ? "success" : connection.freshness === "STALE" ? "warning" : "danger"}>
                {connection.freshness === "FRESH" ? "Stock à jour" : connection.freshness === "STALE" ? "Stock périmé" : "Agent injoignable"}
              </Badge>
              <span className="text-text-secondary">
                Dernière synchronisation : {connection.lastSyncAt ? `${formatDateTime(new Date(connection.lastSyncAt))} (${describeAge(connection.ageSeconds)})` : "jamais"}
                {connection.lastSyncLines !== null && ` · ${connection.lastSyncLines} lignes`}
              </span>
              <span className="text-text-tertiary">· signe de vie {describeAge(connection.seenAgeSeconds)}</span>
            </div>
            {connection.lastError && <Alert tone="warning" title="Ce que signale l'agent">{connection.lastError}</Alert>}
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Intervalle (secondes)" htmlFor="c-int"><Input id="c-int" inputMode="numeric" value={settings.intervalSeconds} onChange={(e) => setSettings({ ...settings, intervalSeconds: e.target.value })} /></Field>
              <Field label="Dossier de l'export de stock" htmlFor="c-exp"><Input id="c-exp" value={settings.exportPath} onChange={(e) => setSettings({ ...settings, exportPath: e.target.value })} placeholder="C:\LGPI\Exports" /></Field>
              <Field label="Dossier des ordonnances scannées" htmlFor="c-scan"><Input id="c-scan" value={settings.scansPath} onChange={(e) => setSettings({ ...settings, scansPath: e.target.value })} placeholder="facultatif" /></Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" loading={pending} leadingIcon={<RefreshCw className="size-4" />} onClick={() => start(async () => { const r = await updateConnectionSettingsAction(settings); push({ tone: r.ok ? "success" : "error", title: r.ok ? (r.message ?? "Enregistré.") : r.error }); if (r.ok) router.refresh(); })}>
                Enregistrer les réglages
              </Button>
              <Button size="sm" variant="outline" loading={pending} leadingIcon={<KeyRound className="size-4" />} onClick={generate}>
                Nouveau code d&apos;appairage
              </Button>
              <Button size="sm" variant="danger" loading={pending} leadingIcon={<Unplug className="size-4" />} onClick={() => start(async () => { const r = await disconnectAgentAction(); push({ tone: r.ok ? "success" : "error", title: r.ok ? (r.message ?? "Déconnecté.") : r.error }); if (r.ok) router.refresh(); })}>
                Déconnecter
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader title={paired ? "Ré-appairer l'agent" : "1. Votre logiciel de gestion"} description="Choisissez le logiciel de l'officine. L'agent saura où chercher son export." />
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Field label="Logiciel" htmlFor="c-lgo">
              <Select id="c-lgo" value={lgo} onChange={(e) => setLgo(e.target.value)}>
                {lgos.map((l) => <option key={l.id} value={l.id}>{l.label}{l.editor !== "—" ? ` — ${l.editor}` : ""}</option>)}
              </Select>
            </Field>
            <div className="flex items-end">
              <Button loading={pending} leadingIcon={<Cable className="size-[18px]" />} onClick={generate}>{code ? "Régénérer le code" : "Générer mon code d'appairage"}</Button>
            </div>
          </div>
          <p className="text-[13px] text-text-secondary">{definition.exportHint}</p>
          <ol className="space-y-1.5 text-[13px] text-text-primary">
            {definition.exportSteps.map((step, index) => (
              <li key={step} className="flex gap-2"><span className="tabular text-text-tertiary">{index + 1}.</span><span>{step}</span></li>
            ))}
          </ol>
          {definition.adapter === "PILOT" && (
            <p className="text-[12.5px] text-text-tertiary">Procédure vérifiée en officine pilote. Les délivrances en temps réel demandent l&apos;accès au serveur du logiciel, soumis à l&apos;accord de l&apos;éditeur.</p>
          )}
        </CardContent>
      </Card>

      {code && (
        <Card>
          <CardHeader title="2. Votre code d'appairage" description={`Valable jusqu'à ${formatDateTime(new Date(code.expiresAt))}. Il ne sert qu'une fois : l'agent le présente, reçoit sa clé, et le code meurt.`} />
          <CardContent className="space-y-4">
            <p className="text-center text-[40px] font-semibold tracking-[0.3em] text-brand-700 tabular dark:text-brand-400">{code.code}</p>
            <ol className="space-y-2 text-[13.5px] text-text-primary">
              <li>1. Sur le serveur de l&apos;officine, téléchargez l&apos;agent : <a className="text-brand-700 underline underline-offset-2 dark:text-brand-400" href="/api/agent/telecharger">pharmaboost-connect.zip</a> et décompressez-le.</li>
              <li>2. Ouvrez PowerShell en administrateur dans le dossier décompressé, puis lancez :</li>
            </ol>
            <pre className="overflow-x-auto rounded-xl bg-surface-sunken px-4 py-3 text-[12.5px]">{`powershell -ExecutionPolicy Bypass -File .\\install-windows.ps1 -Code ${code.code} -Lgo ${lgo}${serverUrl === "https://pharmaboost.app" ? "" : ` -Serveur ${serverUrl}`}`}</pre>
            <p className="text-[12.5px] text-text-tertiary">
              L&apos;installateur crée {definition.defaultExportPath} (export de stock) et {definition.defaultScansPath} (ordonnances scannées), installe Node.js s&apos;il manque, et enregistre l&apos;agent au démarrage du serveur. Pour d&apos;autres dossiers : <code>-Export</code> et <code>-Scans</code>.
            </p>
            <p className="text-[12.5px] text-text-tertiary">
              Sans Windows, ou pour un essai : <code>{`node pharmaboost-connect.js --appairer ${code.code} --serveur ${serverUrl} --lgo ${lgo} --export "/chemin/export"`}</code> puis <code>node pharmaboost-connect.js</code>.
            </p>
            <p className="text-[13px] text-text-secondary">Dès que l&apos;agent est appairé, cette page affiche « agent connecté » et la première synchronisation suit.</p>
          </CardContent>
        </Card>
      )}

      {!paired && !code && connection?.status === "PENDING" && connection.pairingExpiresAt && new Date(connection.pairingExpiresAt) > new Date() && (
        <Alert tone="info">Un code d&apos;appairage est en attente jusqu&apos;à {formatDateTime(new Date(connection.pairingExpiresAt))}. Régénérez-en un si vous ne l&apos;avez plus.</Alert>
      )}

      <p className="flex items-center gap-2 text-[12.5px] text-text-tertiary"><Download className="size-3.5" /> L&apos;agent ne lit que l&apos;export de stock et, si vous l&apos;indiquez, les ordonnances scannées. Il n&apos;écrit rien dans votre logiciel.</p>
    </div>
  );
}
