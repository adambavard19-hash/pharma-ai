"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";

/**
 * Le conseil d'exemple : un vrai produit du stock local avec sa photo studio (MAG 2 24H), pour une fatigue. Les textes sont
 * ceux qu'écrirait la bannière ; l'alternative est un autre produit du stock local. Exemple d'écran, jamais une vraie vente.
 */
const ADVICE = {
  family: "Fatigue",
  forDrug: "pour DOLIPRANE 1000 mg",
  name: "Mag 2 24H",
  full: "MAG 2 24H, 40 comprimés",
  price: "10,95 €",
  photo: "/produits-studio/3614810005611.jpg",
  reason: [
    { text: "Le " },
    { text: "magnésium", strong: true },
    { text: " aide à réduire la " },
    { text: "fatigue", strong: true },
    { text: ". Une prise par jour, " },
    { text: "libération prolongée sur 24 h", strong: true },
    { text: "." },
  ],
  posology: "1 comprimé par jour avec un verre d'eau, de préférence au cours d'un repas.",
  tell: ["À distance des cyclines et des quinolones (2 heures)."],
  questions: ["Depuis quand êtes-vous fatigué ?", "Dormez-vous bien en ce moment ?"],
  alternatives: [{ name: "Vitamine C 1000 Upsa", price: "3,70 €", photo: "/produits-studio/3585550001204.jpg", tag: "STOCK" as const }],
};

type Tab = "fiche" | "questions";

function Reason({ className = "" }: { className?: string }) {
  return (
    <p className={className}>
      {ADVICE.reason.map((part, index) => (part.strong ? <strong key={index}>{part.text}</strong> : <span key={index}>{part.text}</span>))}
    </p>
  );
}

function TabBody({ tab, tone }: { tab: Tab; tone: "light" | "dark" }) {
  const soft = tone === "light" ? "text-[#5B6B66]" : "text-white/65";
  const head = tone === "light" ? "text-[#0F2B26]" : "text-white";
  if (tab === "questions")
    return (
      <ol className="space-y-2">
        {ADVICE.questions.map((question, index) => (
          <li key={question} className={`flex gap-2.5 text-[14.5px] leading-6 ${head}`}>
            <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[#0E8A7B] text-[11px] font-bold text-white">{index + 1}</span>
            {question}
          </li>
        ))}
      </ol>
    );
  return (
    <div className="space-y-3">
      <div>
        <p className={`text-[11px] font-bold tracking-[0.12em] uppercase ${soft}`}>Posologie</p>
        <p className={`mt-1 text-[14.5px] leading-6 ${head}`}>{ADVICE.posology}</p>
      </div>
      <div>
        <p className={`text-[11px] font-bold tracking-[0.12em] uppercase ${soft}`}>À dire au patient</p>
        <ul className={`mt-1 space-y-1 text-[14px] leading-6 ${head}`}>
          {ADVICE.tell.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Segmented({ tab, onTab, tone }: { tab: Tab; onTab: (tab: Tab) => void; tone: "light" | "dark" }) {
  return (
    <div className={`inline-flex rounded-xl p-1 ${tone === "light" ? "border border-[#B9D8CE] bg-[#F3F7F5]" : "bg-white/10"}`}>
      {(["fiche", "questions"] as const).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onTab(id)}
          className={`rounded-lg px-4 py-1.5 text-[13.5px] font-semibold transition-colors ${tab === id ? (tone === "light" ? "bg-white text-[#0F2B26] shadow-sm" : "bg-white text-[#0F2B26]") : tone === "light" ? "text-[#5B6B66]" : "text-white/70"}`}
        >
          {id === "fiche" ? "Fiche" : "Questions"}
        </button>
      ))}
    </div>
  );
}

function Alternatives({ tone }: { tone: "light" | "dark" }) {
  return (
    <div>
      <p className={`text-[11.5px] font-bold tracking-[0.14em] uppercase ${tone === "light" ? "text-[#8A9A95]" : "text-white/50"}`}>S&apos;il n&apos;en veut pas</p>
      <div className="mt-2 space-y-2">
        {ADVICE.alternatives.map((alt) => (
          <div key={alt.name} className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${tone === "light" ? "border border-[#E3EBE8] bg-white" : "bg-white/[0.06]"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- photo studio locale */}
            <img src={alt.photo} alt="" className="size-11 rounded-xl bg-white object-contain p-1" />
            <span className={`flex-1 text-[14.5px] font-semibold ${tone === "light" ? "text-[#0F2B26]" : "text-white"}`}>{alt.name}</span>
            <span className="text-[14.5px] font-bold text-[#0E8A7B]">{alt.price}</span>
            <span className="rounded-md border border-[#BFD3FF] bg-[#EEF3FF] px-2 py-0.5 text-[10.5px] font-bold tracking-wide text-[#2F5BD3]">{alt.tag}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Footer({ tone }: { tone: "light" | "dark" }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`inline-flex items-center gap-1 text-[12px] font-semibold ${tone === "light" ? "text-[#8A9A95]" : "text-white/50"}`}>
        <ChevronLeft className="size-4" /> 1 / 3 <ChevronRight className="size-4" />
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0E8A7B] px-3.5 py-1.5 text-[12.5px] font-bold text-white">
        <Check className="size-3.5" strokeWidth={3} /> Terminer la vente
      </span>
    </div>
  );
}

/** A. Façon Kontoir : clair, la photo à gauche, le titre et le prix en grand, le conseil encadré. */
function TrialA() {
  const [tab, setTab] = useState<Tab>("fiche");
  return (
    <div className="space-y-5 rounded-[28px] bg-white p-6 shadow-[0_30px_80px_-40px_rgba(15,43,38,0.45)]">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#CFE3DC] bg-[#EEF6F3] px-3 py-1 text-[12px] font-bold tracking-[0.1em] text-[#0F5C50] uppercase">
          <span className="size-1.5 rounded-full bg-[#0E8A7B]" /> {ADVICE.family}
        </span>
        <span className="inline-flex size-8 items-center justify-center rounded-lg bg-[#F1F3F2] text-[#5B6B66]"><X className="size-4" /></span>
      </div>
      <div className="grid grid-cols-[120px_1fr] items-center gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element -- photo studio locale */}
        <img src={ADVICE.photo} alt="" className="h-36 w-full object-contain" />
        <div>
          <p className="text-[28px] leading-[1.05] font-bold tracking-[-0.03em] text-[#0F2B26]">{ADVICE.name}</p>
          <p className="mt-1 text-[12.5px] text-[#8A9A95]">{ADVICE.forDrug}</p>
          <div className="mt-2 flex items-center gap-2.5">
            <span className="rounded-md border border-[#F2D27A] bg-[#FFF5D6] px-2 py-0.5 text-[10.5px] font-bold tracking-wide text-[#9A6400]">MARGE</span>
            <span className="text-[26px] font-bold tracking-[-0.02em] text-[#0E8A7B]">{ADVICE.price}</span>
          </div>
        </div>
      </div>
      <div className="flex justify-end"><Segmented tab={tab} onTab={setTab} tone="light" /></div>
      <div className="rounded-2xl border-2 border-[#5E9C8C] p-4">
        {tab === "fiche" ? <Reason className="text-[16.5px] leading-7 text-[#0F2B26]" /> : <TabBody tab={tab} tone="light" />}
        {tab === "fiche" && <div className="mt-3 border-t border-[#E3EBE8] pt-3"><TabBody tab="fiche" tone="light" /></div>}
      </div>
      <Alternatives tone="light" />
      <Footer tone="light" />
    </div>
  );
}

/** B. Clair, une colonne : la photo en haut, au centre ; tout respire, une seule chose à la fois. */
function TrialB() {
  const [tab, setTab] = useState<Tab>("fiche");
  return (
    <div className="space-y-5 rounded-[28px] bg-[#FBFCFB] p-6 text-center ring-1 ring-[#E6EEEB]">
      <span className="text-[11.5px] font-bold tracking-[0.16em] text-[#0E8A7B] uppercase">{ADVICE.family} · {ADVICE.forDrug}</span>
      {/* eslint-disable-next-line @next/next/no-img-element -- photo studio locale */}
      <img src={ADVICE.photo} alt="" className="mx-auto h-40 object-contain" />
      <div>
        <p className="text-[30px] leading-[1.05] font-bold tracking-[-0.03em] text-[#0F2B26]">{ADVICE.name}</p>
        <p className="mt-2 text-[24px] font-bold text-[#0E8A7B]">{ADVICE.price}</p>
      </div>
      <Reason className="mx-auto max-w-[340px] text-[16px] leading-7 text-[#3E504B]" />
      <div className="flex justify-center"><Segmented tab={tab} onTab={setTab} tone="light" /></div>
      <div className="rounded-2xl bg-white p-4 text-left ring-1 ring-[#E6EEEB]"><TabBody tab={tab} tone="light" /></div>
      <div className="text-left"><Alternatives tone="light" /></div>
      <Footer tone="light" />
    </div>
  );
}

/** C. Notre vert sombre, en plus aéré : la même mise en page que Kontoir, dans nos couleurs. */
function TrialC() {
  const [tab, setTab] = useState<Tab>("fiche");
  return (
    <div className="space-y-5 rounded-[28px] bg-[#0F2F2A] p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12px] font-bold tracking-[0.1em] text-[#E8FF9C] uppercase">
          <span className="size-1.5 rounded-full bg-[#E8FF9C]" /> {ADVICE.family}
        </span>
        <span className="text-[12px] text-white/50">{ADVICE.forDrug}</span>
      </div>
      <div className="grid grid-cols-[110px_1fr] items-center gap-5">
        <span className="flex h-32 items-center justify-center rounded-2xl bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- photo studio locale */}
          <img src={ADVICE.photo} alt="" className="max-h-full object-contain" />
        </span>
        <div>
          <p className="text-[27px] leading-[1.05] font-bold tracking-[-0.03em] text-white">{ADVICE.name}</p>
          <p className="mt-2 text-[25px] font-bold text-[#E8FF9C]">{ADVICE.price}</p>
        </div>
      </div>
      <Reason className="text-[16px] leading-7 text-white/85 [&_strong]:text-white" />
      <Segmented tab={tab} onTab={setTab} tone="dark" />
      <div className="rounded-2xl bg-white/[0.06] p-4"><TabBody tab={tab} tone="dark" /></div>
      <Alternatives tone="dark" />
      <Footer tone="dark" />
    </div>
  );
}

/** D. Minimal : pas de cadre autour du conseil, de grands caractères, un filet vert à gauche ; l'essentiel d'un regard. */
function TrialD() {
  const [tab, setTab] = useState<Tab>("fiche");
  return (
    <div className="space-y-6 rounded-[28px] bg-white p-7 ring-1 ring-[#E6EEEB]">
      <div className="flex items-start gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element -- photo studio locale */}
        <img src={ADVICE.photo} alt="" className="h-28 w-24 shrink-0 object-contain" />
        <div className="min-w-0">
          <p className="text-[11.5px] font-bold tracking-[0.16em] text-[#8A9A95] uppercase">{ADVICE.family}</p>
          <p className="mt-1 text-[30px] leading-[1.02] font-bold tracking-[-0.035em] text-[#0F2B26]">{ADVICE.name}</p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-[22px] font-bold text-[#0E8A7B]">{ADVICE.price}</span>
            <span className="text-[12.5px] text-[#8A9A95]">{ADVICE.forDrug}</span>
          </p>
        </div>
      </div>
      <div className="border-l-4 border-[#0E8A7B] pl-4"><Reason className="text-[17px] leading-7 text-[#0F2B26]" /></div>
      <div className="flex gap-6 border-b border-[#E6EEEB]">
        {(["fiche", "questions"] as const).map((id) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`-mb-px border-b-2 pb-2 text-[14px] font-semibold ${tab === id ? "border-[#0E8A7B] text-[#0F2B26]" : "border-transparent text-[#8A9A95]"}`}>
            {id === "fiche" ? "Fiche" : "Questions"}
          </button>
        ))}
      </div>
      <TabBody tab={tab} tone="light" />
      <Alternatives tone="light" />
      <Footer tone="light" />
    </div>
  );
}

function Frame({ letter, title, children }: { letter: string; title: string; children: ReactNode }) {
  return (
    <section data-essai={letter}>
      <p className="mb-3 text-[15px] font-bold text-[#0F2B26]">
        <span className="mr-2 inline-flex size-7 items-center justify-center rounded-full bg-[#0F2B26] text-[13px] text-white">{letter}</span>
        {title}
      </p>
      <div className="w-[430px] max-w-full">{children}</div>
    </section>
  );
}

export function CardTrials() {
  return (
    <main className="min-h-screen bg-[#ECEFEE] px-4 py-10">
      <div className="mx-auto max-w-[1880px]">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-[#0F2B26]">La carte du conseil, quatre essais</h1>
        <p className="mt-1 text-[14.5px] text-[#5B6B66]">Le même conseil, quatre façons de le montrer. Cliquez sur « Fiche » et « Questions ». Dites-moi la lettre que vous préférez. Exemple d&apos;écran.</p>
        <div className="mt-8 flex flex-wrap items-start gap-8">
          <Frame letter="A" title="Façon Kontoir, clair">
            <TrialA />
          </Frame>
          <Frame letter="B" title="Clair, une colonne">
            <TrialB />
          </Frame>
          <Frame letter="C" title="Notre vert sombre, aéré">
            <TrialC />
          </Frame>
          <Frame letter="D" title="Minimal">
            <TrialD />
          </Frame>
        </div>
      </div>
    </main>
  );
}
