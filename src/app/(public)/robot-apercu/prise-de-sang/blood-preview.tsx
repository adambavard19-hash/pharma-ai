"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, Download, MapPin, ShieldCheck, Stethoscope, X } from "lucide-react";
import { ANALYSES, FAMILIES, HELP, STATUS_COLORS, SUMMARY, fmt, goesToDoctor, statusOf, type Analysis } from "./data";
import { BloodBodyMap } from "@/components/blood-test/body-map";
import { ruleForMarker } from "@/core/blood-test/rules";
import type { BloodAnalysis } from "@/core/blood-test/reading";
import type { BloodProposal } from "@/core/blood-test/propose";

const ACCENT = "#0E8A7B";
const GRAD = "linear-gradient(135deg,#0E8A7B 0%,#0796B4 100%)";
const INK = "#0F2F2A";
const SOFT = "#4B6A62";

/* ------------------------------------------------------------------ outils communs */

function useMounted(delay = 60) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return on;
}

function axis(a: Analysis) {
  const span = a.high - a.low;
  let min = Math.max(0, a.low - span * 0.6);
  let max = a.high + span * 0.6;
  min = Math.min(min, a.value - span * 0.15);
  max = Math.max(max, a.value + span * 0.15);
  min = Math.max(0, min);
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  return { pct };
}

function badge(a: Analysis) {
  if (goesToDoctor(a)) return STATUS_COLORS.doctor;
  return STATUS_COLORS[statusOf(a)];
}

/** La jauge : bande verte = normes du laboratoire, curseur « Vous êtes ici ». */
function Gauge({ a, big = false, delay = 60 }: { a: Analysis; big?: boolean; delay?: number }) {
  const on = useMounted(delay);
  const { pct } = axis(a);
  const c = badge(a);
  const pos = Math.min(98, Math.max(2, pct(a.value)));
  return (
    <div className={big ? "pt-12 pb-7" : "pt-8 pb-5"}>
      <div className={`relative rounded-full bg-[#EEF2F1] ${big ? "h-4" : "h-2.5"}`}>
        <div
          className="absolute inset-y-0 rounded-full bg-[#BFE9D6]"
          style={{ left: `${pct(a.low)}%`, width: `${pct(a.high) - pct(a.low)}%` }}
        />
        <div
          className="absolute top-1/2 transition-[left] duration-[1100ms] ease-[cubic-bezier(.2,.9,.25,1)]"
          style={{ left: `${on ? pos : 0}%` }}
        >
          <div
            className={`-translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_4px_12px_-2px_rgba(15,47,42,.35)] ${big ? "size-7" : "size-5"}`}
            style={{ background: c.dot }}
          />
          <div
            className={`absolute left-0 rounded-full px-2 py-0.5 font-bold whitespace-nowrap text-white ${pos < 18 ? "-translate-x-[14px]" : pos > 82 ? "-translate-x-[calc(100%-14px)]" : "-translate-x-1/2"} ${big ? "-top-[46px] text-[14px]" : "-top-[38px] text-[12px]"}`}
            style={{ background: c.dot }}
          >
            {big ? `Vous : ${fmt(a.value)} ${a.unit}` : fmt(a.value)}
          </div>
        </div>
      </div>
      <div className={`relative mt-2 text-[#7C918C] ${big ? "text-[13px]" : "text-[11px]"}`}>
        <span className="absolute -translate-x-1/2" style={{ left: `${pct(a.low)}%` }}>{fmt(a.low)}</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${pct(a.high)}%` }}>{fmt(a.high)}</span>
      </div>
    </div>
  );
}

function Pill({ a }: { a: Analysis }) {
  const c = badge(a);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: c.bg, color: c.fg }}>
      <span className="size-2 rounded-full" style={{ background: c.dot }} />
      {c.label}
    </span>
  );
}

function Footer() {
  return (
    <div className="mt-6 space-y-1.5 pb-4 text-center">
      <p className="text-[14px] font-semibold" style={{ color: ACCENT }}>Une question ? Demandez à votre pharmacien PharmaBoost.</p>
      <p className="inline-flex items-center gap-1.5 text-[12px] text-[#7C918C]"><ShieldCheck className="size-3.5" aria-hidden /> Rien n&apos;est enregistré : votre prise de sang est lue, puis oubliée.</p>
    </div>
  );
}

function ExampleTag() {
  return <p className="inline-flex rounded-full bg-[#FFF6D6] px-3 py-1 text-[12px] font-bold text-[#8A6A00]">Exemple — fausse prise de sang</p>;
}

/** Ce qui peut aider : compléments d'exemple validés par la pharmacienne, à récupérer dans sa pharmacie. */
function HelpBlock({ a, title = "Ce qui peut aider" }: { a: Analysis; title?: string }) {
  const products = HELP[a.id] ?? [];
  if (products.length === 0) return null;
  return (
    <div className="mt-5">
      <h4 className="text-[15px] font-extrabold" style={{ color: INK }}>{title}</h4>
      <div className="mt-2.5 space-y-2.5">
        {products.map((p) => (
          <div key={p.name + p.form} className="flex items-center gap-3 rounded-2xl border border-[#E3ECE9] bg-white p-3">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl text-[11px] font-extrabold text-white" style={{ background: GRAD }}>{a.id === "vitd" ? "D3" : "B12"}</div>
            <div className="flex-1">
              <p className="text-[15px] font-bold" style={{ color: INK }}>{p.name}</p>
              <p className="text-[13px]" style={{ color: SOFT }}>{p.form} · {p.note}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-2 rounded-2xl bg-[#E6F6EF] px-3 py-2.5 text-[13.5px] font-semibold text-[#0F7A5A]"><MapPin className="size-4 shrink-0" aria-hidden /> À récupérer dans votre pharmacie PharmaBoost</p>
      <p className="mt-2 text-[12.5px] leading-5 text-[#7C918C]">Votre pharmacien choisit la référence et vous explique comment la prendre. Conseils validés par la pharmacienne de PharmaBoost.</p>
    </div>
  );
}

function DoctorBlock() {
  return (
    <div className="mt-5 flex gap-3 rounded-2xl bg-[#FDECEC] p-3.5">
      <Stethoscope className="mt-0.5 size-5 shrink-0 text-[#B42323]" aria-hidden />
      <div>
        <p className="text-[15px] font-extrabold text-[#B42323]">À montrer à votre médecin</p>
        <p className="mt-0.5 text-[13.5px] leading-5 text-[#7A2A2A]">Pour cette valeur, pas de complément : c&apos;est votre médecin qui regarde ce qu&apos;il faut faire.</p>
      </div>
    </div>
  );
}

/** La fiche détaillée d'une analyse, dans une feuille qui monte du bas. */
function Detail({ a }: { a: Analysis }) {
  const s = statusOf(a);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[22px] leading-tight font-extrabold tracking-[-0.02em]" style={{ color: INK }}>{a.name}</h3>
      </div>
      <div className="mt-2"><Pill a={a} /></div>
      <Gauge a={a} big delay={120} />
      <p className="text-[12.5px] text-[#7C918C]">Bande verte : les normes du laboratoire ({fmt(a.low)} – {fmt(a.high)} {a.unit}).</p>
      <div className="mt-4 rounded-2xl bg-[#F4F8F7] p-3.5">
        <h4 className="text-[13px] font-extrabold tracking-[0.06em] uppercase" style={{ color: ACCENT }}>C&apos;est quoi ?</h4>
        <p className="mt-1 text-[15.5px] leading-6" style={{ color: INK }}>{a.what}</p>
      </div>
      {s !== "high" && (
        <div className="mt-3 rounded-2xl bg-[#F4F8F7] p-3.5">
          <h4 className="text-[13px] font-extrabold tracking-[0.06em] uppercase" style={{ color: ACCENT }}>Pourquoi on peut être en dessous ?</h4>
          <p className="mt-1 text-[15px] leading-6" style={{ color: INK }}>{a.whyLow}</p>
        </div>
      )}
      {s !== "low" && (
        <div className="mt-3 rounded-2xl bg-[#F4F8F7] p-3.5">
          <h4 className="text-[13px] font-extrabold tracking-[0.06em] uppercase" style={{ color: ACCENT }}>Pourquoi on peut être au-dessus ?</h4>
          <p className="mt-1 text-[15px] leading-6" style={{ color: INK }}>{a.whyHigh}</p>
        </div>
      )}
      <p className="mt-2 text-[12px] text-[#7C918C]">Ce sont des causes fréquentes, en général : ce n&apos;est pas un diagnostic.</p>
      {goesToDoctor(a) ? <DoctorBlock /> : s === "low" ? <HelpBlock a={a} /> : null}
      {s === "low" && !goesToDoctor(a) && <DownloadButton />}
      <Footer />
    </div>
  );
}

function DownloadButton() {
  return (
    <button type="button" className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-bold text-white shadow-[0_10px_24px_-12px_rgba(14,138,123,.8)]" style={{ background: GRAD }}>
      <Download className="size-4" aria-hidden /> Télécharger ma fiche
    </button>
  );
}

function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <div className={`fixed inset-0 z-30 ${open ? "" : "pointer-events-none invisible delay-300"}`}>
      <div className={`absolute inset-0 bg-[#0F2F2A]/35 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} onClick={onClose} />
      <div
        className={`absolute inset-x-0 bottom-0 max-h-[88%] overflow-y-auto rounded-t-[28px] bg-white px-5 pt-3 pb-2 shadow-[0_-20px_40px_-20px_rgba(15,47,42,.4)] transition-transform duration-[420ms] ease-[cubic-bezier(.2,.9,.25,1)] ${open ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="sticky top-0 z-10 -mx-5 flex items-center justify-between bg-white px-5 pb-2">
          <span className="mx-auto h-1.5 w-10 rounded-full bg-[#DDE6E3]" />
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer" className="absolute top-3 right-4 z-20 grid size-8 place-items-center rounded-full bg-[#F1F5F4]"><X className="size-4" aria-hidden /></button>
        {open && children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Version 1 : carte du corps */

/** Version 1 : la carte du corps PARTAGÉE (src/components/blood-test/body-map.tsx), nourrie ici par la fausse prise de sang. */
const RULES_BY_ID = { vitd: ruleForMarker("VITAMIN_D"), b12: ruleForMarker("B12") } as const;

const FAKE_ANALYSES: BloodAnalysis[] = ANALYSES.map((a) => {
  const status = statusOf(a);
  return {
    libraryId: a.id,
    label: a.name,
    marker: a.id === "vitd" ? "VITAMIN_D" : a.id === "b12" ? "B12" : a.id === "b9" ? "FOLATE" : a.id === "ferritine" ? "FERRITIN" : a.id === "mg" ? "MAGNESIUM" : a.id === "zinc" ? "ZINC" : null,
    value: a.value,
    unit: a.unit,
    refLow: a.low === 0 ? null : a.low,
    refHigh: a.high,
    status,
    veryLow: status === "low" && a.value < a.low / 2,
  };
});

const FAKE_PROPOSALS: BloodProposal[] = FAKE_ANALYSES.filter((a) => a.status !== "ok").map((a) => {
  const finding = { label: a.label, marker: a.marker, direction: a.status === "high" ? ("HIGH" as const) : ("LOW" as const), value: a.value, unit: a.unit, refLow: a.refLow, refHigh: a.refHigh, veryLow: a.veryLow };
  const rule = a.libraryId === "vitd" || a.libraryId === "b12" ? RULES_BY_ID[a.libraryId] : null;
  if (!rule || a.status === "high") return { finding, kind: "DOCTOR", reason: "Valeur au-dessus des normes du laboratoire : à montrer à votre médecin.", rule: null, products: [] };
  return { finding, kind: "ADVICE", reason: rule.pharmacistSentence, rule: { key: rule.key, title: rule.title, pharmacistSentence: rule.pharmacistSentence, patientSentence: rule.patientSentence, cautions: rule.cautions }, products: [] };
});

function BodyMap() {
  return (
    <div className="px-5 pt-5">
      <ExampleTag />
      <h2 className="mt-3 text-[28px] leading-[1.1] font-extrabold tracking-[-0.03em]" style={{ color: INK }}>Votre prise de sang, sur votre corps</h2>
      <div className="mt-2"><BloodBodyMap analyses={FAKE_ANALYSES} proposals={FAKE_PROPOSALS} audience="patient" pharmacyName="Pharmacie du Centre" /></div>
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------ Version 2 : jauges */

function GaugesList() {
  const [open, setOpen] = useState<Analysis | null>(null);
  const outOfRange = ANALYSES.filter((a) => statusOf(a) !== "ok");
  return (
    <div className="relative">
      <div className="px-5 pt-5">
        <ExampleTag />
        <h2 className="mt-3 text-[28px] leading-[1.1] font-extrabold tracking-[-0.03em]" style={{ color: INK }}>Mes résultats</h2>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { n: SUMMARY.ok, l: "dans les normes", c: STATUS_COLORS.ok },
            { n: SUMMARY.low, l: "un peu basses", c: STATUS_COLORS.low },
            { n: SUMMARY.doctor, l: "pour le médecin", c: STATUS_COLORS.doctor },
          ].map((k, i) => (
            <div key={k.l} className="rounded-2xl p-3" style={{ background: k.c.bg, animation: `pbRise .5s ${i * 90}ms both` }}>
              <p className="text-[30px] leading-none font-extrabold" style={{ color: k.c.fg }}>{k.n}</p>
              <p className="mt-1 text-[12.5px] leading-4 font-semibold" style={{ color: k.c.fg }}>{k.l}</p>
            </div>
          ))}
        </div>

        <h3 className="mt-6 text-[13px] font-extrabold tracking-[0.08em] uppercase" style={{ color: INK }}>À regarder en premier</h3>
        <div className="mt-2.5 space-y-2.5">
          {outOfRange.map((a, i) => (
            <Row key={a.id} a={a} i={i} onOpen={() => setOpen(a)} highlight />
          ))}
        </div>

        {FAMILIES.map((f) => {
          const list = ANALYSES.filter((a) => a.family === f.key && statusOf(a) === "ok");
          if (list.length === 0) return null;
          return (
            <div key={f.key}>
              <h3 className="mt-6 text-[13px] font-extrabold tracking-[0.08em] uppercase" style={{ color: INK }}>{f.label}</h3>
              <div className="mt-2.5 space-y-2.5">
                {list.map((a, i) => <Row key={a.id} a={a} i={i} onOpen={() => setOpen(a)} />)}
              </div>
            </div>
          );
        })}
        <Footer />
      </div>
      <Sheet open={open !== null} onClose={() => setOpen(null)}>{open && <Detail a={open} />}</Sheet>
    </div>
  );
}

function Row({ a, i, onOpen, highlight = false }: { a: Analysis; i: number; onOpen: () => void; highlight?: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`block w-full rounded-[20px] bg-white px-4 pt-3.5 text-left shadow-[0_8px_24px_-16px_rgba(15,47,42,.35)] transition active:scale-[.99] ${highlight ? "ring-2" : ""}`}
      style={{ animation: `pbRise .5s ${120 + i * 60}ms both`, ...(highlight ? { ["--tw-ring-color" as string]: badge(a).bg } : {}) }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[16px] font-bold" style={{ color: INK }}>{a.name}</span>
        {highlight ? <Pill a={a} /> : <span className="text-[12.5px] text-[#94A3A0]">{a.unit}</span>}
      </div>
      <Gauge a={a} delay={200 + i * 60} />
    </button>
  );
}

/* ------------------------------------------------------------------ Version 3 : pas à pas */

function Steps() {
  const vitd = ANALYSES.find((a) => a.id === "vitd")!;
  const b12 = ANALYSES.find((a) => a.id === "b12")!;
  const ldl = ANALYSES.find((a) => a.id === "ldl")!;
  const [i, setI] = useState(0);

  const valueCard = (a: Analysis, title: string) => (
    <div>
      <p className="text-[13px] font-extrabold tracking-[0.08em] uppercase opacity-80">{title}</p>
      <h2 className="mt-2 text-[34px] leading-[1.05] font-extrabold tracking-[-0.03em]">{a.name}</h2>
      <div className="mt-5 rounded-[24px] bg-white p-4 text-[#0F2F2A]">
        <Pill a={a} />
        <Gauge a={a} big delay={250} />
        <p className="text-[15.5px] leading-6"><b>C&apos;est quoi ?</b> {a.what}</p>
        <p className="mt-3 text-[15px] leading-6" style={{ color: SOFT }}>
          <b style={{ color: INK }}>{statusOf(a) === "high" ? "Pourquoi on peut être au-dessus ?" : "Pourquoi on peut être en dessous ?"}</b> {statusOf(a) === "high" ? a.whyHigh : a.whyLow}
        </p>
        {goesToDoctor(a) && <DoctorBlock />}
      </div>
    </div>
  );

  const slides: { bg: string; body: ReactNode }[] = [
    {
      bg: GRAD,
      body: (
        <div>
          <p className="text-[13px] font-extrabold tracking-[0.08em] uppercase opacity-80">Votre prise de sang</p>
          <h2 className="mt-2 text-[36px] leading-[1.05] font-extrabold tracking-[-0.03em]">Bonne nouvelle : presque tout est dans les normes.</h2>
          <div className="mt-6 flex items-center gap-5">
            <Ring />
            <div className="space-y-2 text-[15.5px] font-semibold">
              <p><span className="mr-2 inline-block size-3 rounded-full bg-[#7CF0BF]" />{SUMMARY.ok} dans les normes</p>
              <p><span className="mr-2 inline-block size-3 rounded-full bg-[#FFC266]" />{SUMMARY.low} un peu basses</p>
              <p><span className="mr-2 inline-block size-3 rounded-full bg-[#FF8A8A]" />{SUMMARY.doctor} pour le médecin</p>
            </div>
          </div>
          <p className="mt-6 text-[16px] leading-7 opacity-90">On regarde ensemble les {SUMMARY.low + SUMMARY.doctor} valeurs à surveiller, une par une.</p>
        </div>
      ),
    },
    { bg: "linear-gradient(160deg,#F29A1F 0%,#E0661A 100%)", body: valueCard(vitd, "1 · Un peu basse") },
    { bg: "linear-gradient(160deg,#F2A93B 0%,#D9741C 100%)", body: valueCard(b12, "2 · Un peu basse") },
    { bg: "linear-gradient(160deg,#E5484D 0%,#B42323 100%)", body: valueCard(ldl, "3 · À montrer au médecin") },
    {
      bg: GRAD,
      body: (
        <div>
          <p className="text-[13px] font-extrabold tracking-[0.08em] uppercase opacity-80">Ce qui peut aider</p>
          <h2 className="mt-2 text-[32px] leading-[1.05] font-extrabold tracking-[-0.03em]">Pour la vitamine D et la B12</h2>
          <div className="mt-4 rounded-[24px] bg-white p-4 text-[#0F2F2A]">
            <HelpBlock a={vitd} title="Pour la vitamine D" />
            <HelpBlock a={b12} title="Pour la vitamine B12" />
          </div>
        </div>
      ),
    },
    {
      bg: "linear-gradient(160deg,#0F2F2A 0%,#0E5A52 100%)",
      body: (
        <div>
          <p className="text-[13px] font-extrabold tracking-[0.08em] uppercase opacity-80">Votre fiche</p>
          <h2 className="mt-2 text-[32px] leading-[1.05] font-extrabold tracking-[-0.03em]">À présenter dans votre pharmacie PharmaBoost</h2>
          <div className="mt-5 rotate-[-1.5deg] rounded-[18px] bg-white p-4 text-[#0F2F2A] shadow-[0_24px_40px_-20px_rgba(0,0,0,.6)]">
            <p className="text-[11px] font-extrabold tracking-[0.1em] uppercase" style={{ color: ACCENT }}>PharmaBoost · fiche conseil</p>
            <p className="mt-1 text-[17px] font-extrabold">À présenter à votre pharmacien</p>
            <div className="mt-3 space-y-2 text-[14px]">
              <p className="flex justify-between border-b border-[#EEF2F1] pb-2"><span>Vitamine D</span><b className="text-[#A75A00]">un peu basse</b></p>
              <p className="flex justify-between border-b border-[#EEF2F1] pb-2"><span>Vitamine B12</span><b className="text-[#A75A00]">un peu basse</b></p>
              <p className="flex justify-between"><span>LDL</span><b className="text-[#B42323]">voir le médecin</b></p>
            </div>
          </div>
          <div className="mt-6"><DownloadButton /></div>
        </div>
      ),
    },
  ];

  const last = slides.length - 1;
  return (
    <div className="relative flex min-h-full flex-col text-white transition-[background] duration-500" style={{ background: slides[i].bg }}>
      <div className="flex gap-1.5 px-4 pt-4">
        {slides.map((_, k) => (
          <span key={k} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
            <span className="block h-full rounded-full bg-white transition-[width] duration-500" style={{ width: k <= i ? "100%" : "0%" }} />
          </span>
        ))}
      </div>
      <div className="px-4 pt-2"><span className="inline-flex rounded-full bg-white/20 px-3 py-1 text-[12px] font-bold">Exemple — fausse prise de sang</span></div>
      <div key={i} className="flex-1 px-5 pt-6 pb-6" style={{ animation: "pbSlide .45s both" }}>{slides[i].body}</div>
      <div className="sticky bottom-0 bg-gradient-to-t from-black/30 via-black/10 to-transparent px-5 pt-8 pb-4">
        <div className="flex gap-2.5">
          {i > 0 && (
            <button type="button" onClick={() => setI(i - 1)} className="grid h-12 w-12 place-items-center rounded-full bg-white/20 backdrop-blur" aria-label="Précédent"><ChevronLeft className="size-5" aria-hidden /></button>
          )}
          <button type="button" onClick={() => setI(i === last ? 0 : i + 1)} className="h-12 flex-1 rounded-full bg-white text-[15.5px] font-extrabold" style={{ color: INK }}>
            {i === 0 ? "C'est parti" : i === last ? "Revoir depuis le début" : "Suivant"}
          </button>
        </div>
        <p className="mt-3 text-center text-[13px] font-semibold">Une question ? Demandez à votre pharmacien PharmaBoost.</p>
        <p className="mt-0.5 text-center text-[11.5px] opacity-80">Rien n&apos;est enregistré : votre prise de sang est lue, puis oubliée.</p>
      </div>
    </div>
  );
}

function Ring() {
  const on = useMounted(200);
  const r = 46;
  const c = 2 * Math.PI * r;
  const okPart = SUMMARY.ok / SUMMARY.total;
  return (
    <div className="relative size-[120px] shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="12" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="#7CF0BF" strokeWidth="12" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={on ? c * (1 - okPart) : c} style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.2,.9,.25,1)" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div><p className="text-[30px] leading-none font-extrabold">{SUMMARY.ok}/{SUMMARY.total}</p><p className="text-[11px] font-semibold opacity-85">normales</p></div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ la page */

const VERSIONS = [
  { key: "corps", label: "Version 1 · Carte du corps" },
  { key: "jauges", label: "Version 2 · Jauges" },
  { key: "pas", label: "Version 3 · Pas à pas" },
] as const;

export function BloodPreview() {
  const [v, setV] = useState<(typeof VERSIONS)[number]["key"]>("corps");
  return (
    <div className="min-h-screen bg-[#EEF3F1] px-4 py-8">
      <style>{`
        @keyframes pbRise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        @keyframes pbSlide { from { opacity: 0; transform: translateX(24px) } to { opacity: 1; transform: none } }
        @keyframes pbPop { from { opacity: 0; scale: .6 } to { opacity: 1; scale: 1 } }
      `}</style>
      <div className="mx-auto max-w-[760px] text-center">
        <p className="text-[12px] font-extrabold tracking-[0.1em] uppercase" style={{ color: ACCENT }}>Maquette · appli des patients</p>
        <h1 className="mt-1 text-[30px] font-extrabold tracking-[-0.03em]" style={{ color: INK }}>Ma prise de sang expliquée</h1>
        <p className="mt-1 text-[14.5px]" style={{ color: SOFT }}>Trois façons de montrer la même prise de sang. Tout se clique.</p>
        <div className="mt-5 inline-flex flex-wrap justify-center gap-1.5 rounded-full bg-white p-1.5 shadow-sm">
          {VERSIONS.map((x) => (
            <button key={x.key} type="button" onClick={() => setV(x.key)} className={`rounded-full px-4 py-2 text-[13.5px] font-bold transition ${v === x.key ? "text-white" : "text-[#4B6A62] hover:bg-[#F1F5F4]"}`} style={v === x.key ? { background: GRAD } : undefined}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative mx-auto mt-6 h-[840px] w-full max-w-[400px] [transform:translateZ(0)] overflow-hidden rounded-[44px] border-[10px] border-[#0F2F2A] bg-[#F6F9F8] shadow-[0_40px_80px_-40px_rgba(15,47,42,.6)]">
        <div className="absolute inset-0 overflow-y-auto" key={v}>
          {v === "corps" && <BodyMap />}
          {v === "jauges" && <GaugesList />}
          {v === "pas" && <Steps />}
        </div>
      </div>
    </div>
  );
}
