"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Camera, Check, ClipboardList, Clock, FileText, Heart, Lightbulb, Mail, MessageCircle, Pill, Play, RefreshCw, ScanLine, Send, ShieldCheck, Sparkles, Star, Store, Users, Zap } from "lucide-react";
import { Robot } from "@/components/robot";
import { ean13Modules } from "@/core/patient-app/offers";
import { cn } from "@/lib/utils";
import { ExampleMark, Glass, Grad, Kick, Lead, Phone, Point, Title, d } from "./kit";
import { LiveSale, OpenCards } from "./live-sale";

/** Diapositives 1 à 12 : l'ouverture, le comptoir, le savoir, le patient. */

const PAD = "absolute inset-0 px-[88px] pt-[72px] pb-[64px]";

/* 1 ------------------------------------------------------------------ */
export function CoverSlide() {
  return (
    <div className={cn(PAD, "flex flex-col items-center justify-center text-center")}>
      <div className="pz-pop relative" style={d(100)}>
        <span className="pz-float inline-flex size-[150px] items-center justify-center rounded-full bg-white/85 shadow-[0_30px_70px_-24px_rgba(15,47,42,0.55)] ring-1 ring-white">
          <Robot size={118} mood="happy" />
        </span>
      </div>
      <div className="mt-8">
        <Kick delay={250}>Conférence des titulaires</Kick>
      </div>
      <h1 className="pz-in mt-6 text-[104px] leading-[0.98] font-bold tracking-[-0.05em] text-text-primary" style={d(380)}>
        Le copilote IA du comptoir
        <br />
        <Grad>de votre pharmacie.</Grad>
      </h1>
      <p className="pz-in mt-7 max-w-[1000px] text-[25px] leading-[1.5] text-text-secondary" style={d(560)}>
        À chaque boîte scannée, votre équipe voit le bon conseil, pris dans votre stock. Le pharmacien décide.
      </p>
      <p className="pz-fade mt-12 text-[18px] font-semibold text-text-tertiary" style={d(900)}>
        Présenté par Donna, pharmacienne · pharmaboost.app
      </p>
    </div>
  );
}

/* 2 ------------------------------------------------------------------ */
export function FilmSlide() {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  return (
    <div className={cn(PAD, "flex flex-col items-center")}>
      <Kick>Le film · 2 min 39</Kick>
      <div className="pz-in relative mt-7 overflow-hidden rounded-[30px] shadow-[0_50px_110px_-40px_rgba(15,47,42,0.6)] ring-1 ring-white/80" style={{ ...d(150), width: 1260, height: 709 }} data-int="">
        <video ref={ref} src="/video/pharmaboost-presentation.mp4" poster="/video/pharmaboost-presentation.jpg" playsInline controls={playing} preload="metadata" className="size-full object-cover" onPlay={() => setPlaying(true)} onEnded={() => setPlaying(false)} />
        {!playing && (
          <button
            type="button"
            onClick={() => {
              setPlaying(true);
              void ref.current?.play();
            }}
            className="absolute inset-0 grid place-items-center bg-[#0B2F2A]/25"
            aria-label="Lancer le film"
          >
            <span className="relative grid size-[120px] place-items-center rounded-full bg-white text-brand-700 shadow-2xl">
              <span className="pz-pulse absolute inset-0 rounded-full bg-white/60" />
              <Play className="relative ml-1.5 size-12 fill-current" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

/* 3 ------------------------------------------------------------------ */
const PAINS = [
  { icon: <Clock className="size-8" />, title: "La file d'attente", pain: "Il faut aller vite. Le conseil passe après la délivrance.", fix: "Le conseil arrive tout seul à l'écran, au moment du scan." },
  { icon: <Store className="size-8" />, title: "Le stock", pain: "Qui sait, à l'instant, ce qui est en rayon, en surstock ou en date courte ?", fix: "Seulement ce qui est en rayon. Dates courtes et surstock d'abord." },
  { icon: <Users className="size-8" />, title: "L'équipe", pain: "Chacun conseille à sa façon. Le savoir ne se transmet pas tout seul.", fix: "Les mêmes conseils validés pour toute l'équipe, du titulaire au nouveau." },
];

export function ConstatSlide() {
  const [flipped, setFlipped] = useState<boolean[]>([false, false, false]);
  return (
    <div className={PAD}>
      <Kick>Le constat</Kick>
      <Title className="max-w-[1150px]">
        Au comptoir, tout s&apos;enchaîne. <Grad>Votre expertise mérite un copilote.</Grad>
      </Title>
      <div className="mt-14 grid grid-cols-3 gap-8" style={{ perspective: 1600 }}>
        {PAINS.map((p, i) => (
          <button key={p.title} type="button" onClick={() => setFlipped((f) => f.map((v, j) => (j === i ? !v : v)))} className="pz-in relative h-[380px] text-left" style={d(300 + i * 150)}>
            <span className="absolute inset-0 block [transform-style:preserve-3d] transition-transform duration-700 ease-[cubic-bezier(.2,.8,.2,1)]" style={{ transform: flipped[i] ? "rotateY(180deg)" : "rotateY(0deg)" }}>
              <Glass className="absolute inset-0 flex flex-col p-9 [backface-visibility:hidden]">
                <span className="grid size-16 place-items-center rounded-2xl bg-[#FFE4DF] text-[#B4412C]">{p.icon}</span>
                <span className="mt-7 block text-[30px] font-bold tracking-[-0.03em] text-text-primary">{p.title}</span>
                <span className="mt-3 block text-[21px] leading-[1.5] text-text-secondary">{p.pain}</span>
                <span className="mt-auto block text-[16px] font-semibold text-brand-700">Touchez pour la solution →</span>
              </Glass>
              <span className="absolute inset-0 flex flex-col rounded-[32px] bg-gradient-to-br from-brand-600 to-[#0796b4] p-9 text-white shadow-[0_30px_80px_-30px_var(--color-brand-600)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
                <span className="grid size-16 place-items-center rounded-2xl bg-white/15">
                  <Check className="size-8" />
                </span>
                <span className="mt-7 block text-[16px] font-bold tracking-[0.14em] text-white/70 uppercase">Avec PharmaBoost</span>
                <span className="mt-3 block text-[28px] leading-[1.3] font-bold tracking-[-0.02em]">{p.fix}</span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* 4 ------------------------------------------------------------------ */
const STEPS = [
  { icon: <ScanLine className="size-9" />, title: "Vous scannez", text: "Dans votre logiciel, comme d'habitude. PharmaBoost travaille à côté, sans rien changer." },
  { icon: <Lightbulb className="size-9" />, title: "PharmaBoost propose", text: "Les conseils qui vont avec le traitement, pris dans votre stock, en haut de l'écran." },
  { icon: <Heart className="size-9" />, title: "Le pharmacien décide", text: "Il propose ou non. La boîte bipée compte « Vendu ». PharmaBoost ne vend jamais à sa place." },
];

export function IdeaSlide() {
  const [active, setActive] = useState<number | null>(null);
  return (
    <div className={PAD}>
      <Kick>PharmaBoost en une phrase</Kick>
      <Title>
        Vous scannez. PharmaBoost propose. <Grad>Le pharmacien décide.</Grad>
      </Title>
      <div className="relative mt-20">
        <svg className="absolute top-[58px] left-[200px]" width="1030" height="6" viewBox="0 0 1030 6" aria-hidden="true">
          <line x1="0" y1="3" x2="1030" y2="3" stroke="url(#pz-line)" strokeWidth="4" strokeLinecap="round" className="pz-draw" style={{ "--len": 1030, ...d(600) } as React.CSSProperties} />
          <defs>
            <linearGradient id="pz-line" x1="0" x2="1">
              <stop offset="0" stopColor="#0E8A7B" />
              <stop offset="1" stopColor="#0796b4" />
            </linearGradient>
          </defs>
        </svg>
        <div className="relative grid grid-cols-3 gap-10">
          {STEPS.map((s, i) => (
            <button key={s.title} type="button" onClick={() => setActive(active === i ? null : i)} className="pz-in flex flex-col items-center text-center" style={d(400 + i * 350)}>
              <span className={cn("grid size-[120px] place-items-center rounded-[36px] text-white shadow-[0_24px_50px_-18px_var(--color-brand-600)] transition-transform duration-500", active === i ? "scale-110" : "", i === 2 ? "bg-gradient-to-br from-[#0796b4] to-brand-700" : "bg-gradient-to-br from-brand-500 to-brand-700")}>{s.icon}</span>
              <span className="mt-6 font-mono text-[15px] text-brand-700">0{i + 1}</span>
              <span className="mt-1 text-[34px] font-bold tracking-[-0.03em] text-text-primary">{s.title}</span>
              <span className={cn("mt-4 max-w-[400px] text-[20px] leading-[1.5] text-text-secondary transition-opacity duration-500", active === null || active === i ? "opacity-100" : "opacity-35")}>{s.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* 5 ------------------------------------------------------------------ */
export function LiveSaleSlide() {
  return (
    <div className={cn(PAD, "grid grid-cols-[540px_1fr] items-center gap-14")}>
      <div>
        <Kick>Au comptoir · en direct</Kick>
        <Title className="text-[56px]">
          Une vente, <Grad>comme au poste.</Grad>
        </Title>
        <Lead>Touchez « Scanner une boîte » : la petite bannière s&apos;allume, cherche, puis ouvre les conseils. Le patient le prend ? On bipe la boîte : le conseil passe « Vendu ».</Lead>
        <ul className="mt-8 space-y-3">
          <Point icon={<ScanLine className="size-5" />} delay={400}>Au scan, la petite bannière blanche</Point>
          <Point icon={<Star className="size-5" />} delay={520}>L&apos;étoile du challenge, le sablier de la date courte</Point>
          <Point icon={<Check className="size-5" />} delay={640}>Bipé : « Vendu ». Sans clic de plus</Point>
        </ul>
      </div>
      <Glass className="pz-right relative flex min-h-[700px] items-center justify-center overflow-hidden px-8 py-10" style={d(300)}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_80%_at_20%_10%,#FFFFFF_0%,#EEF5F2_55%,#E2EEEA_100%)] opacity-70" />
        <div className="relative w-full">
          <LiveSale />
        </div>
        <ExampleMark className="absolute right-6 bottom-5" />
      </Glass>
    </div>
  );
}

/* 6 ------------------------------------------------------------------ */
export function SheetSlide() {
  return (
    <div className={cn(PAD, "grid grid-cols-[560px_1fr] items-center gap-14")}>
      <div>
        <Kick>Au comptoir · la fiche</Kick>
        <Title className="text-[56px]">
          Un toucher : <Grad>le conseil s&apos;ouvre.</Grad>
        </Title>
        <ul className="mt-10 space-y-3">
          <Point icon={<MessageCircle className="size-5" />} delay={300}>« À dire au patient » : la phrase est prête</Point>
          <Point icon={<ClipboardList className="size-5" />} delay={420}>Les questions à poser avant de conseiller</Point>
          <Point icon={<RefreshCw className="size-5" />} delay={540}>Une réponse ? Une autre possibilité du stock</Point>
          <Point icon={<Zap className="size-5" />} delay={660}>Le challenge en cours, le stock exact</Point>
        </ul>
      </div>
      <Glass className="pz-right relative flex min-h-[720px] items-center justify-center overflow-hidden px-8 py-8" style={d(250)}>
        <OpenCards startAt={0} />
        <ExampleMark className="absolute right-6 bottom-5" />
      </Glass>
    </div>
  );
}

/* 7 ------------------------------------------------------------------ */
export function RoutineSlide() {
  return (
    <div className={cn(PAD, "grid grid-cols-[560px_1fr] items-center gap-14")}>
      <div>
        <Kick>Au comptoir · la routine</Kick>
        <Title className="text-[56px]">
          Une vraie solution, <Grad>pas un produit isolé.</Grad>
        </Title>
        <Lead>Nettoyer, hydrater, protéger : un produit de votre stock par étape, avec le prix de l&apos;ensemble.</Lead>
        <div className="mt-9 flex gap-3">
          {["Nettoyer", "Hydrater", "Protéger"].map((s, i) => (
            <span key={s} className="pz-pop rounded-full bg-[#E4DDFF] px-5 py-2.5 text-[18px] font-bold text-[#2E2466]" style={d(450 + i * 150)}>
              {i + 1}. {s}
            </span>
          ))}
        </div>
      </div>
      <Glass className="pz-right relative flex min-h-[720px] items-center justify-center overflow-hidden px-8 py-8" style={d(250)}>
        <OpenCards panel="routine" />
        <ExampleMark className="absolute right-6 bottom-5" />
      </Glass>
    </div>
  );
}

/* 8 ------------------------------------------------------------------ */
export function ValidatedSlide() {
  const [wave, setWave] = useState(0);
  const nodes = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2 - Math.PI / 2;
    return { x: 300 + Math.cos(a) * 240, y: 300 + Math.sin(a) * 240, i };
  });
  return (
    <div className={cn(PAD, "grid grid-cols-[1fr_620px] items-center gap-12")}>
      <div>
        <Kick>La confiance</Kick>
        <Title className="text-[56px]">
          Chaque conseil est validé <Grad>par une pharmacienne.</Grad>
        </Title>
        <ul className="mt-10 space-y-3">
          <Point icon={<ShieldCheck className="size-5" />} delay={300}>Validé un par un, avant d&apos;arriver au comptoir</Point>
          <Point icon={<BookOpen className="size-5" />} delay={420}>Écrit à partir des RCP, de la HAS et de l&apos;ANSES</Point>
          <Point icon={<RefreshCw className="size-5" />} delay={540}>Une correction vaut pour toutes les pharmacies</Point>
          <Point icon={<Heart className="size-5" />} delay={660}>Jamais de marge à l&apos;écran du comptoir</Point>
        </ul>
      </div>
      <div className="pz-right relative" style={{ ...d(300), width: 600, height: 600 }} data-int="">
        <svg width="600" height="600" viewBox="0 0 600 600" className="absolute inset-0" aria-hidden="true">
          {nodes.map((n) => (
            <line key={n.i} x1="300" y1="300" x2={n.x} y2={n.y} stroke={wave ? "#0E8A7B" : "#BFD9D1"} strokeWidth="2" strokeDasharray="5 7" style={{ transition: `stroke .4s ${n.i * 60}ms` }} />
          ))}
        </svg>
        {wave > 0 && <span key={wave} className="pz-pulse absolute top-[240px] left-[240px] size-[120px] rounded-full bg-brand-400/40" />}
        {nodes.map((n) => (
          <span
            key={n.i}
            className={cn("absolute grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl shadow-lg transition-all duration-500", wave ? "bg-brand-600 text-white" : "bg-white text-brand-700")}
            style={{ left: n.x, top: n.y, transitionDelay: `${wave ? 200 + n.i * 60 : 0}ms` }}
          >
            {wave ? <Check className="size-6" /> : <Store className="size-6" />}
          </span>
        ))}
        <button type="button" onClick={() => setWave((w) => w + 1)} className="pz-glow absolute top-1/2 left-1/2 flex size-[170px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-center text-white shadow-2xl active:scale-95">
          <ShieldCheck className="size-10" />
          <span className="mt-2 text-[16px] leading-tight font-bold">
            {wave ? "Corrigé partout" : "Corriger"}
            <br />
            {wave ? "en même temps" : "une règle"}
          </span>
        </button>
        <p className="absolute -bottom-6 w-full text-center text-[15px] text-text-tertiary">Toutes les pharmacies PharmaBoost reçoivent la correction</p>
      </div>
    </div>
  );
}

/* 9 ------------------------------------------------------------------ */
const FICHES = [
  { kind: "Médicament", title: "La fiche complète", lines: ["Indications", "Posologie", "Contre-indications", "Précautions et interactions"], image: null },
  { kind: "Hors médicament", title: "Parapharmacie et compléments", lines: ["À quoi il sert", "Comment l'utiliser", "Précautions"], image: "/site/produits/creme-solaire-spf50.webp" },
  { kind: "Avec la photo", title: "On reconnaît la boîte", lines: ["La photo du produit", "Les dernières mises à jour"], image: "/site/produits/flore-equilibre-10-milliards.webp" },
];

export function ClaudeBernardSlide() {
  const [top, setTop] = useState(0);
  return (
    <div className={cn(PAD, "grid grid-cols-[1fr_640px] items-center gap-12")}>
      <div>
        <Kick>Le savoir · Base Claude Bernard</Kick>
        <Title className="text-[58px]">
          Toutes les fiches, <Grad>toujours à jour.</Grad>
        </Title>
        <Lead>PharmaBoost s&apos;appuie sur la Base Claude Bernard, base de données médicaments agréée par la HAS : médicaments et hors médicaments, avec la photo.</Lead>
        <div className="mt-9 flex flex-wrap gap-3">
          <span className="pz-pop inline-flex items-center gap-2 rounded-full bg-white/80 px-5 py-2.5 text-[17px] font-semibold text-brand-800 shadow-sm" style={d(450)}>
            <ShieldCheck className="size-5" /> Agréée par la HAS
          </span>
          <span className="pz-pop inline-flex items-center gap-2 rounded-full bg-[#E8FF9C] px-5 py-2.5 text-[17px] font-bold text-[#14302A]" style={d(600)}>
            <Sparkles className="size-5" /> Comprise dans l&apos;abonnement
          </span>
        </div>
      </div>
      <button type="button" onClick={() => setTop((t) => (t + 1) % FICHES.length)} className="pz-right relative h-[600px] w-[600px]" style={d(300)} aria-label="Fiche suivante">
        {FICHES.map((f, i) => {
          const pos = (i - top + FICHES.length) % FICHES.length;
          return (
            <Glass
              key={f.kind}
              className="absolute top-10 left-10 flex h-[460px] w-[480px] flex-col p-9 text-left transition-all duration-700 ease-[cubic-bezier(.2,.8,.2,1)]"
              style={{ transform: `translate(${pos * 36}px, ${pos * 34}px) rotate(${pos * 3}deg) scale(${1 - pos * 0.05})`, zIndex: 10 - pos, opacity: pos === 0 ? 1 : 0.85 }}
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-brand-50 px-4 py-1.5 text-[14px] font-bold tracking-[0.1em] text-brand-700 uppercase">{f.kind}</span>
                <FileText className="size-7 text-brand-600" />
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- photo locale */}
              {f.image ? <img src={f.image} alt="" className="mt-6 h-[120px] w-[120px] rounded-2xl bg-white object-contain p-2 shadow-sm" /> : <span className="mt-6 grid h-[120px] w-[120px] place-items-center rounded-2xl bg-white text-brand-700 shadow-sm"><Pill className="size-14" /></span>}
              <p className="mt-6 text-[30px] font-bold tracking-[-0.03em] text-text-primary">{f.title}</p>
              <ul className="mt-4 space-y-2">
                {f.lines.map((l) => (
                  <li key={l} className="flex items-center gap-2.5 text-[18px] text-text-secondary">
                    <Check className="size-4 text-brand-600" /> {l}
                  </li>
                ))}
              </ul>
            </Glass>
          );
        })}
        <span className="absolute right-6 bottom-0 text-[15px] font-semibold text-brand-700">Touchez pour la fiche suivante →</span>
      </button>
    </div>
  );
}

/* 10 ----------------------------------------------------------------- */
const QA = [
  { q: "Le patient prend un antibiotique : quel probiotique de mon stock ?", a: "Une levure probiotique, à prendre pendant toute la durée du traitement. Demandez d'abord s'il est allergique à la levure. Vous en avez en stock.", image: "/site/produits/ultra-levure-200-mg.webp", name: "Levure probiotique" },
  { q: "Cette crème solaire convient sous doxycycline ?", a: "La doxycycline rend la peau plus sensible au soleil. Une protection SPF 50+ la protège : avant chaque sortie, et à renouveler souvent.", image: "/site/produits/creme-solaire-spf50.webp", name: "Crème solaire SPF 50+" },
  { q: "Que demander avant de conseiller Imodium ?", a: "« Avez-vous de la fièvre ou du sang dans les selles ? » Si oui : pas d'Imodium, orientez vers le médecin. Sinon, Lactibiane Imedia en complément pour la flore.", image: "/produits-studio/3401528534805.jpg", name: "Lactibiane Imedia" },
];

export function CopilotSlide() {
  const [asked, setAsked] = useState<number | null>(null);
  const [typed, setTyped] = useState(0);
  const [thinking, setThinking] = useState(false);
  useEffect(() => {
    if (asked === null) return;
    const text = QA[asked].a;
    let i = 0;
    let interval = 0;
    const t = window.setTimeout(() => {
      setThinking(false);
      interval = window.setInterval(() => {
        i += 2;
        setTyped(i);
        if (i >= text.length) window.clearInterval(interval);
      }, 18);
    }, 900);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(interval);
    };
  }, [asked]);
  const qa = asked === null ? null : QA[asked];
  return (
    <div className={cn(PAD, "grid grid-cols-[560px_1fr] items-center gap-12")}>
      <div>
        <Kick>Le savoir · copilote IA</Kick>
        <Title className="text-[58px]">
          Posez-lui <Grad>n&apos;importe quelle question.</Grad>
        </Title>
        <Lead>Un médicament, un produit conseil, une question du patient : le copilote répond avec la Base Claude Bernard, photo à l&apos;appui.</Lead>
        <div className="mt-8 flex gap-3">
          <span className="pz-pop rounded-full bg-white/80 px-5 py-2.5 text-[17px] font-semibold text-brand-800" style={d(450)}>Pour se former</span>
          <span className="pz-pop rounded-full bg-white/80 px-5 py-2.5 text-[17px] font-semibold text-brand-800" style={d(560)}>Face au patient</span>
        </div>
      </div>
      <Glass className="pz-right flex h-[720px] flex-col p-7" style={d(250)}>
        <div className="flex items-center gap-3 border-b border-black/5 pb-4">
          <span className="grid size-12 place-items-center rounded-full bg-brand-50">
            <Robot size={38} mood={thinking ? "thinking" : qa ? "happy" : "curious"} />
          </span>
          <div>
            <p className="text-[19px] font-bold text-text-primary">Copilote PharmaBoost</p>
            <p className="text-[14px] text-text-tertiary">Base Claude Bernard</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-end gap-4 py-5">
          {!qa && <p className="pz-fade text-center text-[18px] text-text-tertiary">Touchez une question ci-dessous.</p>}
          {qa && (
            <>
              <p key={`q${asked}`} className="pz-drop ml-auto max-w-[80%] rounded-[24px] rounded-br-md bg-brand-600 px-6 py-4 text-[19px] leading-[1.45] text-white">{qa.q}</p>
              <div key={`a${asked}`} className="pz-in max-w-[88%] rounded-[24px] rounded-bl-md border border-black/5 bg-white px-6 py-4 text-[19px] leading-[1.5] text-text-primary shadow-sm">
                {thinking ? (
                  <span className="inline-flex gap-1.5 py-2">
                    {[0, 1, 2].map((k) => (
                      <span key={k} className="size-2.5 animate-bounce rounded-full bg-brand-400" style={{ animationDelay: `${k * 120}ms` }} />
                    ))}
                  </span>
                ) : (
                  <>
                    <span className={typed < qa.a.length ? "pz-type" : ""}>{qa.a.slice(0, typed)}</span>
                    {typed >= qa.a.length && (
                      <span className="pz-pop mt-4 flex items-center gap-4 rounded-2xl bg-[#F1F7F5] p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element -- photo locale */}
                        <img src={qa.image} alt="" className="size-16 rounded-xl bg-white object-contain p-1" />
                        <span>
                          <span className="block text-[16px] font-bold">{qa.name}</span>
                          <span className="flex items-center gap-1.5 text-[14px] text-text-tertiary">
                            <Camera className="size-3.5" /> Photo de la fiche
                          </span>
                        </span>
                      </span>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
        <div className="grid gap-2" data-int="">
          {QA.map((item, i) => (
            <button
              key={item.q}
              type="button"
              onClick={() => {
                if (asked === i) return;
                setTyped(0);
                setThinking(true);
                setAsked(i);
              }} className={cn("flex items-center justify-between gap-3 rounded-2xl border px-5 py-3.5 text-left text-[19px] font-medium transition-colors", asked === i ? "border-brand-400 bg-brand-50 text-brand-900" : "border-black/5 bg-white/70 text-text-secondary hover:bg-white")}>
              {item.q}
              <Send className="size-4 shrink-0 text-brand-600" />
            </button>
          ))}
        </div>
      </Glass>
    </div>
  );
}

/* 11 ----------------------------------------------------------------- */
const TIMELINE = [
  { icon: <Check className="size-6" />, title: "Vente terminée", text: "Le pharmacien a conseillé." },
  { icon: <Mail className="size-6" />, title: "Son bilan par e-mail", text: "Avec son accord : médicaments, conseils, quand les prendre." },
  { icon: <Clock className="size-6" />, title: "7 jours avant la fin de la cure", text: "Un rappel, au nom de votre pharmacie." },
  { icon: <Store className="size-6" />, title: "Il revient chez vous", text: "Pour renouveler sa cure." },
];

export function BilanSlide() {
  const line = (name: string, why: string, when: string, advice = false, delay = 0) => (
    <li className="pz-in py-2.5" style={d(delay)}>
      <p className={advice ? "text-[15px] font-semibold text-brand-800" : "font-mono text-[14px] font-semibold text-text-primary"}>{name}</p>
      <p className="text-[13px] text-text-secondary">{why}</p>
      <span className="mt-1 inline-block rounded-md bg-brand-50 px-2 py-0.5 text-[12px] text-brand-900">{when}</span>
    </li>
  );
  return (
    <div className={cn(PAD, "grid grid-cols-[1fr_380px_520px] items-center gap-12")}>
      <div>
        <Kick>Le patient · le bilan</Kick>
        <Title className="text-[54px]">
          Il repart avec <Grad>son bilan conseil.</Grad>
        </Title>
        <Lead>Et l&apos;adresse e-mail est effacée après l&apos;envoi, ou après le rappel de fin de cure. Aucune fiche patient.</Lead>
      </div>
      <div className="pz-float">
        <Phone width={360}>
          <div className="px-5 pt-3 pb-6">
            <p className="text-center text-[11px] font-bold tracking-[0.14em] text-brand-700 uppercase">PharmaBoost · votre pharmacie</p>
            <p className="mt-1 text-center text-[18px] font-bold text-text-primary">Votre bilan conseil</p>
            <ul className="mt-3 divide-y divide-border-subtle">
              {line("CURACNÉ 20 mg", "Votre traitement", "Selon l'ordonnance", false, 300)}
              {line("Cicaplast Lèvres", "Conseil : répare les lèvres sèches", "Plusieurs fois par jour", true, 420)}
              {line("IMODIUM 2 mg", "Votre traitement", "Selon l'ordonnance", false, 540)}
              {line("Lactibiane Imedia", "Conseil : aide la flore à se remettre", "Une fois par jour", true, 660)}
              {line("Routine peau · 3 produits", "Nettoyer, hydrater, protéger", "Matin et soir", true, 780)}
            </ul>
            <div className="pz-pop mt-3 rounded-xl bg-brand-600 px-3 py-2.5 text-[13px] font-semibold text-white" style={d(1000)}>
              Rappel 7 jours avant la fin de la cure
            </div>
          </div>
        </Phone>
      </div>
      <ol className="relative space-y-5">
        <span className="pz-bar absolute top-6 bottom-6 left-[27px] w-[3px] origin-top rounded-full bg-gradient-to-b from-brand-400 to-[#0796b4]" style={{ ...d(400), transformOrigin: "top", animationName: "pz-fade" }} />
        {TIMELINE.map((s, i) => (
          <li key={s.title} className="pz-right relative flex items-start gap-5" style={d(500 + i * 260)}>
            <span className="relative z-10 grid size-14 shrink-0 place-items-center rounded-2xl bg-white text-brand-700 shadow-lg ring-1 ring-brand-100">{s.icon}</span>
            <span className="pt-1">
              <span className="block text-[22px] font-bold tracking-[-0.02em] text-text-primary">{s.title}</span>
              <span className="block text-[17px] text-text-secondary">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* 12 ----------------------------------------------------------------- */
const EXAMPLE_CODE = "2990000012340";
type AppTab = "offres" | "scan" | "bilans";

export function AppSlide() {
  const [tab, setTab] = useState<AppTab>("offres");
  const modules = ean13Modules(EXAMPLE_CODE);
  return (
    <div className={cn(PAD, "grid grid-cols-[1fr_400px_360px] items-center gap-12")}>
      <div>
        <Kick>Le patient · l&apos;appli PharmaBoost</Kick>
        <Title className="text-[54px]">
          Des patients qui <Grad>choisissent votre pharmacie.</Grad>
        </Title>
        <Lead>Les offres de votre pharmacie et des laboratoires partenaires, valables seulement dans les pharmacies PharmaBoost. Pour en profiter, ils viennent chez vous.</Lead>
      </div>
      <div className="pz-in" style={d(250)}>
        <Phone width={380}>
          <div key={tab} className="pz-fade min-h-[600px] px-5 pt-5 pb-6">
            {tab === "offres" && (
              <>
                <p className="text-[12px] font-semibold tracking-[0.08em] text-[#0E8A7B] uppercase">Mes offres</p>
                <p className="mt-1 text-[22px] font-bold text-[#0F2B26]">Votre pharmacie</p>
                <div className="pz-drop mt-4 rounded-2xl bg-white p-5 shadow-sm">
                  <span className="inline-flex rounded-full bg-[#E8FF9C] px-2.5 py-1 text-[12px] font-bold text-[#3D4F00]">Offre de la pharmacie</span>
                  <p className="mt-3 text-[34px] leading-none font-extrabold text-[#0F2B26]">-20 %</p>
                  <p className="mt-1 text-[15px] font-semibold text-[#0F2B26]">Nouvelle gamme solaire</p>
                  <svg viewBox="0 0 95 30" preserveAspectRatio="none" className="mt-4 h-16 w-full">
                    {modules.split("").map((bit, x) => (bit === "1" ? <rect key={x} x={x} y={0} width={1} height={30} fill="#0F2B26" /> : null))}
                  </svg>
                  <p className="mt-1 text-center font-mono text-[12px] tracking-[0.18em] text-[#475569]">2990 0000 1234 0</p>
                  <p className="mt-2 text-center text-[12px] text-[#64748B]">À montrer au comptoir : scanné une fois</p>
                </div>
                <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
                  <span className="inline-flex rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-bold text-brand-800">Offre laboratoire partenaire</span>
                  <p className="mt-2 text-[15px] font-semibold text-[#0F2B26]">Valable en pharmacie PharmaBoost</p>
                </div>
              </>
            )}
            {tab === "scan" && (
              <>
                <p className="text-[22px] font-bold text-[#0F2B26]">Scanner une boîte</p>
                <div className="relative mt-4 h-[260px] overflow-hidden rounded-3xl bg-[#0F2B26]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- photo locale */}
                  <img src="/produits-studio/3401528534805.jpg" alt="" className="absolute inset-0 m-auto h-[180px] object-contain opacity-90" />
                  <span className="pz-scanline absolute inset-x-6 h-[3px] rounded-full bg-[#7FE0C4] shadow-[0_0_20px_#7FE0C4]" />
                  <span className="absolute inset-6 rounded-2xl border-2 border-white/40" />
                </div>
                <div className="pz-drop mt-4 rounded-2xl bg-white p-4 shadow-sm" style={d(900)}>
                  <p className="text-[16px] font-bold text-[#0F2B26]">Lactibiane Imedia</p>
                  <p className="mt-1 text-[13px] text-[#64748B]">La fiche, et les conseils qui l&apos;accompagnent.</p>
                </div>
              </>
            )}
            {tab === "bilans" && (
              <>
                <p className="text-[22px] font-bold text-[#0F2B26]">Mes bilans et mes cures</p>
                {["Bilan conseil · 14 nov.", "Cure Lactibiane · encore 9 jours", "Routine peau · matin et soir"].map((t, i) => (
                  <div key={t} className="pz-in mt-3 flex items-center justify-between rounded-2xl bg-white px-4 py-4 shadow-sm" style={d(150 + i * 150)}>
                    <span className="text-[15px] font-semibold text-[#0F2B26]">{t}</span>
                    <span className="size-2.5 rounded-full bg-brand-500" />
                  </div>
                ))}
                <div className="pz-pop mt-4 rounded-xl bg-brand-600 px-4 py-3 text-[14px] font-semibold text-white" style={d(700)}>
                  Rappel avant la fin de la cure
                </div>
              </>
            )}
          </div>
        </Phone>
      </div>
      <div className="space-y-3" data-int="">
        {(
          [
            { id: "offres", label: "Les offres", line: "Pharmacie et laboratoires", icon: <Star className="size-5" /> },
            { id: "scan", label: "Le scan", line: "La fiche d'une boîte", icon: <ScanLine className="size-5" /> },
            { id: "bilans", label: "Bilans et cures", line: "Et le rappel de fin de cure", icon: <Clock className="size-5" /> },
          ] as const
        ).map((t, i) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={cn("pz-right flex w-full items-center gap-4 rounded-3xl border p-5 text-left transition-all", tab === t.id ? "border-brand-300 bg-white shadow-xl" : "border-white/70 bg-white/45 backdrop-blur-md")} style={d(400 + i * 120)}>
            <span className={cn("grid size-12 place-items-center rounded-2xl", tab === t.id ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700")}>{t.icon}</span>
            <span>
              <span className="block text-[20px] font-bold text-text-primary">{t.label}</span>
              <span className="block text-[15px] text-text-secondary">{t.line}</span>
            </span>
          </button>
        ))}
        <ExampleMark className="block pt-2 text-center" />
      </div>
    </div>
  );
}

export const SCANLINE_CSS = `.pz-scanline{animation:pz-scanline 2.2s cubic-bezier(.65,0,.35,1) infinite}@keyframes pz-scanline{0%{top:24px}50%{top:230px}100%{top:24px}}`;
