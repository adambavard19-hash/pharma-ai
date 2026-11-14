"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, ChevronLeft, Footprints, ShieldCheck } from "lucide-react";
import { OTHER_ANALYSIS_TEXT, libraryEntry } from "@/core/blood-test/library";
import { BloodBodyMap, Gauge, Help, KIND, kindOf, proposalFor, type BodyMapProps, type Kind } from "./body-map";

/**
 * Version 3 « Pas à pas » (fondateur, 14 nov. 2026) : la prise de sang racontée en cartes, comme des stories — le
 * résumé, puis chaque valeur à regarder (jauge, « C'est quoi ? », « Pourquoi ? », ce qui peut aider ou le médecin),
 * puis le récapitulatif. Mêmes données et mêmes textes relus que la carte du corps ; rien n'est enregistré.
 */

const INK = "#0F2F2A";
const SOFT = "#4B6A62";
const GRAD = "linear-gradient(135deg,#0E8A7B 0%,#0796B4 100%)";
const BG: Record<Kind, string> = {
  advice: "linear-gradient(160deg,#F29A1F 0%,#E0661A 100%)",
  doctor: "linear-gradient(160deg,#E5484D 0%,#B42323 100%)",
  ok: GRAD,
  unknown: GRAD,
};

function useMounted(delay: number) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return on;
}

function Ring({ ok, total }: { ok: number; total: number }) {
  const on = useMounted(200);
  const r = 46;
  const c = 2 * Math.PI * r;
  const part = total ? ok / total : 0;
  return (
    <div className="relative size-[112px] shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="12" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="#7CF0BF" strokeWidth="12" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={on ? c * (1 - part) : c} style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.2,.9,.25,1)" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div><p className="text-[28px] leading-none font-extrabold">{ok}/{total}</p><p className="text-[11px] font-semibold opacity-85">normales</p></div>
      </div>
    </div>
  );
}

export function BloodSteps({ analyses, proposals, audience, pharmacyName }: Omit<BodyMapProps, "title">) {
  const [i, setI] = useState(0);
  const items = useMemo(() => analyses.map((a) => ({ a, kind: kindOf(a, proposals), proposal: proposalFor(a, proposals) })), [analyses, proposals]);
  const flagged = items.filter((x) => x.kind === "advice" || x.kind === "doctor").sort((x, y) => Number(y.kind === "doctor") - Number(x.kind === "doctor"));
  const ok = items.filter((x) => x.kind === "ok").length;
  const advice = flagged.filter((x) => x.kind === "advice").length;
  const doctor = flagged.length - advice;
  const patient = audience === "patient";

  const headline =
    items.length === 0 ? "Aucune analyse chiffrée lue." : flagged.length === 0 ? "Tout ce qui a une norme est dans les normes." : ok >= flagged.length * 3 ? "Bonne nouvelle : presque tout est dans les normes." : `${flagged.length} valeurs à regarder ensemble.`;

  const slides: { bg: string; body: ReactNode }[] = [
    {
      bg: GRAD,
      body: (
        <div>
          <p className="text-[12.5px] font-extrabold tracking-[0.08em] uppercase opacity-80">{patient ? "Votre prise de sang" : "La prise de sang"}</p>
          <h2 className="mt-2 text-[30px] leading-[1.08] font-extrabold tracking-[-0.03em]">{headline}</h2>
          <div className="mt-6 flex items-center gap-5">
            <Ring ok={ok} total={items.length} />
            <div className="space-y-2 text-[15px] font-semibold">
              <p><span className="mr-2 inline-block size-3 rounded-full bg-[#7CF0BF]" />{ok} dans les normes</p>
              <p><span className="mr-2 inline-block size-3 rounded-full bg-[#FFC266]" />{advice} un peu {advice > 1 ? "basses" : "basse"}</p>
              <p><span className="mr-2 inline-block size-3 rounded-full bg-[#FF8A8A]" />{doctor} pour le médecin</p>
            </div>
          </div>
          {flagged.length > 0 && <p className="mt-6 text-[15.5px] leading-7 opacity-90">On regarde {flagged.length > 1 ? `les ${flagged.length} valeurs` : "la valeur"} à surveiller, une par une.</p>}
        </div>
      ),
    },
    ...flagged.map((x, k) => {
      const entry = libraryEntry(x.a.libraryId);
      const text = entry ?? OTHER_ANALYSIS_TEXT;
      const high = x.a.status === "high";
      return {
        bg: BG[x.kind],
        body: (
          <div>
            <p className="text-[12.5px] font-extrabold tracking-[0.08em] uppercase opacity-85">{k + 1} · {x.kind === "doctor" ? "À montrer au médecin" : high ? "Un peu haute" : "Un peu basse"}</p>
            <h2 className="mt-2 text-[30px] leading-[1.08] font-extrabold tracking-[-0.03em]">{entry?.name ?? x.a.label}</h2>
            <div className="mt-4 rounded-[22px] bg-white p-4" style={{ color: INK }}>
              <span className="mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: KIND[x.kind].bg, color: KIND[x.kind].fg }}>
                <span className="size-2 rounded-full" style={{ background: KIND[x.kind].dot }} />{KIND[x.kind].label}
              </span>
              <Gauge a={x.a} kind={x.kind} delay={250} />
              <p className="text-[14.5px] leading-6"><b>C&apos;est quoi ?</b> {text.what}</p>
              <p className="mt-2 text-[14px] leading-6" style={{ color: SOFT }}>
                <b style={{ color: INK }}>{high ? "Pourquoi on peut être au-dessus ?" : "Pourquoi on peut être en dessous ?"}</b> {high ? text.whyHigh : text.whyLow}
              </p>
              {entry && <p className="mt-1 text-[11.5px] text-[#94A3A0]">Causes fréquentes, en général : ce n&apos;est pas un diagnostic.</p>}
              {x.proposal && <Help proposal={x.proposal} audience={audience} pharmacyName={pharmacyName} />}
            </div>
          </div>
        ),
      };
    }),
    {
      bg: "linear-gradient(160deg,#0F2F2A 0%,#0E5A52 100%)",
      body: (
        <div>
          <p className="text-[12.5px] font-extrabold tracking-[0.08em] uppercase opacity-80">Le récapitulatif</p>
          <h2 className="mt-2 text-[28px] leading-[1.08] font-extrabold tracking-[-0.03em]">{patient ? "À présenter dans votre pharmacie PharmaBoost" : "Ce qu'on retient avec le patient"}</h2>
          <div className="mt-5 rounded-[18px] bg-white p-4 shadow-[0_24px_40px_-20px_rgba(0,0,0,.6)]" style={{ color: INK }}>
            {flagged.length === 0 ? (
              <p className="text-[14.5px] font-semibold">Toutes les analyses qui ont une norme imprimée sont dans les normes du laboratoire.</p>
            ) : (
              <div className="space-y-2 text-[14px]">
                {flagged.map((x, k) => (
                  <p key={x.a.libraryId ?? x.a.label} className={`flex justify-between gap-3 ${k < flagged.length - 1 ? "border-b border-[#EEF2F1] pb-2" : ""}`}>
                    <span>{libraryEntry(x.a.libraryId)?.name ?? x.a.label}</span>
                    <b style={{ color: KIND[x.kind].fg }}>{x.kind === "doctor" ? "voir le médecin" : x.a.status === "high" ? "un peu haute" : "un peu basse"}</b>
                  </p>
                ))}
              </div>
            )}
            <p className="mt-3 text-[12px] text-[#7C918C]">{ok} autres analyses dans les normes.</p>
          </div>
          <p className="mt-5 text-[14px] leading-6 opacity-90">{patient ? "Votre pharmacien choisit la référence et vous explique comment la prendre." : "Une explication générale, jamais un diagnostic : le pharmacien décide."}</p>
        </div>
      ),
    },
  ];

  const last = slides.length - 1;
  const step = Math.min(i, last);
  return (
    <div className="relative flex min-h-[560px] flex-col overflow-hidden rounded-[24px] text-white transition-[background] duration-500" style={{ background: slides[step].bg }}>
      <style>{`@keyframes pbSlide { from { opacity: 0; transform: translateX(24px) } to { opacity: 1; transform: none } }`}</style>
      <div className="flex gap-1.5 px-4 pt-4">
        {slides.map((_, k) => (
          <button key={k} type="button" onClick={() => setI(k)} aria-label={`Étape ${k + 1}`} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
            <span className="block h-full rounded-full bg-white transition-[width] duration-500" style={{ width: k <= step ? "100%" : "0%" }} />
          </button>
        ))}
      </div>
      <div key={step} className="flex-1 px-5 pt-5 pb-4" style={{ animation: "pbSlide .45s both" }}>{slides[step].body}</div>
      <div className="px-5 pb-4">
        <div className="flex gap-2.5">
          {step > 0 && (
            <button type="button" onClick={() => setI(step - 1)} className="grid h-12 w-12 place-items-center rounded-full bg-white/20 backdrop-blur" aria-label="Précédent"><ChevronLeft className="size-5" aria-hidden /></button>
          )}
          <button type="button" onClick={() => setI(step === last ? 0 : step + 1)} className="h-12 flex-1 rounded-full bg-white text-[15px] font-extrabold" style={{ color: INK }}>
            {step === 0 ? (flagged.length ? "C'est parti" : "Voir le récapitulatif") : step === last ? "Revoir depuis le début" : "Suivant"}
          </button>
        </div>
        <p className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 text-[11.5px] opacity-85"><ShieldCheck className="size-3.5" aria-hidden /> Rien n&apos;est enregistré : lue, puis oubliée.</p>
      </div>
    </div>
  );
}

/** Les deux façons de voir une prise de sang : la carte du corps (version 1) et le pas à pas (version 3). */
export function BloodExplained({ title, ...props }: BodyMapProps) {
  const [view, setView] = useState<"carte" | "pas">("carte");
  return (
    <div>
      {title && <h2 className="mb-2 text-[22px] leading-tight font-extrabold tracking-[-0.02em]" style={{ color: INK }}>{title}</h2>}
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-[#F1F5F4] p-1" role="tablist" aria-label="Façon de voir la prise de sang">
        {([
          { key: "carte", label: "Carte du corps", icon: Activity },
          { key: "pas", label: "Pas à pas", icon: Footprints },
        ] as const).map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={view === t.key} onClick={() => setView(t.key)} className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[13.5px] font-bold transition-all ${view === t.key ? "bg-white text-[#0F2F2A] shadow-sm" : "text-[#4B6A62]"}`}>
            <t.icon className="size-4" aria-hidden /> {t.label}
          </button>
        ))}
      </div>
      <div className="mt-3">{view === "carte" ? <BloodBodyMap {...props} /> : <BloodSteps {...props} />}</div>
    </div>
  );
}
