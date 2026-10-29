"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Check, ChevronDown, Hourglass, MessageCircle, RotateCcw, Sparkles, Star } from "lucide-react";
import { CrossScan, PillScan, TRIAL_CSS, useScanLoop, type Phase } from "../scan/trials";

/**
 * Une vente d'EXEMPLE (de vrais produits du stock local et leurs photos studio). Même vente pour tous les essais : seule la
 * bannière qui suit le scan change. Le scan est l'essai A (la croix) ou C (la gélule), au choix en haut de la page.
 */
type Advice = {
  name: string;
  drug: string;
  price: string;
  margin: string;
  stock: number;
  image: string;
  challenge?: string;
  shortDate?: string;
  say: string;
  questions: string[];
};

const ADVICES: Advice[] = [
  {
    name: "Cicaplast Lèvres baume réparateur",
    drug: "CURACNÉ 20 mg",
    price: "7,95 €",
    margin: "2,27 €",
    stock: 12,
    image: "/produits-studio/0000030106659.jpg",
    challenge: "Challenge La Roche-Posay",
    say: "« Ce traitement dessèche les lèvres dès les premières semaines : ce baume les répare, plusieurs fois par jour. »",
    questions: ["Vos lèvres sont-elles déjà sèches ?", "Avez-vous déjà un baume ?"],
  },
  {
    name: "Lactibiane Imedia",
    drug: "IMODIUM 2 mg",
    price: "10,80 €",
    margin: "4,42 €",
    stock: 7,
    image: "/produits-studio/3401528534805.jpg",
    shortDate: "30/11/26",
    say: "« Pour aider votre flore à se remettre de la diarrhée : un sachet par jour pendant quelques jours. »",
    questions: ["Depuis combien de temps ?", "Avez-vous de la fièvre ?"],
  },
];
const ROUTINE = {
  title: "Routine peau sous isotrétinoïne",
  total: "50,15 €",
  steps: [
    { label: "Nettoyer", name: "Cleanance gel", image: "/produits-studio/3282770207774.jpg" },
    { label: "Hydrater", name: "Effaclar H Iso-Biome", image: "/produits-studio/3337875777797.jpg" },
    { label: "Protéger", name: "Anthelios UVMune 400", image: "/produits-studio/3337875797665.jpg" },
  ],
};
const TOTAL = "6,69 €";

type Scan = "A" | "C";

/** La photo studio, sur sa tuile blanche. */
function Photo({ src, size = 44, className = "" }: { src: string; size?: number; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ${className}`} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- photos studio locales, essais seulement */}
      <img src={src} alt="" className="size-full object-contain p-0.5" />
    </span>
  );
}

/** Ce qui s'ouvre au clic sur un conseil : la phrase à dire et les deux questions. Le même contenu dans tous les essais. */
function Detail({ advice, light = false }: { advice: Advice; light?: boolean }) {
  return (
    <div className={`detail-in mt-2 rounded-xl px-3 py-2.5 text-[12.5px] leading-5 ${light ? "bg-[#F1F7F4] text-[#23443C]" : "bg-white/[0.06] text-white/85"}`}>
      <p className={`mb-1 flex items-center gap-1.5 text-[10.5px] font-bold tracking-[0.1em] uppercase ${light ? "text-[#0E7C5A]" : "text-[#E8FF9C]"}`}>
        <MessageCircle className="size-3" aria-hidden="true" /> À dire au patient
      </p>
      <p>{advice.say}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {advice.questions.map((question) => (
          <span key={question} className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${light ? "border border-[#CFE3DA] bg-white" : "border border-white/15"}`}>
            {question}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Les photos de la routine, qui clignotent doucement : au clic, la routine s'ouvre. */
function RoutineStrip({ light = false, open, onToggle }: { light?: boolean; open: boolean; onToggle: () => void }) {
  return (
    <div>
      <button type="button" onClick={onToggle} className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left ${light ? "hover:bg-[#F1F7F4]" : "hover:bg-white/[0.05]"}`}>
        <span className="flex -space-x-2">
          {ROUTINE.steps.map((step, i) => (
            <span key={step.label} className={open ? "" : "soft-blink"} style={{ animationDelay: `${i * 0.25}s` }}>
              <Photo src={step.image} size={26} className={`rounded-lg border-2 ${light ? "border-white" : "border-[#062621]"}`} />
            </span>
          ))}
        </span>
        <span className={`min-w-0 flex-1 text-[12.5px] font-semibold ${light ? "text-[#0F2F2A]" : "text-white"}`}>
          Routine · {ROUTINE.steps.length} produits
        </span>
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""} ${light ? "text-[#4D6B64]" : "text-white/60"}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="detail-in mt-1 flex items-stretch gap-1.5 px-1">
          {ROUTINE.steps.map((step, i) => (
            <div key={step.label} className="flex flex-1 items-center gap-1.5">
              <div className={`flex flex-1 flex-col items-center gap-1 rounded-xl p-1.5 text-center ${light ? "bg-[#F1F7F4]" : "bg-white/[0.06]"}`}>
                <Photo src={step.image} size={34} />
                <span className={`text-[10.5px] font-bold uppercase ${light ? "text-[#0E7C5A]" : "text-[#E8FF9C]"}`}>{step.label}</span>
                <span className={`line-clamp-1 text-[10.5px] ${light ? "text-[#4D6B64]" : "text-white/65"}`}>{step.name}</span>
              </div>
              {i < ROUTINE.steps.length - 1 && <ArrowRight className={`size-3 shrink-0 ${light ? "text-[#9DB5AD]" : "text-white/30"}`} aria-hidden="true" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Le bouton de fin, comme FIN dans LGPI. */
function Fin({ light = false }: { light?: boolean }) {
  return (
    <button type="button" className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-bold ${light ? "bg-[#0F2F2A] text-white" : "bg-[#E8FF9C] text-[#04261A]"}`}>
      <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> Terminer
    </button>
  );
}

/* ------------------------------------------------------------------ 1 · Cartes photo */
function PhotoCards() {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [routine, setRoutine] = useState(false);
  return (
    <div className="glass-dark w-[400px] max-w-full p-2.5">
      {ADVICES.map((advice, i) => (
        <div key={advice.name} className="row-in" style={{ animationDelay: `${i * 90}ms` }}>
          <button type="button" onClick={() => setOpenAt(openAt === i ? null : i)} className="flex w-full items-center gap-3 rounded-2xl px-1.5 py-1.5 text-left hover:bg-white/[0.05]">
            <Photo src={advice.image} size={48} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold text-white">{advice.name}</span>
              <span className="block truncate text-[11.5px] text-white/55">pour {advice.drug}</span>
              <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-semibold">
                <span className="inline-flex items-center gap-1 text-[#7BE0B0]"><span className="size-1.5 rounded-full bg-[#3DDC84]" />{advice.stock} en stock</span>
                {advice.challenge && <span className="inline-flex items-center gap-1 text-[#E8FF9C]"><Star className="size-3 fill-current" aria-hidden="true" />Challenge</span>}
                {advice.shortDate && <span className="inline-flex items-center gap-1 text-[#FF9C8F]"><Hourglass className="size-3" aria-hidden="true" />{advice.shortDate}</span>}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-[15px] font-bold text-white tabular-nums">{advice.price}</span>
              <span className="block text-[11px] font-semibold text-[#E8FF9C] tabular-nums">+{advice.margin}</span>
            </span>
          </button>
          {openAt === i && <Detail advice={advice} />}
        </div>
      ))}
      <div className="mx-1.5 my-1.5 h-px bg-white/10" />
      <RoutineStrip open={routine} onToggle={() => setRoutine((v) => !v)} />
      <div className="mt-1.5 flex items-center justify-between px-1.5">
        <span className="text-[12px] text-white/60">Jusqu&apos;à <b className="text-[#E8FF9C] tabular-nums">{TOTAL}</b> sur cette vente</span>
        <Fin />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 2 · Le ticket de pharmacie (clair) */
function Ticket() {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [routine, setRoutine] = useState(false);
  return (
    <div className="ticket w-[400px] max-w-full">
      <div className="flex items-center gap-2 rounded-t-[18px] bg-[#0E7C5A] px-3.5 py-2 text-white">
        <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true"><path d="M7 1h6v6h6v6h-6v6H7v-6H1V7h6z" fill="#fff" /></svg>
        <span className="text-[13px] font-bold">Conseils PharmaBoost</span>
        <span className="ml-auto text-[11.5px] text-white/80">2 boîtes scannées</span>
      </div>
      <div className="px-3.5 pt-2 pb-3">
        {ADVICES.map((advice, i) => (
          <div key={advice.name} className="row-in border-b border-dashed border-[#D5E3DD] py-2 last:border-0" style={{ animationDelay: `${i * 90}ms` }}>
            <button type="button" onClick={() => setOpenAt(openAt === i ? null : i)} className="flex w-full items-center gap-2.5 text-left">
              <Photo src={advice.image} size={40} className="border border-[#E3ECE8]" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1 text-[13.5px] font-bold text-[#0F2F2A]">
                  <span className="truncate">{advice.name}</span>
                  <span className="leaders min-w-4 flex-1" />
                  <span className="shrink-0 tabular-nums">{advice.price}</span>
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-[#4D6B64]">pour {advice.drug}</span>
                  <span className="rounded bg-[#E3F6EC] px-1.5 font-semibold text-[#0E7C5A]">Stock {advice.stock}</span>
                  <span className="rounded bg-[#FFF6CC] px-1.5 font-semibold text-[#6B5800]">Marge {advice.margin}</span>
                  {advice.challenge && <span className="rounded bg-[#EEFFC2] px-1.5 font-semibold text-[#3F5A00]">★ Challenge</span>}
                  {advice.shortDate && <span className="rounded bg-[#FFE4E0] px-1.5 font-semibold text-[#A3271A]">Date courte {advice.shortDate}</span>}
                </span>
              </span>
            </button>
            {openAt === i && <Detail advice={advice} light />}
          </div>
        ))}
        <div className="mt-1">
          <RoutineStrip light open={routine} onToggle={() => setRoutine((v) => !v)} />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[12px] text-[#4D6B64]">Marge possible <b className="text-[#0E7C5A] tabular-nums">{TOTAL}</b></span>
          <Fin light />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 3 · Une seule ligne, qui s'ouvre */
function OneLine() {
  const [open, setOpen] = useState(false);
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [routine, setRoutine] = useState(false);
  // Pour la démonstration : la ligne s'ouvre seule au bout de 2,5 s, comme sous la souris.
  useEffect(() => {
    const id = setTimeout(() => setOpen(true), 2500);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className="glass-dark w-[400px] max-w-full p-1.5" onMouseEnter={() => setOpen(true)}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 rounded-full py-1 pr-1.5 pl-1 text-left">
        <span className="flex -space-x-3">
          {ADVICES.map((advice) => (
            <Photo key={advice.name} src={advice.image} size={38} className="rounded-full border-2 border-[#062621]" />
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold text-white">2 conseils <span className="font-normal text-white/50">· routine</span></span>
          <span className="flex items-center gap-2 text-[11px] font-semibold">
            <span className="text-[#E8FF9C]">+{TOTAL}</span>
            <Star className="size-3 fill-[#E8FF9C] text-[#E8FF9C]" aria-label="Challenge" />
            <Hourglass className="size-3 text-[#FF9C8F]" aria-label="Date courte" />
          </span>
        </span>
        <ChevronDown className={`size-4 text-white/60 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="detail-in px-1.5 pt-1 pb-1">
          {ADVICES.map((advice, i) => (
            <div key={advice.name}>
              <button type="button" onClick={() => setOpenAt(openAt === i ? null : i)} className="flex w-full items-center gap-2.5 rounded-xl px-1 py-1.5 text-left hover:bg-white/[0.05]">
                <Photo src={advice.image} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-white">{advice.name}</span>
                  <span className="block truncate text-[11px] text-white/55">
                    {advice.drug} · {advice.stock} en stock{advice.challenge ? " · ★ Challenge" : ""}{advice.shortDate ? ` · date courte ${advice.shortDate}` : ""}
                  </span>
                </span>
                <span className="text-[12px] font-bold text-[#E8FF9C] tabular-nums">+{advice.margin}</span>
              </button>
              {openAt === i && <Detail advice={advice} />}
            </div>
          ))}
          <RoutineStrip open={routine} onToggle={() => setRoutine((v) => !v)} />
          <div className="mt-1 flex justify-end">
            <Fin />
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 4 · Tableau de bord */
function Dashboard() {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [routine, setRoutine] = useState(false);
  // L'anneau : la marge possible de la vente, sur un objectif d'exemple de 10 € par vente.
  const ratio = 0.67;
  return (
    <div className="glass-dark w-[400px] max-w-full p-3">
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 44 44" className="size-14 shrink-0 -rotate-90" aria-hidden="true">
          <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="5" />
          <circle cx="22" cy="22" r="18" fill="none" stroke="url(#ring)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${ratio * 113} 113`} className="ring-draw" />
          <defs>
            <linearGradient id="ring" x1="0" x2="1">
              <stop offset="0" stopColor="#3DDC84" />
              <stop offset="1" stopColor="#E8FF9C" />
            </linearGradient>
          </defs>
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-[20px] leading-6 font-bold text-white tabular-nums">{TOTAL}</p>
          <p className="text-[11.5px] text-white/60">de marge possible sur cette vente</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-[11px] font-semibold">
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-white">2 conseils</span>
          <span className="rounded-full bg-[#E4DDFF]/15 px-2 py-0.5 text-[#D9CFFF]">1 routine</span>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {ADVICES.map((advice, i) => (
          <button key={advice.name} type="button" onClick={() => setOpenAt(openAt === i ? null : i)} className={`row-in flex flex-col gap-1.5 rounded-2xl p-2 text-left ${openAt === i ? "bg-white/[0.1]" : "bg-white/[0.05] hover:bg-white/[0.08]"}`} style={{ animationDelay: `${i * 90}ms` }}>
            <div className="flex items-start justify-between">
              <Photo src={advice.image} size={42} />
              {advice.challenge ? <Star className="size-4 fill-[#E8FF9C] text-[#E8FF9C]" aria-label="Challenge" /> : advice.shortDate ? <Hourglass className="size-4 text-[#FF9C8F]" aria-label="Date courte" /> : null}
            </div>
            <span className="line-clamp-2 text-[12.5px] leading-4 font-bold text-white">{advice.name}</span>
            <span className="text-[10.5px] text-white/55">{advice.drug}</span>
            <span className="flex items-center justify-between text-[11.5px] font-semibold">
              <span className="text-[#7BE0B0]">{advice.stock} en stock</span>
              <span className="text-[#E8FF9C] tabular-nums">+{advice.margin}</span>
            </span>
          </button>
        ))}
      </div>
      {openAt !== null && <Detail advice={ADVICES[openAt]} />}
      <div className="mt-2">
        <RoutineStrip open={routine} onToggle={() => setRoutine((v) => !v)} />
      </div>
      <div className="mt-1 flex justify-end">
        <Fin />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 5 · Verre clair, liseré de couleur */
function LightGlass() {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [routine, setRoutine] = useState(true);
  return (
    <div className="flex w-[400px] max-w-full flex-col gap-2">
      <div className="glass-light p-2">
        {ADVICES.map((advice, i) => {
          const tone = advice.shortDate ? "#FF6B5B" : advice.challenge ? "#B8E000" : "#3DDC84";
          return (
            <div key={advice.name} className="row-in" style={{ animationDelay: `${i * 90}ms` }}>
              <button type="button" onClick={() => setOpenAt(openAt === i ? null : i)} className="relative flex w-full items-center gap-3 rounded-2xl py-2 pr-2 pl-3.5 text-left hover:bg-white/70">
                <span className="absolute top-2 bottom-2 left-1 w-1 rounded-full" style={{ background: tone }} aria-hidden="true" />
                <Photo src={advice.image} size={44} className="shadow-sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-[#0F2F2A]">{advice.name}</span>
                  <span className="block truncate text-[11.5px] text-[#4D6B64]">
                    {advice.drug} · {advice.stock} en stock
                  </span>
                  <span className="mt-0.5 block text-[11px] font-bold" style={{ color: advice.shortDate ? "#C23A2B" : "#4E6B00" }}>
                    {advice.shortDate ? `Date courte · ${advice.shortDate}` : advice.challenge ? `★ ${advice.challenge}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[14px] font-bold text-[#0F2F2A] tabular-nums">{advice.price}</span>
                  <span className="block text-[11px] font-semibold text-[#0E7C5A] tabular-nums">marge {advice.margin}</span>
                </span>
              </button>
              {openAt === i && <Detail advice={advice} light />}
            </div>
          );
        })}
        <div className="mt-1 flex items-center justify-between px-2">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-[#4D6B64]">
            <Sparkles className="size-3.5 text-[#0E7C5A]" aria-hidden="true" /> Jusqu&apos;à <b className="text-[#0E7C5A] tabular-nums">{TOTAL}</b>
          </span>
          <Fin light />
        </div>
      </div>
      {/* La routine, dans sa propre petite bannière sous la première. */}
      <div className="glass-light row-in p-1.5" style={{ animationDelay: "200ms" }}>
        <RoutineStrip light open={routine} onToggle={() => setRoutine((v) => !v)} />
      </div>
    </div>
  );
}

const VARIANTS: { key: string; title: string; text: string; View: () => ReactNode }[] = [
  { key: "1", title: "Cartes photo", text: "Grande photo, le prix et la marge à droite, trois petits repères en couleur (stock, challenge, date courte). La routine dessous, le total en bas.", View: PhotoCards },
  { key: "2", title: "Le ticket de pharmacie", text: "Fond clair, bandeau vert à la croix, les conseils comme sur un ticket avec les prix en bout de ligne. Très « officine ».", View: Ticket },
  { key: "3", title: "Une seule ligne", text: "Au repos, une seule ligne : les photos, « 2 conseils », la marge. Au survol (ou toute seule ici), elle s'ouvre sur le détail.", View: OneLine },
  { key: "4", title: "Tableau de bord", text: "En haut, la marge possible de la vente dans un anneau ; les conseils en deux cartes côte à côte ; la routine dessous.", View: Dashboard },
  { key: "5", title: "Verre clair", text: "Bannière blanche et transparente, un liseré de couleur par conseil (vert, citron challenge, rouge date courte). La routine dans sa propre petite bannière.", View: LightGlass },
];

function VariantCard({ letter, title, text, scan, View }: { letter: string; title: string; text: string; scan: Scan; View: () => ReactNode }) {
  const [run, setRun] = useState(0);
  // Une seule fois par « Rejouer » : on peut ensuite cliquer dans la bannière sans qu'elle reparte.
  const { phase, done } = useScanLoop(run, 1e9);
  const enter = scan === "A" ? "enter-unfold" : "enter-pill";
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-[#DCE7E2] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold tracking-[0.12em] text-[#4D6B64] uppercase">Bannière {letter}</p>
          <h2 className="text-[19px] font-bold text-[#0F2F2A]">{title}</h2>
          <p className="mt-1 text-[13.5px] leading-6 text-[#4D6B64]">{text}</p>
        </div>
        <button type="button" onClick={() => setRun((value) => value + 1)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#DCE7E2] px-2.5 py-1.5 text-[12.5px] font-semibold text-[#0F2F2A] hover:bg-[#F4F8F6]">
          <RotateCcw className="size-3.5" aria-hidden="true" /> Rejouer
        </button>
      </div>
      <div className="scan-screen flex min-h-[330px] items-start justify-center rounded-xl px-3 pt-4 pb-6">
        {phase === "banner" ? (
          <div key={`b${run}`} className={enter}>
            <View />
          </div>
        ) : (
          <div key="scan">{scan === "A" ? <CrossScan phase={phase as Exclude<Phase, "banner">} done={done} /> : <PillScan phase={phase as Exclude<Phase, "banner">} done={done} />}</div>
        )}
      </div>
      <p className="text-center text-[11px] font-semibold tracking-[0.12em] text-[#7C948D] uppercase">Exemple · cliquez sur un conseil ou sur la routine</p>
    </article>
  );
}

const SUITE_CSS = `
.glass-dark{border-radius:24px;background:linear-gradient(180deg,#072A25 0%,#03171A 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 18px 40px -16px rgba(0,0,0,.6);position:relative}
.glass-dark::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;background:linear-gradient(110deg,rgba(95,165,148,.5),rgba(232,255,156,.75) 50%,rgba(95,165,148,.5));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.glass-light{border-radius:22px;background:rgba(255,255,255,.82);backdrop-filter:blur(14px);box-shadow:0 0 0 1px rgba(15,47,42,.08),0 18px 40px -18px rgba(15,47,42,.35)}
.ticket{border-radius:18px;background:#fff;box-shadow:0 0 0 1px rgba(15,47,42,.08),0 18px 40px -18px rgba(15,47,42,.35);
  -webkit-mask:radial-gradient(circle 5px at 50% 100%,transparent 98%,#000) 0 0/14px 100% repeat-x,linear-gradient(#000 0 0);-webkit-mask-composite:source-in}
.leaders{border-bottom:1.5px dotted #B9CCC4;transform:translateY(-3px)}
.row-in{animation:rowin .45s cubic-bezier(.2,.9,.3,1) both}
@keyframes rowin{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.detail-in{animation:rowin .3s ease both}
.soft-blink{display:inline-flex;animation:softblink 1.6s ease-in-out infinite}
@keyframes softblink{0%,100%{opacity:1;transform:none}50%{opacity:.55;transform:translateY(-1px)}}
.ring-draw{animation:ring 1s ease-out both}
@keyframes ring{from{stroke-dasharray:0 113}}
@media (prefers-reduced-motion:reduce){.row-in,.detail-in,.soft-blink,.ring-draw{animation:none}}
`;

export function BannerSuiteTrials() {
  const [scan, setScan] = useState<Scan>("A");
  return (
    <main className="min-h-screen bg-[#F4F8F6] px-4 py-10">
      <style>{`${TRIAL_CSS}\n${SUITE_CSS}`}</style>
      <div className="mx-auto max-w-6xl">
        <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[#0F2F2A]">La bannière après le scan : cinq essais</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-7 text-[#4D6B64]">
          Le scan reste l&apos;essai A (la croix) ou C (la gélule) : choisissez-le ici. Puis chaque bannière montre la même vente d&apos;exemple. Cliquez sur un conseil pour l&apos;ouvrir, sur la routine pour la voir.
        </p>
        <div role="tablist" aria-label="Animation du scan" className="mt-5 inline-flex rounded-xl bg-white p-1 shadow-[0_0_0_1px_#DCE7E2]">
          {(["A", "C"] as const).map((key) => (
            <button key={key} type="button" role="tab" aria-selected={scan === key} onClick={() => setScan(key)} className={`rounded-lg px-4 py-1.5 text-[13.5px] font-semibold ${scan === key ? "bg-[#0F2F2A] text-white" : "text-[#4D6B64] hover:text-[#0F2F2A]"}`}>
              {key === "A" ? "Scan A · la croix" : "Scan C · la gélule"}
            </button>
          ))}
        </div>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {VARIANTS.map((variant) => (
            <VariantCard key={`${variant.key}-${scan}`} letter={variant.key} title={variant.title} text={variant.text} scan={scan} View={variant.View} />
          ))}
        </div>
      </div>
    </main>
  );
}
