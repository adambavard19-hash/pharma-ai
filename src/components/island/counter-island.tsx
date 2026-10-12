"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, Loader2, Mail, PartyPopper, ScanLine, Send, TriangleAlert } from "lucide-react";
import { BANNER } from "../../../agent/src/banner-design";
import { Robot } from "@/components/robot";
import { analysisSteps, allAnswered, registerTap, STAGE_MOOD, STAGE_WIDTH, stageTitle, stageTone, type IslandOutcome, type IslandState } from "@/core/island/banner-flow";
import { cn } from "@/lib/utils";
import { IslandShell } from "./island-shell";

/**
 * La bannière du comptoir en île : la capsule noire en haut de l'écran, NOTRE robot dedans, et tout le parcours d'une
 * délivrance joué à l'intérieur (scan, analyse qui se coche, conseils en cartes, Vendu / Non vendu, e-mail du bilan,
 * vente terminée, mise en garde). Les textes et les couleurs sont ceux de la bannière Windows (`banner-design.ts`).
 *
 * Composant d'affichage : l'état vient de l'extérieur (aperçu, ou plus tard la vraie vente), les gestes remontent.
 */

const C = BANNER.colors;
const T = BANNER.text;

export type IslandAdvice = {
  name: string;
  price?: string;
  drug?: string;
  reason?: string;
  challenge?: boolean;
  shortDate?: string;
  stock?: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "UNKNOWN";
  quantity?: number;
  image?: string;
};

export type IslandPill = { key: string; label: string; value: string; dot?: string };

export type CounterIslandProps = {
  state: IslandState;
  items: IslandAdvice[];
  drug: string;
  alert: { title: string; text: string } | null;
  pills: IslandPill[];
  /** Survol de la capsule au repos : elle s'ouvre sur le résumé du comptoir. */
  hoverOpen?: boolean;
  onAnswer: (index: number, outcome: IslandOutcome) => void;
  onEmail: (value: string) => void;
  onSendEmail: () => void;
  onAddEmail: () => void;
  onFinish: () => void;
  onDismissAlert: () => void;
};

const STOCK: Record<NonNullable<IslandAdvice["stock"]>, { bg: string; fg: string; label: string }> = {
  IN_STOCK: { bg: C.stockBg, fg: C.stockFg, label: T.inStock },
  LOW_STOCK: { bg: C.lowBg, fg: C.lowFg, label: T.lowStock },
  OUT_OF_STOCK: { bg: C.outBg, fg: C.outFg, label: T.outOfStock },
  UNKNOWN: { bg: C.unknownBg, fg: C.unknownFg, label: T.unknownStock },
};

function Chip({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap" style={{ background: bg, color: fg }}>
      {children}
    </span>
  );
}

export function CounterIsland(props: CounterIslandProps) {
  const { state, items, alert, pills } = props;
  const count = items.length;
  const [hover, setHover] = useState(false);
  const [taps, setTaps] = useState<number[]>([]);
  const [grumpy, setGrumpy] = useState(false);
  const [cheer, setCheer] = useState(0);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // La fête du robot rejouée à chaque « Vente terminée ».
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la fête suit l'étape
    if (state.stage === "done") setCheer(Date.now());
  }, [state.stage]);

  useEffect(() => {
    if (!grumpy) return;
    const id = setTimeout(() => setGrumpy(false), 3000);
    return () => clearTimeout(id);
  }, [grumpy]);

  const resting = state.stage === "idle";
  const peek = resting && hover && props.hoverOpen !== false && !grumpy;
  const mood = grumpy ? "concerned" : STAGE_MOOD[state.stage];
  const tone = grumpy ? "warning" : stageTone(state.stage);
  const width = grumpy ? 380 : peek ? 440 : STAGE_WIDTH[state.stage];
  const title = stageTitle(state, count);

  const onTap = () => {
    const result = registerTap(taps, Date.now());
    setTaps(result.taps);
    if (result.tooMany) {
      setGrumpy(true);
      setTaps([]);
    }
  };

  const robot = (size: number, style?: CSSProperties) => (
    <span className="relative shrink-0" style={style}>
      <Robot size={size} mood={mood} cheerKey={cheer || undefined} interactive sound="counter" label="Le robot PharmaBoost" />
    </span>
  );

  let body: ReactNode;
  if (grumpy) {
    body = (
      <Row robot={robot(34)} title="Doucement !" sub="Trop de clics d'un coup — je reprends dans 3 secondes." />
    );
  } else if (peek) {
    body = (
      <div className="px-3.5 pt-3 pb-3.5">
        <Row robot={robot(34)} title={title} sub="Je surveille le comptoir. Scannez une boîte pour commencer." compact />
        <div className="mt-3 grid grid-cols-3 gap-2">
          {pills.map((pill) => (
            <div key={pill.key} className="rounded-2xl bg-white/[0.06] px-2.5 py-2">
              <p className="text-[10.5px] font-medium tracking-[0.04em] text-white/55 uppercase">{pill.label}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[14px] font-semibold tabular-nums">
                {pill.dot && <span className="size-1.5 rounded-full" style={{ background: pill.dot }} />}
                {pill.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  } else {
    switch (state.stage) {
      case "idle":
        body = (
          <div className="flex h-11 items-center gap-2.5 pr-4 pl-1.5">
            {robot(32)}
            <span className="min-w-0 flex-1 truncate text-[13px] text-white/80">{title}</span>
            <span className="size-2 shrink-0 rounded-full" style={{ background: C.accent, boxShadow: `0 0 8px ${C.accent}` }} aria-label="Poste connecté" />
          </div>
        );
        break;
      case "scan":
        body = (
          <div className="relative">
            <Row robot={robot(36)} title={T.scanTitle} sub={T.scanSub} icon={<ScanLine className="size-4" style={{ color: C.glow }} aria-hidden="true" />} />
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden">
              <span className="isl-scanbar block h-full w-1/3" style={{ background: `linear-gradient(90deg, transparent, ${C.glow}, transparent)` }} />
            </span>
          </div>
        );
        break;
      case "analyzing": {
        const steps = analysisSteps(props.drug, count);
        body = (
          <div className="px-3.5 pt-3 pb-3.5">
            <Row robot={robot(36)} title={title} sub={props.drug} compact />
            <ol className="mt-2.5 space-y-1 rounded-2xl bg-white/[0.05] px-3 py-2.5 font-mono text-[12px] leading-5">
              {steps.slice(0, Math.min(state.stepsDone + 1, steps.length)).map((step, i) => {
                const done = i < state.stepsDone;
                return (
                  <li key={step} className="isl-line flex items-center gap-2">
                    {done ? <Check className="size-3.5 shrink-0" style={{ color: C.accent }} strokeWidth={3} aria-hidden="true" /> : <Loader2 className="isl-spin size-3.5 shrink-0 text-white/60" aria-hidden="true" />}
                    <span className={cn("truncate", done ? "text-white/85" : "text-white/60")}>{step}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        );
        break;
      }
      case "ready":
        body = <Row robot={robot(38)} title={title} sub={`${T.forDrug}${props.drug}`} trailing={<span className="isl-pop rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: C.accent, color: "#04261A" }}>{count}</span>} />;
        break;
      case "advice":
        body = (
          <div className="px-3 pt-3 pb-3">
            <Row robot={robot(34)} title={title} sub={allAnswered(state, count) ? T.allDone : `${T.forDrug}${props.drug}`} compact />
            <ul className="mt-2.5 space-y-2">
              {items.map((item, index) => (
                <AdviceCard key={item.name} item={item} outcome={state.outcomes[index] ?? null} onAnswer={(outcome) => props.onAnswer(index, outcome)} />
              ))}
            </ul>
            <div className="mt-2.5 flex items-center gap-2">
              <button type="button" onClick={props.onAddEmail} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/[0.08] text-[12.5px] font-semibold text-white/90 transition-colors hover:bg-white/[0.14] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#36E8C8]">
                <Mail className="size-3.5" aria-hidden="true" /> {T.emailAdd}
              </button>
              <button type="button" onClick={props.onFinish} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#36E8C8]" style={{ background: C.accent, color: "#04261A" }}>
                <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> {T.finish}
              </button>
            </div>
          </div>
        );
        break;
      case "email":
        body = (
          <div className="px-3.5 pt-3 pb-3.5">
            <Row robot={robot(34)} title="Bilan conseil par e-mail" sub="Le patient reçoit ses conseils et vos coordonnées." compact />
            <form
              className="mt-3 flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                props.onSendEmail();
              }}
            >
              <label className="sr-only" htmlFor="ile-email">E-mail du patient</label>
              <input
                id="ile-email"
                type="email"
                value={state.email}
                onChange={(event) => props.onEmail(event.target.value)}
                placeholder="patient@exemple.fr"
                className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-[13.5px] text-white placeholder:text-white/35 focus:border-[#36E8C8] focus:outline-none"
              />
              <button type="submit" className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-bold" style={{ background: C.accent, color: "#04261A" }}>
                <Send className="size-3.5" aria-hidden="true" /> Envoyer
              </button>
            </form>
          </div>
        );
        break;
      case "emailSent":
        body = <Row robot={robot(36)} title="E-mail envoyé" sub={state.email || "Le bilan est parti."} trailing={<span className="isl-pop flex size-7 items-center justify-center rounded-full" style={{ background: C.accent }}><Check className="size-4 text-[#04261A]" strokeWidth={3} aria-hidden="true" /></span>} />;
        break;
      case "done": {
        const sold = items.filter((_, i) => state.outcomes[i] === "SOLD");
        body = (
          <Row
            robot={robot(40)}
            title={T.doneTitle}
            sub={sold.length ? `${sold.length} conseil${sold.length > 1 ? "s" : ""} vendu${sold.length > 1 ? "s" : ""}${sold[0]?.price ? ` · ${sold.map((item) => item.price).filter(Boolean).join(" + ")}` : ""}` : "Merci, à la prochaine délivrance."}
            trailing={<PartyPopper className="isl-pop size-5" style={{ color: C.challengeIcon }} aria-hidden="true" />}
          />
        );
        break;
      }
      case "alert":
        body = (
          <div className="px-3.5 pt-3 pb-3.5">
            <Row robot={robot(36)} title={alert?.title ?? T.readFirst} sub={T.duringSale} compact icon={<TriangleAlert className="size-4 text-[#F5A623]" aria-hidden="true" />} />
            <p className="mt-2.5 rounded-2xl px-3 py-2.5 text-[13px] leading-5" style={{ background: "rgba(245,166,35,0.12)", color: "#FFE2B0" }}>
              {alert?.text}
            </p>
            <div className="mt-2.5 flex justify-end">
              <button type="button" onClick={props.onDismissAlert} className="h-8 rounded-lg bg-white/[0.08] px-3 text-[12.5px] font-semibold text-white/90 hover:bg-white/[0.14]">
                Compris
              </button>
            </div>
          </div>
        );
        break;
      case "quiet":
        body = <Row robot={robot(34)} title={T.quiet} sub={T.quietSub} />;
        break;
    }
  }

  return (
    <div
      onClick={(event) => {
        if (!(event.target as Element).closest("button, input, form, a")) onTap();
      }}
    >
      <IslandShell
        width={width}
        tone={tone}
        contentKey={grumpy ? "grumpy" : peek ? "peek" : state.stage}
        label="Bannière PharmaBoost du comptoir"
        onPointerEnter={() => {
          if (leaveTimer.current) clearTimeout(leaveTimer.current);
          setHover(true);
        }}
        onPointerLeave={() => {
          leaveTimer.current = setTimeout(() => setHover(false), 350);
        }}
      >
        {body}
      </IslandShell>
    </div>
  );
}

function Row({ robot, title, sub, trailing, icon, compact }: { robot: ReactNode; title: string; sub?: string; trailing?: ReactNode; icon?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", compact ? "" : "px-3 py-2.5")}>
      {robot}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[14.5px] leading-5 font-semibold" aria-live="polite">
          {icon}
          {title}
        </p>
        {sub && <p className="truncate text-[12.5px] leading-[18px] text-white/60">{sub}</p>}
      </div>
      {trailing}
    </div>
  );
}

function AdviceCard({ item, outcome, onAnswer }: { item: IslandAdvice; outcome: IslandOutcome; onAnswer: (outcome: IslandOutcome) => void }) {
  const stock = item.stock ? STOCK[item.stock] : null;
  return (
    <li className="isl-line rounded-2xl p-2.5" style={{ background: C.panel, color: C.ink }}>
      <div className="flex gap-2.5">
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- vignette locale déjà à la bonne taille
          <img src={item.image} alt="" width={BANNER.sizes.thumb + 6} height={BANNER.sizes.thumb + 6} className="size-[52px] shrink-0 rounded-xl bg-white object-contain" />
        ) : (
          <span className="size-[52px] shrink-0 rounded-xl" style={{ background: C.line }} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-[13.5px] leading-5 font-bold">{item.name}</p>
            {item.price && stock && item.stock !== "UNKNOWN" && <p className="shrink-0 text-[13px] font-bold tabular-nums">{item.price}</p>}
          </div>
          {item.reason && <p className="truncate text-[12px] leading-[17px]" style={{ color: C.inkSoft }}>{item.reason}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.challenge && <Chip bg={C.challengeBg} fg={C.challengeFg}>★ {T.challenge}</Chip>}
            {item.shortDate && <Chip bg={C.dateBg} fg={C.dateFg}>{T.shortDate} {item.shortDate}</Chip>}
            {stock && <Chip bg={stock.bg} fg={stock.fg}>{stock.label}{item.quantity !== undefined && item.stock !== "OUT_OF_STOCK" ? ` · ${item.quantity}` : ""}</Chip>}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        {outcome ? (
          <>
            <span className="isl-pop inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg text-[12.5px] font-bold" style={outcome === "SOLD" ? { background: C.soldBg, color: C.soldFg } : { background: C.notSoldBg, color: C.notSoldFg }}>
              {outcome === "SOLD" && <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />}
              {outcome === "SOLD" ? T.sold : T.notSold}
            </span>
            <button type="button" onClick={() => onAnswer(null)} className="h-8 rounded-lg px-2.5 text-[12px] font-semibold hover:bg-black/5" style={{ color: C.inkSoft }}>
              {T.change}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => onAnswer("SOLD")} className="h-8 flex-1 rounded-lg text-[12.5px] font-bold transition-[filter] hover:brightness-105" style={{ background: C.soldBg, color: C.soldFg }}>
              {T.sold}
            </button>
            <button type="button" onClick={() => onAnswer("NOT_SOLD")} className="h-8 flex-1 rounded-lg text-[12.5px] font-bold transition-[filter] hover:brightness-95" style={{ background: C.notSoldBg, color: C.notSoldFg }}>
              {T.notSold}
            </button>
          </>
        )}
      </div>
    </li>
  );
}
