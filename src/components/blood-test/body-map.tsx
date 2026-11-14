"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, MapPin, Stethoscope, X } from "lucide-react";
import { OTHER_ANALYSIS_TEXT, libraryEntry, type OrganKey } from "@/core/blood-test/library";
import type { BloodAnalysis } from "@/core/blood-test/reading";
import type { BloodProposal } from "@/core/blood-test/propose";
import { ORGANS, SILHOUETTE, type Organ } from "./anatomy";

/**
 * La carte du corps d'une prise de sang (fondateur, 14 nov. 2026) : chaque analyse lue est un point sur l'organe qu'elle
 * renseigne ; on touche un organe, la carte zoome, et chaque analyse s'explique avec sa jauge et les textes RELUS de la
 * bibliothèque. Les conseils viennent des propositions (règles validées) : produits du stock au comptoir, phrase patient
 * dans l'appli ; tout ce qui n'a pas de conseil validé renvoie au médecin. Rien n'est enregistré ici : tout vit à l'écran.
 */

const W = 240;
const H = 480;
const ACCENT = "#0E8A7B";
const INK = "#0F2F2A";
const SOFT = "#4B6A62";

type Kind = "ok" | "advice" | "doctor" | "unknown";

const KIND: Record<Kind, { dot: string; bg: string; fg: string; label: string }> = {
  ok: { dot: "#22B07D", bg: "#E6F6EF", fg: "#0F7A5A", label: "Dans les normes" },
  advice: { dot: "#F29A1F", bg: "#FFF3E0", fg: "#A75A00", label: "Un peu bas" },
  doctor: { dot: "#E5484D", bg: "#FDECEC", fg: "#B42323", label: "À montrer au médecin" },
  unknown: { dot: "#A3B3AF", bg: "#F1F5F4", fg: "#5F726D", label: "Sans norme imprimée" },
};

const SHORT: Record<OrganKey, string> = {
  thyroide: "Thyroïde",
  coeur: "Cœur",
  foie: "Foie",
  estomac: "Intestin",
  pancreas: "Pancréas",
  reins: "Reins",
  sang: "Sang",
  os: "Os",
  muscles: "Muscles",
};

const fr = (n: number) => String(n).replace(".", ",");

export type BodyMapProps = {
  analyses: BloodAnalysis[];
  proposals: BloodProposal[];
  /** Comptoir : produits du stock et phrase du pharmacien. Appli : phrase du patient et « à récupérer ». */
  audience: "counter" | "patient";
  pharmacyName?: string | null;
  /** Titre au-dessus de la phrase de résumé (facultatif). */
  title?: string;
};

function proposalFor(a: BloodAnalysis, proposals: BloodProposal[]): BloodProposal | null {
  return proposals.find((p) => (a.marker !== null && p.finding.marker === a.marker) || p.finding.label === a.label) ?? null;
}

function kindOf(a: BloodAnalysis, proposals: BloodProposal[]): Kind {
  if (a.status === "ok") return "ok";
  if (a.status === "unknown") return "unknown";
  return proposalFor(a, proposals)?.kind === "ADVICE" ? "advice" : "doctor";
}

const RANK: Record<Kind, number> = { doctor: 3, advice: 2, ok: 1, unknown: 0 };

function worst(kinds: Kind[]): Kind {
  return kinds.reduce<Kind>((acc, k) => (RANK[k] > RANK[acc] ? k : acc), "unknown");
}

function useMounted(delay: number) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return on;
}

/** Jauge : bande verte = normes du laboratoire, curseur = la valeur. Sans aucune borne imprimée : la valeur seule. */
function Gauge({ a, kind, delay = 80 }: { a: BloodAnalysis; kind: Kind; delay?: number }) {
  const on = useMounted(delay);
  if (a.refLow === null && a.refHigh === null) {
    return <p className="pt-1 pb-3 text-[13px]" style={{ color: SOFT }}>Valeur : <b style={{ color: INK }}>{fr(a.value)}{a.unit ? ` ${a.unit}` : ""}</b> · pas de norme imprimée</p>;
  }
  const lo = a.refLow ?? 0;
  const hi = a.refHigh ?? Math.max(lo * 2, a.value * 1.25, lo + 1);
  const span = hi - lo || Math.abs(hi) || 1;
  let min = Math.max(0, lo - span * 0.6);
  let max = hi + span * 0.6;
  min = Math.max(0, Math.min(min, a.value - span * 0.15));
  max = Math.max(max, a.value + span * 0.15);
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const pos = Math.min(98, Math.max(2, pct(a.value)));
  const c = KIND[kind];
  return (
    <div className="pt-8 pb-5">
      <div className="relative h-2.5 rounded-full bg-[#EEF2F1]">
        <div className="absolute inset-y-0 rounded-full bg-[#BFE9D6]" style={{ left: `${pct(lo)}%`, width: `${Math.max(1, pct(hi) - pct(lo))}%` }} />
        <div className="absolute top-1/2 transition-[left] duration-[1100ms] ease-[cubic-bezier(.2,.9,.25,1)]" style={{ left: `${on ? pos : 0}%` }}>
          <div className="size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_4px_12px_-2px_rgba(15,47,42,.35)]" style={{ background: c.dot }} />
          <div
            className={`absolute -top-[38px] left-0 rounded-full px-2 py-0.5 text-[12px] font-bold whitespace-nowrap text-white ${pos < 18 ? "-translate-x-[14px]" : pos > 82 ? "-translate-x-[calc(100%-14px)]" : "-translate-x-1/2"}`}
            style={{ background: c.dot }}
          >
            {fr(a.value)}{a.unit ? ` ${a.unit}` : ""}
          </div>
        </div>
      </div>
      <div className="relative mt-2 text-[11px] text-[#7C918C]">
        {a.refLow !== null && <span className="absolute -translate-x-1/2" style={{ left: `${pct(lo)}%` }}>{fr(a.refLow)}</span>}
        {a.refHigh !== null && <span className="absolute -translate-x-1/2" style={{ left: `${pct(hi)}%` }}>{fr(a.refHigh)}</span>}
      </div>
    </div>
  );
}

function Help({ proposal, audience, pharmacyName }: { proposal: BloodProposal; audience: BodyMapProps["audience"]; pharmacyName?: string | null }) {
  if (proposal.kind === "DOCTOR") {
    return (
      <div className="mt-3 flex gap-2.5 rounded-2xl bg-[#FDECEC] p-3">
        <Stethoscope className="mt-0.5 size-4 shrink-0 text-[#B42323]" aria-hidden />
        <div>
          <p className="text-[14px] font-extrabold text-[#B42323]">À montrer au médecin</p>
          <p className="mt-0.5 text-[13px] leading-5 text-[#7A2A2A]">{proposal.reason}</p>
        </div>
      </div>
    );
  }
  const rule = proposal.rule;
  return (
    <div className="mt-3 rounded-2xl border border-[#F5DDB5] bg-[#FFFAF2] p-3">
      <p className="text-[14px] font-extrabold" style={{ color: INK }}>Ce qui peut aider</p>
      <p className="mt-1 text-[13.5px] leading-5" style={{ color: INK }}>{audience === "counter" ? rule?.pharmacistSentence : rule?.patientSentence}</p>
      {audience === "counter" &&
        (proposal.products.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {proposal.products.map((product) => (
              <li key={product.id} className="flex items-center gap-2.5 rounded-xl bg-white px-2.5 py-2">
                {product.imageUrl ? <img src={product.imageUrl} alt="" className="size-9 rounded-lg object-contain" /> : <span className="size-9 rounded-lg bg-[#F1F5F4]" />}
                <span className="flex-1 text-[13.5px] font-semibold" style={{ color: INK }}>{product.name}</span>
                {product.salePriceCents > 0 && <span className="text-[12.5px]" style={{ color: SOFT }}>{(product.salePriceCents / 100).toFixed(2).replace(".", ",")} €</span>}
                <span className="rounded-full bg-[#E6F6EF] px-2 py-0.5 text-[11px] font-bold text-[#0F7A5A]">En stock</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 rounded-xl bg-white px-2.5 py-2 text-[12.5px]" style={{ color: SOFT }}>Aucune référence de votre stock ne correspond pour l&apos;instant.</p>
        ))}
      {rule && rule.cautions.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[12px] leading-[1.4]" style={{ color: SOFT }}>
          {rule.cautions.map((caution) => <li key={caution}>• {caution}</li>)}
        </ul>
      )}
      {audience === "patient" && (
        <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-[#E6F6EF] px-2.5 py-2 text-[12.5px] font-semibold text-[#0F7A5A]">
          <MapPin className="size-3.5 shrink-0" aria-hidden /> À récupérer dans votre pharmacie PharmaBoost{pharmacyName ? ` : ${pharmacyName}` : ""}
        </p>
      )}
    </div>
  );
}

function AnalysisRow({ a, kind, proposal, audience, pharmacyName, delay }: { a: BloodAnalysis; kind: Kind; proposal: BloodProposal | null; audience: BodyMapProps["audience"]; pharmacyName?: string | null; delay: number }) {
  const [open, setOpen] = useState(kind === "advice" || kind === "doctor");
  const entry = libraryEntry(a.libraryId);
  const text = entry ?? OTHER_ANALYSIS_TEXT;
  const c = KIND[kind];
  return (
    <div className="rounded-2xl border border-[#E3ECE9] bg-white px-3.5 pt-2.5 pb-1">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="text-[15px] leading-tight font-bold" style={{ color: INK }}>{entry?.name ?? a.label}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: c.bg, color: c.fg }}>{c.label}</span>
          <ChevronDown className={`size-4 text-[#94A3A0] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </span>
      </button>
      {entry && entry.name !== a.label && <p className="text-[11.5px] text-[#94A3A0]">Sur le compte rendu : {a.label}</p>}
      <Gauge a={a} kind={kind} delay={delay} />
      {open && (
        <div className="pb-2.5">
          <p className="text-[13.5px] leading-5" style={{ color: INK }}><b style={{ color: ACCENT }}>C&apos;est quoi ?</b> {text.what}</p>
          {a.status === "low" && <p className="mt-1.5 text-[13px] leading-5" style={{ color: SOFT }}><b style={{ color: INK }}>Pourquoi on peut être en dessous ?</b> {text.whyLow}</p>}
          {a.status === "high" && <p className="mt-1.5 text-[13px] leading-5" style={{ color: SOFT }}><b style={{ color: INK }}>Pourquoi on peut être au-dessus ?</b> {text.whyHigh}</p>}
          {(a.status === "low" || a.status === "high") && entry && <p className="mt-1 text-[11.5px] text-[#94A3A0]">Causes fréquentes, en général : ce n&apos;est pas un diagnostic.</p>}
          {proposal && (a.status === "low" || a.status === "high") && <Help proposal={proposal} audience={audience} pharmacyName={pharmacyName} />}
        </div>
      )}
    </div>
  );
}

function summary(kinds: Kind[]): string {
  const n = kinds.length;
  const ok = kinds.filter((k) => k === "ok").length;
  const advice = kinds.filter((k) => k === "advice").length;
  const doctor = kinds.filter((k) => k === "doctor").length;
  const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;
  if (n === 0) return "Aucune analyse chiffrée n'a pu être lue sur ce document.";
  if (advice + doctor === 0) return `Sur ${plural(n, "analyse", "analyses")}, toutes celles qui ont une norme imprimée sont dans les normes du laboratoire.`;
  const parts = [`${plural(ok, "est dans les normes", "sont dans les normes")}`];
  if (advice > 0) parts.push(plural(advice, "un peu basse", "un peu basses"));
  if (doctor > 0) parts.push(`${doctor} à montrer au médecin`);
  const last = parts.pop();
  return `Sur ${plural(n, "analyse", "analyses")}, ${parts.length ? `${parts.join(", ")} et ${last}` : last}.`;
}

export function BloodBodyMap({ analyses, proposals, audience, pharmacyName, title }: BodyMapProps) {
  const [selected, setSelected] = useState<OrganKey | "autre" | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const items = useMemo(
    () => analyses.map((a) => ({ a, kind: kindOf(a, proposals), proposal: proposalFor(a, proposals), organ: libraryEntry(a.libraryId)?.organ ?? null })),
    [analyses, proposals],
  );
  const byOrgan = useMemo(() => {
    const map = new Map<OrganKey, typeof items>();
    for (const item of items) if (item.organ) map.set(item.organ, [...(map.get(item.organ) ?? []), item]);
    return map;
  }, [items]);
  const others = items.filter((item) => item.organ === null);
  const organ = selected && selected !== "autre" ? (ORGANS.find((o) => o.key === selected) ?? null) : null;
  const panelItems = selected === "autre" ? others : selected ? (byOrgan.get(selected) ?? []) : [];

  useEffect(() => {
    if (selected) panelRef.current?.scrollTo({ top: 0 });
  }, [selected]);

  const zoom = organ
    ? { transform: `translate(${50 - (organ.cx / W) * 100}%, ${22 - (organ.cy / H) * 100}%) scale(2.2)`, transformOrigin: `${(organ.cx / W) * 100}% ${(organ.cy / H) * 100}%` }
    : { transform: "none", transformOrigin: "50% 50%" };
  const dotsOf = (o: Organ, count: number): [number, number][] =>
    Array.from({ length: count }, (_, k) => o.dots[k] ?? [o.cx + Math.cos(k * 1.3) * (6 + k), o.cy + Math.sin(k * 1.3) * (6 + k)]);

  return (
    <div className="relative w-full">
      <style>{`@keyframes pbmRise { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }`}</style>
      {title && <h2 className="text-[22px] leading-tight font-extrabold tracking-[-0.02em]" style={{ color: INK }}>{title}</h2>}
      <p className="mt-1 text-[15.5px] leading-6" style={{ color: INK }}>{summary(items.map((i) => i.kind))}</p>

      <div className="relative mt-2 h-[480px] overflow-hidden rounded-[24px] bg-[#F6FAF9]">
        <div className="absolute top-[14px] left-1/2 h-[440px] w-[220px] -translate-x-1/2">
          <div className="absolute inset-0 transition-transform duration-[700ms] ease-[cubic-bezier(.2,.9,.25,1)]" style={zoom}>
            <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full overflow-visible" aria-hidden>
              <defs>
                <linearGradient id="pbm-skin" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#E3F4EF" />
                  <stop offset="1" stopColor="#D3ECF2" />
                </linearGradient>
              </defs>
              <circle cx={SILHOUETTE.head.cx} cy={SILHOUETTE.head.cy} r={SILHOUETTE.head.r} fill="url(#pbm-skin)" />
              <path d={SILHOUETTE.body} fill="url(#pbm-skin)" />
              <path d="M96 124 C108 132 132 132 144 124 M92 140 C108 150 132 150 148 140 M90 156 C108 166 132 166 150 156 M92 270 C104 282 136 282 148 270" stroke="#FFFFFF" strokeWidth="1.6" fill="none" opacity=".8" />
              {ORGANS.map((o) => {
                const list = byOrgan.get(o.key) ?? [];
                const has = list.length > 0;
                const k = has ? worst(list.map((i) => i.kind)) : "unknown";
                const c = KIND[k];
                const dim = organ ? organ.key !== o.key : !has;
                return (
                  <g key={o.key} className={has ? "cursor-pointer" : ""} style={{ opacity: dim ? (has ? 0.18 : 0.35) : 1, transition: "opacity .5s" }} onClick={has ? () => setSelected(o.key) : undefined}>
                    {o.paths.map((d, i) => {
                      const closed = d.trim().endsWith("Z");
                      return <path key={i} d={d} fill={closed ? c.dot : "none"} fillOpacity={closed ? (has ? 0.26 : 0.12) : 0} stroke={c.dot} strokeOpacity={has ? 0.9 : 0.4} strokeWidth={closed ? 1.4 : 2} strokeDasharray={o.behind ? "3 2.5" : undefined} strokeLinecap="round" />;
                    })}
                    {dotsOf(o, list.length).map(([x, y], i) => {
                      const dc = KIND[list[i].kind];
                      return (
                        <g key={i}>
                          {(list[i].kind === "advice" || list[i].kind === "doctor") && (
                            <circle cx={x} cy={y} r="4" fill={dc.dot} opacity=".5">
                              <animate attributeName="r" values="4;9;4" dur="2s" repeatCount="indefinite" />
                              <animate attributeName="opacity" values=".5;0;.5" dur="2s" repeatCount="indefinite" />
                            </circle>
                          )}
                          <circle cx={x} cy={y} r="3.6" fill={dc.dot} stroke="#FFFFFF" strokeWidth="1.4" />
                        </g>
                      );
                    })}
                    {has && !organ && <path d={`M${o.cx} ${o.cy} L${o.side === "l" ? 30 : 210} ${o.labelY}`} stroke={c.dot} strokeOpacity=".45" strokeWidth="1" strokeDasharray="2 2" fill="none" />}
                  </g>
                );
              })}
            </svg>
          </div>

          {ORGANS.map((o, i) => {
            const list = byOrgan.get(o.key) ?? [];
            if (list.length === 0) return null;
            const k = worst(list.map((item) => item.kind));
            const c = KIND[k];
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => setSelected(o.key)}
                className={`absolute -translate-y-1/2 transition-opacity duration-300 ${organ ? "pointer-events-none opacity-0" : "opacity-100"}`}
                style={{ top: `${(o.labelY / H) * 100}%`, ...(o.side === "l" ? { right: `${100 - (30 / W) * 100}%` } : { left: `${(210 / W) * 100}%` }) }}
              >
                <span className={`flex items-center gap-1.5 rounded-full bg-white/90 py-1 whitespace-nowrap shadow-[0_6px_14px_-8px_rgba(15,47,42,.45)] ${o.side === "l" ? "flex-row-reverse pr-2 pl-2.5" : "pr-2.5 pl-2"}`} style={{ animation: `pbmRise .5s ${i * 60}ms both` }}>
                  <span className="size-2 shrink-0 rounded-full" style={{ background: c.dot }} />
                  <span className="text-[12.5px] leading-none font-bold" style={{ color: k === "ok" || k === "unknown" ? INK : c.fg }}>{SHORT[o.key]}</span>
                  <span className="text-[11px] leading-none font-semibold text-[#94A3A0]">{list.length}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div
          ref={panelRef}
          className={`absolute inset-x-2.5 bottom-2.5 max-h-[64%] overflow-y-auto rounded-[22px] bg-white/95 p-3.5 shadow-[0_20px_40px_-20px_rgba(15,47,42,.5)] backdrop-blur transition-all duration-500 ease-[cubic-bezier(.2,.9,.25,1)] ${selected ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-8 opacity-0"}`}
        >
          {selected && (
            <div key={selected}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[19px] leading-tight font-extrabold tracking-[-0.02em]" style={{ color: INK }}>{organ ? organ.label : "Autres analyses"}</h3>
                  <p className="mt-0.5 text-[13px] leading-5" style={{ color: SOFT }}>{organ ? organ.what : OTHER_ANALYSIS_TEXT.what}</p>
                </div>
                <button type="button" onClick={() => setSelected(null)} aria-label="Revoir tout le corps" className="grid size-8 shrink-0 place-items-center rounded-full bg-[#F1F5F4]"><X className="size-4" aria-hidden /></button>
              </div>
              <div className="mt-2 space-y-2">
                {panelItems.map((item, i) => (
                  <AnalysisRow key={`${item.a.libraryId ?? item.a.label}`} a={item.a} kind={item.kind} proposal={item.proposal} audience={audience} pharmacyName={pharmacyName} delay={350 + i * 80} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap justify-center gap-x-3 gap-y-1.5 text-[12px] font-semibold" style={{ color: SOFT }}>
        {(["ok", "advice", "doctor"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: KIND[k].dot }} />{KIND[k].label}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-[#94A3A0]" /> Dans le dos</span>
      </div>
      <p className="mt-1.5 text-center text-[12.5px]" style={{ color: SOFT }}>{selected ? "Touchez une analyse pour la comprendre." : "Touchez un organe : un point = une analyse."}</p>

      {others.length > 0 && (
        <button type="button" onClick={() => setSelected("autre")} className="mt-3 flex w-full items-center justify-between rounded-2xl border border-[#E3ECE9] bg-white px-3.5 py-2.5 text-left">
          <span className="text-[14px] font-bold" style={{ color: INK }}>Autres analyses <span className="font-semibold text-[#94A3A0]">({others.length})</span></span>
          <span className="flex gap-1">{others.slice(0, 8).map((item) => <span key={item.a.label} className="size-2.5 rounded-full" style={{ background: KIND[item.kind].dot }} />)}</span>
        </button>
      )}
    </div>
  );
}
