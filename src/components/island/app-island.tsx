"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FileUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCounterLook } from "@/components/robot/counter-look-context";
import { useRobotAlerts } from "@/components/robot/robot-alerts";
import { useRobotInBrowser } from "@/components/robot/robot-presence";
import { emitRobotMood } from "@/components/robot";
import { previewStockAction, sendStockAction } from "@/server/actions/stock-deposits";
import { DEPOSIT_CONFIRMATION } from "@/core/stock-deposit/rules";
import type { StockPreview } from "@/core/stock-deposit/types";
import type { RobotAlert } from "@/core/robot/alerts";
import { safeAppHref } from "@/core/pharmacy-assistant/assistant";
import { cn } from "@/lib/utils";
import { PlatformIsland } from "./platform-island";

/**
 * L'île du logiciel officine : le robot du COMPTOIR de la personne (ses couleurs, son accessoire), les chiffres de sa
 * journée, ce que le robot signale avec ses gestes en un clic (les alertes d'avant, désormais dans l'île), la
 * discussion avec le robot de l'officine, et « + » pour déposer le fichier du stock (titulaire).
 *
 * Sur le PC où le logiciel PharmaBoost installé dessine déjà le robot (core/robot/single-robot.ts), l'île reste — c'est
 * le seul endroit de l'espace où se lisent les alertes du robot (paiement, demandes d'accès, primes…) et la discussion —
 * mais sans le dessin du robot.
 */
export function AppIsland({ suggestions, canImportStock }: { suggestions: string[]; canImportStock: boolean }) {
  const counterLook = useCounterLook();
  const robotHere = useRobotInBrowser();
  const robotAlerts = useRobotAlerts();
  const alerts = robotAlerts?.alerts ?? [];
  const firstUnseen = robotAlerts?.unseen[0]?.key ?? null;

  return (
    <PlatformIsland
      label="L'île PharmaBoost"
      // Rien à l'écran au repos : la bannière du robot s'ouvre d'un clic sur sa tête, dans le menu (le robot du scan reste sur le poste).
      dock="logo"
      look={counterLook?.look}
      robotless={!robotHere}
      mood={robotAlerts?.mood}
      homeEndpoint="/api/ile/officine"
      homeExtra={robotAlerts && alerts.length > 0 ? <AlertList value={robotAlerts} /> : null}
      badge={alerts.length}
      attention={alerts.some((alert) => alert.severity === "problem") || undefined}
      autoOpenKey={firstUnseen}
      chat={{
        endpoint: "/api/robot/assistant",
        suggestions,
        safeHref: safeAppHref,
        placeholder: "Le patient a mal à la gorge, résume ma journée…",
        footnote: "Un patient a une question ? Décrivez-la sans son nom : je propose les conseils validés de votre stock, la décision vous revient. Je lis aussi les chiffres de votre officine, sans rien modifier.",
      }}
      plus={canImportStock ? <StockDrop /> : undefined}
      plusLabel="Stock"
    />
  );
}

const DOT: Record<RobotAlert["severity"], string> = { problem: "#F5A623", todo: "#36E8C8", good: "#22C88F", info: "rgba(255,255,255,0.4)" };

/** Ce que le robot signale, dans l'île : chaque alerte, ses gestes, « Plus tard ». Tout ce qui est montré est vu. */
function AlertList({ value }: { value: NonNullable<ReturnType<typeof useRobotAlerts>> }) {
  const router = useRouter();
  const { alerts, running, markSeen, snooze, run } = value;
  const keys = alerts.map((alert) => alert.key).join("|");
  useEffect(() => {
    if (keys) markSeen(keys.split("|"));
  }, [keys, markSeen]);

  return (
    <ul className="space-y-1.5" aria-label="Ce que le robot signale">
      {alerts.slice(0, 5).map((alert, i) => {
        const busy = running?.key === alert.key;
        return (
          <li key={alert.key} className="isl-line rounded-2xl bg-white/[0.06] px-3 py-2" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="flex items-start gap-2">
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ background: DOT[alert.severity] }} aria-hidden="true" />
              <p className="min-w-0 flex-1 text-[13px] leading-[1.45] text-white/90">{alert.text}</p>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-3.5">
              {alert.actions.map((action, a) => (
                <button
                  key={action.kind}
                  type="button"
                  disabled={busy}
                  onClick={() => void run(alert, action)}
                  className={cn("inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold disabled:opacity-60", a === 0 ? "bg-[#36E8C8] text-[#04261A]" : "bg-white/10 text-white hover:bg-white/15")}
                >
                  {a === 0 && <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />}
                  {busy && running?.kind === action.kind ? "…" : action.label}
                </button>
              ))}
              {alert.link && (
                <button type="button" onClick={() => router.push(alert.link!.href)} className="inline-flex h-7 items-center rounded-lg px-2 text-[12px] font-medium text-[#36E8C8] hover:bg-white/[0.06]">
                  {alert.link.label} →
                </button>
              )}
              {alert.snoozable && (
                <button type="button" onClick={() => snooze(alert)} className="ml-auto inline-flex h-7 items-center rounded-lg px-2 text-[12px] text-white/55 hover:bg-white/[0.06] hover:text-white/80">
                  {alert.severity === "good" || alert.severity === "info" ? "Compris" : "Plus tard"}
                </button>
              )}
            </div>
          </li>
        );
      })}
      {alerts.length > 5 && <li className="px-3 text-[11.5px] text-white/45">Et {alerts.length - 5} de plus…</li>}
    </ul>
  );
}

type DropState = { kind: "idle" } | { kind: "reading"; name: string } | { kind: "preview"; file: File; preview: StockPreview } | { kind: "sending" } | { kind: "done"; message: string } | { kind: "error"; message: string };

/**
 * « + » : déposer le fichier du stock, comme l'écran « Mettre à jour le stock » — le fichier est d'abord VÉRIFIÉ (rien
 * n'est écrit), puis envoyé sur confirmation (il remplace le stock). Mêmes actions serveur, mêmes contrôles.
 */
function StockDrop() {
  const [state, setState] = useState<DropState>({ kind: "idle" });
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const read = async (file: File) => {
    setState({ kind: "reading", name: file.name });
    const data = new FormData();
    data.set("file", file);
    const result = await previewStockAction(data);
    setState(result.ok ? { kind: "preview", file, preview: result.data } : { kind: "error", message: result.error });
  };
  const send = async (file: File) => {
    setState({ kind: "sending" });
    const data = new FormData();
    data.set("file", file);
    data.set("confirmation", DEPOSIT_CONFIRMATION);
    const result = await sendStockAction(data);
    if (result.ok) {
      setState({ kind: "done", message: result.message ?? "Stock reçu." });
      emitRobotMood("happy");
    } else setState({ kind: "error", message: result.error });
  };

  if (state.kind === "preview") {
    const p = state.preview;
    return (
      <div className="space-y-2 rounded-2xl bg-white/[0.06] p-3 text-[13px]">
        <p className="font-semibold text-white">{p.fileName}</p>
        <p className="text-white/75">
          {p.products.toLocaleString("fr-FR")} produits lus · {p.recognized.toLocaleString("fr-FR")} reconnus · {p.created.toLocaleString("fr-FR")} nouveaux
          {p.absent ? ` · ${p.absent.toLocaleString("fr-FR")} passeraient à 0` : ""}
        </p>
        {p.verdict === "HOLD" && <p className="text-[#FFE2B0]">{p.reason ?? "L'équipe PharmaBoost vérifiera ce fichier avant de l'appliquer."}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => void send(state.file)} className="h-8 flex-1 rounded-xl bg-[#36E8C8] text-[12.5px] font-bold text-[#04261A]">Envoyer mon stock</button>
          <button type="button" onClick={() => setState({ kind: "idle" })} className="h-8 rounded-xl bg-white/10 px-3 text-[12.5px] text-white">Annuler</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          const file = event.dataTransfer.files[0];
          if (file) void read(file);
        }}
        disabled={state.kind === "reading" || state.kind === "sending"}
        className={cn("flex w-full flex-col items-center gap-1.5 rounded-2xl border border-dashed px-4 py-5 text-center transition-colors", over ? "border-[#36E8C8] bg-[#36E8C8]/10" : "border-white/20 bg-white/[0.03] hover:border-white/35")}
      >
        {state.kind === "reading" || state.kind === "sending" ? <Loader2 className="isl-spin size-5 text-[#36E8C8]" aria-hidden="true" /> : <FileUp className="size-5 text-[#36E8C8]" aria-hidden="true" />}
        <span className="text-[13.5px] font-semibold text-white">{state.kind === "reading" ? `Je lis ${state.name}…` : state.kind === "sending" ? "J'envoie votre stock…" : "Déposez le fichier de votre stock"}</span>
        <span className="text-[12px] text-white/55">L&apos;export de votre logiciel de gestion. Je le vérifie avant tout : rien ne change sans votre accord.</span>
      </button>
      <input ref={input} type="file" className="hidden" accept=".csv,.txt,.xlsx,.xls,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void read(file);
        event.target.value = "";
      }} />
      {state.kind === "done" && <p className="isl-pop mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#36E8C8]"><Check className="size-4" strokeWidth={3} aria-hidden="true" /> {state.message}</p>}
      {state.kind === "error" && <p className="mt-2 text-[12.5px] text-[#FFE2B0]">{state.message}</p>}
    </div>
  );
}
