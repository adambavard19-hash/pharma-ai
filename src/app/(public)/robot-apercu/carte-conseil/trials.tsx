"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { HelixBackdrop } from "@/components/app/helix/helix-backdrop";

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

type Tab = "fiche" | "questions" | "aide";

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
  if (tab === "aide") return <HelpDemo tone={tone} />;
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
      {(["fiche", "questions", "aide"] as const).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onTab(id)}
          className={`rounded-lg px-4 py-1.5 text-[13.5px] font-semibold transition-colors ${tab === id ? (tone === "light" ? "bg-white text-[#0F2B26] shadow-sm" : "bg-white text-[#0F2B26]") : tone === "light" ? "text-[#5B6B66]" : "text-white/70"}`}
        >
          {TAB_LABEL[id]}
        </button>
      ))}
    </div>
  );
}

const TAB_LABEL: Record<Tab, string> = { fiche: "Fiche", questions: "Questions", aide: "Aide" };

/** L'onglet Aide, en exemple : le pharmacien écrit sa question sur le conseil, la réponse de l'aide s'affiche dessous. */
function HelpDemo({ tone }: { tone: "light" | "dark" }) {
  const [draft, setDraft] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const ink = tone === "light" ? "text-[#0F2B26]" : "text-white";
  const soft = tone === "light" ? "text-[#5B6B66]" : "text-white/65";
  return (
    <div className="space-y-3">
      <p className={`text-[13.5px] leading-5 ${soft}`}>Le patient pose une question à laquelle vous ne savez pas répondre ? Demandez à l&apos;aide, sur ce conseil.</p>
      {asked && (
        <div className="space-y-2">
          <p className="ml-8 rounded-2xl rounded-br-md bg-[#0E8A7B] px-3 py-2 text-[13.5px] text-white">{asked}</p>
          <p className={`mr-8 rounded-2xl rounded-bl-md px-3 py-2 text-[13.5px] ${tone === "light" ? "bg-[#F3F7F5]" : "bg-white/10"} ${ink}`}>La réponse de l&apos;aide s&apos;affiche ici, en trois phrases au plus, avec la source quand elle en a une.</p>
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim()) setAsked(draft.trim());
          setDraft("");
        }}
      >
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ex. : peut-on le prendre enceinte ?" className="h-10 min-w-0 flex-1 rounded-xl border border-[#D5E2DD] bg-white px-3 text-[13.5px] text-[#0F2B26] outline-none focus:border-[#0E8A7B]" />
        <button type="submit" className="h-10 rounded-xl bg-[#0E8A7B] px-3.5 text-[13px] font-bold text-white">Demander</button>
      </form>
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
        {(["fiche", "questions", "aide"] as const).map((id) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`-mb-px border-b-2 pb-2 text-[14px] font-semibold ${tab === id ? "border-[#0E8A7B] text-[#0F2B26]" : "border-transparent text-[#8A9A95]"}`}>
            {TAB_LABEL[id]}
          </button>
        ))}
      </div>
      <TabBody tab={tab} tone="light" />
      <Alternatives tone="light" />
      <Footer tone="light" />
    </div>
  );
}


/** E. L'ADN vivant derrière, la carte en verre clair par-dessus : la marque du site, le conseil bien lisible. */
function TrialE() {
  const [tab, setTab] = useState<Tab>("fiche");
  return (
    <div className="relative overflow-hidden rounded-[28px] bg-[#0B2A25]">
      <div className="absolute inset-0 isolate opacity-90">
        <HelixBackdrop position="contained" framing="app" lazy className="[&_canvas]:scale-[1.5]" />
      </div>
      <div className="relative m-3 space-y-5 rounded-[22px] bg-white/[0.88] p-5 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#0F2F2A] px-3 py-1 text-[12px] font-bold tracking-[0.1em] text-[#E8FF9C] uppercase">
            <span className="size-1.5 rounded-full bg-[#E8FF9C]" /> {ADVICE.family}
          </span>
          <span className="text-[12px] text-[#5B6B66]">{ADVICE.forDrug}</span>
        </div>
        <div className="grid grid-cols-[110px_1fr] items-center gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- photo studio locale */}
          <img src={ADVICE.photo} alt="" className="h-32 w-full object-contain" />
          <div>
            <p className="text-[28px] leading-[1.05] font-bold tracking-[-0.03em] text-[#0F2B26]">{ADVICE.name}</p>
            <p className="mt-2 text-[25px] font-bold text-[#0E8A7B]">{ADVICE.price}</p>
          </div>
        </div>
        <Reason className="text-[16px] leading-7 text-[#0F2B26]" />
        <Segmented tab={tab} onTab={setTab} tone="light" />
        <div className="rounded-2xl bg-white p-4 ring-1 ring-[#E3EBE8]"><TabBody tab={tab} tone="light" /></div>
        <Alternatives tone="light" />
        <Footer tone="light" />
      </div>
    </div>
  );
}

/** F. L'ADN vivant en bandeau, en haut de la carte, derrière la photo et le nom ; le reste en blanc, bien lisible. */
function TrialF() {
  const [tab, setTab] = useState<Tab>("fiche");
  return (
    <div className="overflow-hidden rounded-[28px] bg-white shadow-[0_30px_80px_-40px_rgba(15,43,38,0.45)]">
      <div className="relative h-[190px]">
        <div className="absolute inset-0 isolate">
          <HelixBackdrop position="contained" framing="app" lazy className="[&_canvas]:scale-[1.6]" />
        </div>
        <div className="relative flex h-full items-end gap-5 px-6 pb-5">
          <span className="flex size-28 shrink-0 items-center justify-center rounded-3xl bg-white p-2 shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element -- photo studio locale */}
            <img src={ADVICE.photo} alt="" className="max-h-full object-contain" />
          </span>
          <div className="pb-1">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/85 px-2.5 py-0.5 text-[11px] font-bold tracking-[0.12em] text-[#0F5C50] uppercase backdrop-blur">
              <span className="size-1.5 rounded-full bg-[#0E8A7B]" /> {ADVICE.family}
            </span>
            <p className="mt-1.5 text-[28px] leading-[1.02] font-bold tracking-[-0.035em] text-[#0F2B26]">{ADVICE.name}</p>
            <p className="mt-1 text-[22px] font-bold text-[#0E8A7B]">{ADVICE.price}</p>
          </div>
        </div>
      </div>
      <div className="space-y-5 p-6 pt-4">
        <p className="text-[12px] text-[#8A9A95]">{ADVICE.forDrug}</p>
        <Reason className="text-[16px] leading-7 text-[#0F2B26]" />
        <Segmented tab={tab} onTab={setTab} tone="light" />
        <div className="rounded-2xl bg-[#F6F9F8] p-4"><TabBody tab={tab} tone="light" /></div>
        <Alternatives tone="light" />
        <Footer tone="light" />
      </div>
    </div>
  );
}

/** G. Compact aéré : la carte d'aujourd'hui, mais avec de l'air — photo, nom, prix sur une ligne, le conseil dessous. */
function TrialG() {
  const [tab, setTab] = useState<Tab>("fiche");
  return (
    <div className="space-y-4 rounded-[24px] bg-white p-5 shadow-[0_20px_60px_-35px_rgba(15,43,38,0.5)]">
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- photo studio locale */}
        <img src={ADVICE.photo} alt="" className="size-16 shrink-0 rounded-2xl bg-[#F3F7F5] object-contain p-1.5" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[20px] font-bold tracking-[-0.02em] text-[#0F2B26]">{ADVICE.name}</p>
          <p className="text-[12px] text-[#8A9A95]">{ADVICE.family} · {ADVICE.forDrug}</p>
        </div>
        <p className="text-[20px] font-bold text-[#0E8A7B]">{ADVICE.price}</p>
      </div>
      <Reason className="rounded-xl bg-[#F3F7F5] px-4 py-3 text-[15px] leading-6 text-[#0F2B26]" />
      <Segmented tab={tab} onTab={setTab} tone="light" />
      <TabBody tab={tab} tone="light" />
      <Alternatives tone="light" />
      <Footer tone="light" />
    </div>
  );
}

/** Le fond de la bannière d'aujourd'hui : noir, l'hélice d'ADN du site qui y brille en vert (components/island/island-adn.ts). */
const ADN_GLOW = "invert(1) hue-rotate(180deg) brightness(1.15) contrast(1.25) saturate(1.3)";

/** H. La mise en page C (vert sombre, aéré) sur le fond actuel de notre bannière : l'ADN vivant, vert sur noir. */
function TrialH() {
  const [tab, setTab] = useState<Tab>("fiche");
  return (
    <div className="relative isolate overflow-hidden rounded-[28px] bg-[#07090A] shadow-[0_18px_40px_-14px_rgba(0,0,0,0.55),0_0_0_1px_rgba(232,255,156,0.18)]">
      <div className="absolute inset-0 -z-10" style={{ background: "#EFF3F1", filter: ADN_GLOW }}>
        <HelixBackdrop position="contained" framing="app" lazy className="[&_canvas]:scale-[1.6]" />
      </div>
      <div className="space-y-5 p-6 [text-shadow:0_1px_6px_rgba(0,0,0,0.75)]">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12px] font-bold tracking-[0.1em] text-[#E8FF9C] uppercase backdrop-blur">
            <span className="size-1.5 rounded-full bg-[#E8FF9C] shadow-[0_0_8px_rgba(232,255,156,0.9)]" /> {ADVICE.family}
          </span>
          <span className="text-[12px] text-white/70">{ADVICE.forDrug}</span>
        </div>
        <div className="grid grid-cols-[110px_1fr] items-center gap-5">
          <span className="flex h-32 items-center justify-center rounded-2xl bg-white p-2 [text-shadow:none]">
            {/* eslint-disable-next-line @next/next/no-img-element -- photo studio locale */}
            <img src={ADVICE.photo} alt="" className="max-h-full object-contain" />
          </span>
          <div>
            <p className="text-[27px] leading-[1.05] font-bold tracking-[-0.03em] text-white">{ADVICE.name}</p>
            <p className="mt-2 text-[25px] font-bold text-[#E8FF9C]">{ADVICE.price}</p>
          </div>
        </div>
        <div className="rounded-2xl bg-black/45 p-4 backdrop-blur-md">
          <Reason className="text-[16px] leading-7 text-white/90 [&_strong]:text-white" />
        </div>
        <div className="[text-shadow:none]"><Segmented tab={tab} onTab={setTab} tone="dark" /></div>
        <div className="rounded-2xl bg-black/45 p-4 backdrop-blur-md [text-shadow:none]"><TabBody tab={tab} tone="dark" /></div>
        <div className="[text-shadow:none]"><Alternatives tone="dark" /></div>
        <div className="[text-shadow:none]"><Footer tone="dark" /></div>
      </div>
    </div>
  );
}

/** Le fond ADN, noir (l'hélice brille en vert, comme la bannière d'aujourd'hui) ou blanc (l'encre du site sur papier clair). */
function AdnFrame({ dark, children }: { dark: boolean; children: ReactNode }) {
  return (
    <div className={`relative isolate overflow-hidden rounded-[28px] ${dark ? "bg-[#07090A] shadow-[0_18px_40px_-14px_rgba(0,0,0,0.55),0_0_0_1px_rgba(232,255,156,0.18)]" : "bg-[#EFF3F1] shadow-[0_30px_80px_-40px_rgba(15,43,38,0.45)] ring-1 ring-[#DCE6E2]"}`}>
      <div className="absolute inset-0 -z-10" style={dark ? { background: "#EFF3F1", filter: ADN_GLOW } : undefined}>
        <HelixBackdrop position="contained" framing="app" lazy className="[&_canvas]:scale-[1.6]" />
      </div>
      {children}
    </div>
  );
}

function Head({ dark, center = false }: { dark: boolean; center?: boolean }) {
  return (
    <div className={center ? "text-center" : "grid grid-cols-[110px_1fr] items-center gap-5"}>
      <span className={`flex items-center justify-center rounded-2xl bg-white p-2 shadow-md ${center ? "mx-auto h-36 w-32" : "h-32"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- photo studio locale */}
        <img src={ADVICE.photo} alt="" className="max-h-full object-contain" />
      </span>
      <div className={center ? "mt-4" : ""}>
        <p className={`text-[11.5px] font-bold tracking-[0.14em] uppercase ${dark ? "text-[#E8FF9C]" : "text-[#0E8A7B]"}`}>{ADVICE.family}</p>
        <p className={`mt-1 text-[28px] leading-[1.05] font-bold tracking-[-0.03em] ${dark ? "text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.75)]" : "text-[#0F2B26]"}`}>{ADVICE.name}</p>
        <p className={`mt-1.5 text-[24px] font-bold ${dark ? "text-[#E8FF9C] [text-shadow:0_1px_6px_rgba(0,0,0,0.75)]" : "text-[#0E8A7B]"}`}>{ADVICE.price}</p>
      </div>
    </div>
  );
}

/** I. ADN noir, et tout le conseil dans une grande carte blanche : le fond se voit autour, le texte se lit d'un coup. */
function TrialI() {
  const [tab, setTab] = useState<Tab>("fiche");
  return (
    <AdnFrame dark>
      <div className="p-4">
        <p className="mb-3 px-1 text-[12px] font-semibold text-white/75 [text-shadow:0_1px_6px_rgba(0,0,0,0.75)]">{ADVICE.forDrug}</p>
        <div className="space-y-5 rounded-[22px] bg-white/95 p-5">
          <Head dark={false} />
          <Reason className="text-[16px] leading-7 text-[#0F2B26]" />
          <Segmented tab={tab} onTab={setTab} tone="light" />
          <div className="rounded-2xl bg-[#F3F7F5] p-4"><TabBody tab={tab} tone="light" /></div>
          <Alternatives tone="light" />
          <Footer tone="light" />
        </div>
      </div>
    </AdnFrame>
  );
}

/** J. ADN noir, une colonne centrée : la photo au milieu, le nom et le prix dessous, en grand. */
function TrialJ() {
  const [tab, setTab] = useState<Tab>("fiche");
  return (
    <AdnFrame dark>
      <div className="space-y-5 p-6">
        <Head dark center />
        <div className="rounded-2xl bg-black/45 p-4 text-center backdrop-blur-md"><Reason className="text-[16px] leading-7 text-white/90 [&_strong]:text-white" /></div>
        <div className="flex justify-center"><Segmented tab={tab} onTab={setTab} tone="dark" /></div>
        <div className="rounded-2xl bg-black/45 p-4 backdrop-blur-md"><TabBody tab={tab} tone="dark" /></div>
        <Alternatives tone="dark" />
        <Footer tone="dark" />
      </div>
    </AdnFrame>
  );
}

/** K. ADN blanc (l'encre du site), panneaux en verre blanc : clair, lumineux, la marque du site. */
function TrialK() {
  const [tab, setTab] = useState<Tab>("fiche");
  return (
    <AdnFrame dark={false}>
      <div className="space-y-5 p-6">
        <Head dark={false} />
        <div className="rounded-2xl bg-white/80 p-4 backdrop-blur-md"><Reason className="text-[16px] leading-7 text-[#0F2B26]" /></div>
        <Segmented tab={tab} onTab={setTab} tone="light" />
        <div className="rounded-2xl bg-white/85 p-4 backdrop-blur-md"><TabBody tab={tab} tone="light" /></div>
        <Alternatives tone="light" />
        <Footer tone="light" />
      </div>
    </AdnFrame>
  );
}

/** L. ADN blanc en haut seulement, puis une grande carte blanche façon Kontoir : l'ADN signe, la carte parle. */
function TrialL() {
  const [tab, setTab] = useState<Tab>("fiche");
  return (
    <AdnFrame dark={false}>
      <div className="px-4 pt-24 pb-4">
        <div className="space-y-5 rounded-[22px] bg-white p-5 shadow-lg">
          <div className="-mt-20"><Head dark={false} /></div>
          <Reason className="rounded-2xl border-2 border-[#5E9C8C] p-4 text-[16px] leading-7 text-[#0F2B26]" />
          <div className="flex justify-end"><Segmented tab={tab} onTab={setTab} tone="light" /></div>
          <TabBody tab={tab} tone="light" />
          <Alternatives tone="light" />
          <Footer tone="light" />
        </div>
      </div>
    </AdnFrame>
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
      {/* Le défilement « doux » du site et le recalage du navigateur faisaient remonter la page toute seule pendant que les
          hélices se chargent : ici, défilement direct, sans recalage. */}
      <style>{"html{scroll-behavior:auto!important;overflow-anchor:none}*{overflow-anchor:none}"}</style>
      <div className="mx-auto max-w-[1880px]">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-[#0F2B26]">La carte du conseil, douze essais</h1>
        <p className="mt-1 text-[14.5px] text-[#5B6B66]">Le même conseil, douze façons de le montrer. Les essais sur l&apos;ADN (H à L) sont en premier. Cliquez sur « Fiche », « Questions » et « Aide ». Dites-moi la lettre que vous préférez. Exemple d&apos;écran.</p>
        <div className="mt-8 flex flex-wrap items-start gap-8">
          <Frame letter="H" title="C sur le fond actuel de la bannière (ADN noir)">
            <TrialH />
          </Frame>
          <Frame letter="I" title="ADN noir, grande carte blanche">
            <TrialI />
          </Frame>
          <Frame letter="J" title="ADN noir, une colonne centrée">
            <TrialJ />
          </Frame>
          <Frame letter="K" title="ADN blanc, verre blanc">
            <TrialK />
          </Frame>
          <Frame letter="L" title="ADN blanc en haut, carte façon Kontoir">
            <TrialL />
          </Frame>
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
          <Frame letter="E" title="ADN derrière, carte en verre clair">
            <TrialE />
          </Frame>
          <Frame letter="F" title="ADN en bandeau, en haut">
            <TrialF />
          </Frame>
          <Frame letter="G" title="Compact, mais aéré">
            <TrialG />
          </Frame>
        </div>
      </div>
    </main>
  );
}
