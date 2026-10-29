"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, RotateCcw } from "lucide-react";
import { MixIsland } from "@/components/island/mix-island";
import type { IslandAdvice } from "@/components/island/counter-island";
import { ISLAND_CSS } from "@/components/island/island-shell";
import { AURORE_CSS } from "@/components/island/island-aurore";
import { ROUTINE_CSS, RoutineThumbs, type IslandRoutine } from "@/components/island/routine-island";

/**
 * Une vente d'EXEMPLE (de vrais produits du stock local et leurs photos studio), la même pour les cinq essais : seul le
 * moment du scan change. Chaque essai rejoue : scan → analyse → « 2 conseils » → la bannière.
 */
const DRUG = "CURACNÉ 20 mg";
const ITEMS: IslandAdvice[] = [
  { name: "Cicaplast Lèvres baume réparateur", price: "7,95 €", margin: "2,27 €", drug: DRUG, challenge: true, stock: "IN_STOCK", quantity: 12, image: "/produits-studio/0000030106659.jpg" },
  { name: "Lactibiane Imedia", price: "10,80 €", margin: "4,42 €", drug: "IMODIUM 2 mg", shortDate: "30/11/26", stock: "IN_STOCK", quantity: 7, image: "/produits-studio/3401528534805.jpg" },
];
const ROUTINE: IslandRoutine = {
  title: "Routine peau sous isotrétinoïne",
  drug: DRUG,
  steps: [
    { label: "Nettoyer", name: "Cleanance gel nettoyant", price: "15,70 €", margin: "4,34 €", stock: "IN_STOCK", image: "/produits-studio/3282770207774.jpg" },
    { label: "Hydrater", name: "Effaclar H Iso-Biome", price: "16,50 €", margin: "4,44 €", stock: "IN_STOCK", image: "/produits-studio/3337875777797.jpg" },
    { label: "Protéger", name: "Anthelios UVMune 400", price: "17,95 €", margin: "4,44 €", stock: "IN_STOCK", image: "/produits-studio/3337875797665.jpg" },
  ],
};
const STEPS = ["Boîte lue", "Contre-indications", "Votre stock", "Conseils"];
const PHOTOS = [ITEMS[0].image, ITEMS[1].image, ...ROUTINE.steps.map((step) => step.image)].filter(Boolean) as string[];

type Phase = "scan" | "analyse" | "found" | "banner";

/** Le temps d'un essai : 0,6 s de scan, quatre étapes de 0,55 s, 0,9 s pour « 2 conseils », puis la bannière 6 s. */
function useScanLoop(run: number) {
  const [phase, setPhase] = useState<Phase>("scan");
  const [done, setDone] = useState(0);
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const play = (offset: number) => {
      at(offset, () => {
        setPhase("scan");
        setDone(0);
      });
      at(offset + 700, () => setPhase("analyse"));
      STEPS.forEach((_, i) => at(offset + 1150 + i * 550, () => setDone(i + 1)));
      at(offset + 3500, () => setPhase("found"));
      at(offset + 4500, () => setPhase("banner"));
    };
    for (let loop = 0; loop < 20; loop += 1) play(loop * 11000);
    return () => timers.forEach(clearTimeout);
  }, [run]);
  return { phase, done };
}

const noop = () => undefined;

/** La vraie bannière, qui entre avec l'animation de l'essai. */
function Banner({ enter }: { enter: string }) {
  return (
    <div className={`scan-banner ${enter}`}>
      <MixIsland items={ITEMS} outcomes={[]} open={false} onOpen={noop} onFinish={noop} onAnswer={noop} headAside={<RoutineThumbs routine={ROUTINE} open={false} blink onToggle={noop} />} />
    </div>
  );
}

/** La capsule sombre du poste, celle qui s'affiche au scan : même verre vert que la bannière. */
function Capsule({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={`scan-capsule ${wide ? "w-[400px]" : "w-[340px]"} max-w-full`}>
      {children}
    </div>
  );
}

const subtitle = (phase: Phase, done: number) => (phase === "scan" ? "Boîte scannée" : phase === "found" ? `2 conseils · jusqu'à 6,69 €` : STEPS[Math.min(done, STEPS.length - 1)]);

/* ------------------------------------------------------------------ A · La croix de pharmacie */
function CrossTrial({ phase, done }: { phase: Phase; done: number }) {
  if (phase === "banner") return <Banner enter="enter-unfold" />;
  // Les quatre bras s'allument un par un avec les étapes, le cœur bat ; trouvé : toute la croix s'allume, comme une enseigne.
  const arms = [
    { x: 14, y: 2 },
    { x: 26, y: 14 },
    { x: 14, y: 26 },
    { x: 2, y: 14 },
  ];
  const lit = phase === "found" ? 4 : phase === "analyse" ? done : 0;
  return (
    <Capsule>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <svg viewBox="0 0 40 40" className={`size-10 shrink-0 ${phase === "found" ? "cross-glow" : ""}`} aria-hidden="true">
          {arms.map((arm, i) => (
            <rect key={i} x={arm.x} y={arm.y} width="12" height="12" rx="2.5" fill={i < lit ? "#3DDC84" : "rgba(255,255,255,.12)"} style={{ transition: "fill .25s" }} />
          ))}
          <rect x="14" y="14" width="12" height="12" rx="2.5" fill="#3DDC84" className="cross-heart" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold text-white">{phase === "found" ? "C'est prêt" : DRUG}</p>
          <p className="truncate text-[12px] text-[#9FCBBB]">{subtitle(phase, done)}</p>
        </div>
        {phase === "found" && <span className="pop rounded-full bg-[#3DDC84] px-2.5 py-1 text-[12px] font-bold text-[#04261A]">2</span>}
      </div>
    </Capsule>
  );
}

/* ------------------------------------------------------------------ B · Le laser du code-barres */
function LaserTrial({ phase, done }: { phase: Phase; done: number }) {
  if (phase === "banner") return <Banner enter="enter-drop" />;
  const bars = [2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 2, 3, 1, 1, 2, 1, 3, 2];
  let x = 0;
  return (
    <Capsule>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="relative h-9 w-14 shrink-0 overflow-hidden rounded-md bg-white/95 px-1 py-1.5">
          <svg viewBox="0 0 40 24" className="size-full" preserveAspectRatio="none" aria-hidden="true">
            {bars.map((w, i) => {
              const rect = <rect key={i} x={x} y="0" width={w * 0.8} height="24" fill="#0F2F2A" />;
              x += w * 0.8 + 0.9;
              return rect;
            })}
          </svg>
          {phase !== "found" ? <span className="laser" /> : <span className="absolute inset-0 flex items-center justify-center bg-[#3DDC84]/90 pop"><Check className="size-5 text-[#04261A]" strokeWidth={3.5} /></span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold text-white">
            {phase === "scan" ? <span className="typing">{DRUG}</span> : DRUG}
          </p>
          <div className="mt-1 flex gap-1" aria-hidden="true">
            {STEPS.map((step, i) => (
              <span key={step} className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full rounded-full bg-[#3DDC84]" style={{ width: phase === "found" || i < done ? "100%" : "0%", transition: "width .45s ease" }} />
              </span>
            ))}
          </div>
          <p className="mt-1 truncate text-[11.5px] text-[#9FCBBB]">{subtitle(phase, done)}</p>
        </div>
      </div>
    </Capsule>
  );
}

/* ------------------------------------------------------------------ C · La gélule */
function PillTrial({ phase, done }: { phase: Phase; done: number }) {
  if (phase === "banner") return <Banner enter="enter-pill" />;
  const fill = phase === "found" ? 100 : phase === "analyse" ? Math.round((done / STEPS.length) * 100) : 6;
  return (
    <Capsule>
      <div className="flex items-center gap-3 px-3 py-3">
        <div className={`pill mx-2 shrink-0 ${phase === "found" ? "pill-open" : ""}`} aria-hidden="true">
          <span className="pill-left">
            <span className="pill-fill" style={{ width: `${fill}%` }} />
          </span>
          <span className="pill-right" />
          {phase === "found" && <span className="pill-count pop">2</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold text-white">{phase === "found" ? "2 conseils pour ce patient" : DRUG}</p>
          <p className="truncate text-[12px] text-[#9FCBBB]">{phase === "found" ? "jusqu'à 6,69 € de marge" : subtitle(phase, done)}</p>
        </div>
      </div>
    </Capsule>
  );
}

/* ------------------------------------------------------------------ D · Le pouls */
function PulseTrial({ phase, done }: { phase: Phase; done: number }) {
  if (phase === "banner") return <Banner enter="enter-unfold" />;
  return (
    <Capsule wide>
      <div className="px-3 pt-2.5 pb-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[14px] font-bold text-white">{DRUG}</p>
          <p className="shrink-0 text-[12px] font-semibold text-[#E8FF9C] tabular-nums">{phase === "found" ? "2 conseils" : `${Math.min(done, 4) * 25} %`}</p>
        </div>
        <svg viewBox="0 0 380 34" className="mt-1 h-[34px] w-full" aria-hidden="true">
          <path d="M0 17 H120 L132 17 L140 4 L150 30 L158 10 L166 17 H250 L262 17 L270 6 L280 28 L288 17 H380" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="2" />
          <path key={phase === "scan" ? "s" : "a"} d="M0 17 H120 L132 17 L140 4 L150 30 L158 10 L166 17 H250 L262 17 L270 6 L280 28 L288 17 H380" fill="none" stroke="#3DDC84" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={phase === "scan" ? "ecg-idle" : "ecg-draw"} />
          {phase === "found" && <circle cx="372" cy="17" r="6" fill="#E8FF9C" className="pop" />}
        </svg>
        <p className="truncate text-[11.5px] text-[#9FCBBB]">{subtitle(phase, done)}</p>
      </div>
    </Capsule>
  );
}

/* ------------------------------------------------------------------ E · Sobre : la bannière se dessine */
function SkeletonTrial({ phase }: { phase: Phase; done: number }) {
  if (phase === "banner") return <Banner enter="enter-fade" />;
  // La forme de la bannière apparaît tout de suite, encore vide, puis les photos arrivent une à une : rien ne saute à l'écran.
  return (
    <div className="scan-capsule w-[400px] max-w-full px-3 py-3">
      {[0, 1].map((row) => (
        <div key={row} className="flex items-center gap-3 py-1.5">
          <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-white/10">
            {phase === "found" && <img src={PHOTOS[row]} alt="" className="photo-in size-full bg-white object-contain" style={{ animationDelay: `${row * 120}ms` }} />}
          </span>
          <span className="flex-1 space-y-1.5">
            <span className="skel block h-2.5 w-3/4 rounded" />
            <span className="skel block h-2 w-1/2 rounded" />
          </span>
          <span className="skel h-5 w-12 rounded-full" />
        </div>
      ))}
      <div className="mt-1 flex items-center justify-between border-t border-white/10 pt-2">
        <span className="text-[11.5px] text-[#9FCBBB]">{phase === "found" ? "2 conseils trouvés" : "PharmaBoost prépare vos conseils…"}</span>
        <span className="flex -space-x-1.5">
          {PHOTOS.slice(2).map((src, i) => (
            <span key={src} className="size-6 overflow-hidden rounded-md border border-[#072A25] bg-white/10">
              {phase === "found" && <img src={src} alt="" className="photo-in size-full bg-white object-contain" style={{ animationDelay: `${200 + i * 100}ms` }} />}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

const TRIALS: { key: string; title: string; text: string; Trial: (props: { phase: Phase; done: number }) => ReactNode }[] = [
  { key: "A", title: "La croix de pharmacie", text: "La croix verte s'allume bras par bras pendant l'analyse, puis toute entière, comme l'enseigne. La bannière se déplie depuis la capsule.", Trial: CrossTrial },
  { key: "B", title: "Le laser du code-barres", text: "Le code-barres est balayé par le laser, le nom de la boîte s'écrit, quatre petites barres se remplissent. La bannière descend.", Trial: LaserTrial },
  { key: "C", title: "La gélule", text: "Une gélule se remplit pendant l'analyse puis s'ouvre en deux : le nombre de conseils en sort. La bannière s'ouvre depuis le centre.", Trial: PillTrial },
  { key: "D", title: "Le pouls", text: "Un tracé de pouls se dessine pendant l'analyse, avec le pourcentage ; au bout, le point citron. La bannière se déplie.", Trial: PulseTrial },
  { key: "E", title: "Sobre : la bannière se dessine", text: "Plus d'étapes : la forme de la bannière apparaît tout de suite, les photos des produits arrivent une à une, puis tout s'affiche.", Trial: SkeletonTrial },
];

function TrialCard({ title, text, letter, Trial }: { title: string; text: string; letter: string; Trial: (props: { phase: Phase; done: number }) => ReactNode }) {
  const [run, setRun] = useState(0);
  const { phase, done } = useScanLoop(run);
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-[#DCE7E2] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold tracking-[0.12em] text-[#4D6B64] uppercase">Essai {letter}</p>
          <h2 className="text-[19px] font-bold text-[#0F2F2A]">{title}</h2>
          <p className="mt-1 text-[13.5px] leading-6 text-[#4D6B64]">{text}</p>
        </div>
        <button type="button" onClick={() => setRun((value) => value + 1)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#DCE7E2] px-2.5 py-1.5 text-[12.5px] font-semibold text-[#0F2F2A] hover:bg-[#F4F8F6]">
          <RotateCcw className="size-3.5" aria-hidden="true" /> Rejouer
        </button>
      </div>
      {/* Le haut d'un écran de comptoir : la bannière se pose en haut, au centre. */}
      <div className="scan-screen flex min-h-[230px] items-start justify-center rounded-xl px-3 pt-4 pb-6">
        <div key={phase === "banner" ? "b" : "c"} className="flex items-start justify-center [&_section]:max-w-full">
          <Trial phase={phase} done={done} />
        </div>
      </div>
    </article>
  );
}

const TRIAL_CSS = `
.scan-screen{background:linear-gradient(180deg,#E9EEF0 0%,#F5F7F8 60%),#F5F7F8;box-shadow:inset 0 1px 0 #fff,inset 0 0 0 1px #DCE3E6}
.scan-capsule{border-radius:22px;background:linear-gradient(180deg,#072A25 0%,#03171A 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 14px 34px -14px rgba(0,0,0,.55);animation:cap-in .45s cubic-bezier(.2,.9,.3,1.2) both;position:relative;overflow:hidden}
@keyframes cap-in{from{opacity:0;transform:translateY(-14px) scale(.92)}to{opacity:1;transform:none}}
.pop{animation:pop .4s cubic-bezier(.2,.9,.3,1.4) both}
@keyframes pop{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:scale(1)}}
.cross-heart{transform-origin:20px 20px;animation:heart 1s ease-in-out infinite}
@keyframes heart{0%,100%{opacity:1}50%{opacity:.45}}
.cross-glow{filter:drop-shadow(0 0 6px rgba(61,220,132,.9));animation:pop .4s ease both}
.laser{position:absolute;top:0;bottom:0;width:2px;background:#FF4D4D;box-shadow:0 0 8px 2px rgba(255,77,77,.8);animation:laser 1.1s ease-in-out infinite alternate}
@keyframes laser{from{left:4%}to{left:94%}}
.typing{display:inline-block;overflow:hidden;white-space:nowrap;vertical-align:bottom;animation:typing .6s steps(13) both}
@keyframes typing{from{max-width:0}to{max-width:100%}}
.pill{position:relative;display:flex;width:58px;height:24px}
.pill-left,.pill-right{height:24px;width:29px;transition:transform .45s cubic-bezier(.2,.9,.3,1.2)}
.pill-left{position:relative;overflow:hidden;border-radius:12px 0 0 12px;background:rgba(255,255,255,.14)}
.pill-right{border-radius:0 12px 12px 0;background:#F4F8F6}
.pill-fill{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#3DDC84,#E8FF9C);transition:width .45s ease}
.pill-open .pill-left{transform:translateX(-7px) rotate(-12deg)}
.pill-open .pill-right{transform:translateX(7px) rotate(12deg)}
.pill-count{position:absolute;left:50%;top:50%;margin:-11px 0 0 -11px;width:22px;height:22px;border-radius:999px;background:#E8FF9C;color:#04261A;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center}
.ecg-draw{stroke-dasharray:520;stroke-dashoffset:520;animation:ecg 2.6s ease-out forwards}
.ecg-idle{stroke-dasharray:60 460;animation:ecg-run 1.1s linear infinite}
@keyframes ecg{to{stroke-dashoffset:0}}
@keyframes ecg-run{from{stroke-dashoffset:520}to{stroke-dashoffset:0}}
.skel{background:linear-gradient(90deg,rgba(255,255,255,.08) 25%,rgba(255,255,255,.2) 50%,rgba(255,255,255,.08) 75%);background-size:300% 100%;animation:skel 1.2s linear infinite}
@keyframes skel{from{background-position:100% 0}to{background-position:-100% 0}}
.photo-in{animation:photo .5s ease both}
@keyframes photo{from{opacity:0;filter:blur(6px);transform:scale(1.15)}to{opacity:1;filter:none;transform:none}}
.scan-banner img{animation:photo .6s ease both}
.enter-unfold{animation:unfold .55s cubic-bezier(.2,.9,.3,1) both;transform-origin:top center}
@keyframes unfold{from{opacity:.2;clip-path:inset(0 12% 70% 12% round 22px);transform:scaleY(.85)}to{opacity:1;clip-path:inset(0 0 0 0 round 22px);transform:none}}
.enter-drop{animation:drop .5s cubic-bezier(.2,.9,.3,1.15) both}
@keyframes drop{from{opacity:0;transform:translateY(-22px)}to{opacity:1;transform:none}}
.enter-pill{animation:pillopen .55s cubic-bezier(.2,.9,.3,1) both}
@keyframes pillopen{from{opacity:.3;clip-path:inset(0 44% 0 44% round 22px)}to{opacity:1;clip-path:inset(0 0 0 0 round 22px)}}
.enter-fade{animation:fadein .5s ease both}
@keyframes fadein{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.scan-capsule,.pop,.cross-heart,.laser,.typing,.ecg-draw,.ecg-idle,.skel,.photo-in,.scan-banner img,.enter-unfold,.enter-drop,.enter-pill,.enter-fade{animation:none}}
`;

export function ScanTrials() {
  return (
    <main className="min-h-screen bg-[#F4F8F6] px-4 py-10">
      <style>{`${ISLAND_CSS}\n${AURORE_CSS}\n${ROUTINE_CSS}\n${TRIAL_CSS}`}</style>
      <div className="mx-auto max-w-6xl">
        <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[#0F2F2A]">Le moment du scan : cinq essais</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-7 text-[#4D6B64]">
          Aujourd&apos;hui, au scan, la bannière coche des lignes (« Lecture de la boîte », etc.). Ici, cinq animations à la place, chacune suivie de la vraie bannière. Elles se rejouent toutes seules ; « Rejouer » relance un essai. Vente d&apos;exemple.
        </p>
        <div data-ile-style="aurore" className="mt-8 grid gap-5 lg:grid-cols-2">
          {TRIALS.map((trial) => (
            <TrialCard key={trial.key} letter={trial.key} title={trial.title} text={trial.text} Trial={trial.Trial} />
          ))}
        </div>
      </div>
    </main>
  );
}
