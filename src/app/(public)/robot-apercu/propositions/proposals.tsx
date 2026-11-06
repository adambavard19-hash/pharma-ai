"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Droplets, ScanLine, Sparkles, Star } from "lucide-react";
import { GreenCross } from "@/components/island/scan-capsule";

/**
 * Quatre propositions de bannière, chacune jouant les trois moments du comptoir : le scan, le chargement (l'analyse), le
 * conseil. Exemple sans marque : Isotrétinoïne 20 mg → crème lavante apaisante + baume lèvres. Aucune ombre noire : les
 * ombres sont teintées menthe et très douces, comme le reste de PharmaBoost.
 */

type Phase = "scan" | "load" | "advice";
const LENGTH: Record<Phase, number> = { scan: 1600, load: 2600, advice: 4600 };
const NEXT: Record<Phase, Phase> = { scan: "load", load: "advice", advice: "scan" };
const LABEL: Record<Phase, string> = { scan: "Scan", load: "Chargement", advice: "Conseil" };

const DRUG = "Isotrétinoïne 20 mg";
const ADVICE = [
  { name: "Crème lavante apaisante", stock: 6, challenge: true },
  { name: "Baume lèvres réparateur", stock: 12, challenge: false },
];
const STEPS = ["Stock lu", "Dates courtes", "Challenges laboratoires"];

const MINT = "#0E8A7B";
const INK = "#0F2B26";
const SOFT = "0 18px 40px -18px rgba(14,138,123,.45), 0 2px 6px -2px rgba(14,138,123,.18)";

const CSS = `
@keyframes pp-sweep { 0% { transform: translateX(-30%); } 100% { transform: translateX(330%); } }
@keyframes pp-fill { from { width: 0%; } to { width: 100%; } }
@keyframes pp-shimmer { 0% { background-position: -240px 0; } 100% { background-position: 240px 0; } }
@keyframes pp-in { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes pp-pulse { 0% { transform: scale(.7); opacity: .7; } 100% { transform: scale(1.9); opacity: 0; } }
@keyframes pp-ring { from { stroke-dashoffset: 113; } to { stroke-dashoffset: 0; } }
@keyframes pp-draw { from { stroke-dashoffset: 40; } to { stroke-dashoffset: 0; } }
@keyframes pp-bar { 0%,100% { transform: scaleY(.35); } 50% { transform: scaleY(1); } }
@keyframes pp-pop { 0% { transform: scale(0); } 70% { transform: scale(1.2); } 100% { transform: scale(1); } }
@keyframes pp-glow { 0%,100% { box-shadow: 0 0 0 0 rgba(14,138,123,.0); } 50% { box-shadow: 0 0 0 6px rgba(14,138,123,.12); } }
.pp-in { animation: pp-in .45s cubic-bezier(.2,.9,.3,1.2) both; }
.pp-skel { background: linear-gradient(90deg, #E7F2EF 0px, #F6FBFA 80px, #E7F2EF 160px); background-size: 480px 100%; animation: pp-shimmer 1.1s linear infinite; border-radius: 8px; }
`;

/** Le cycle commun : en boucle, ou figé sur un moment. */
function usePhase(fixed: Phase | null): { phase: Phase; turn: number } {
  const [state, setState] = useState<{ phase: Phase; turn: number }>({ phase: "scan", turn: 0 });
  useEffect(() => {
    if (fixed) return;
    const id = setTimeout(() => setState((s) => ({ phase: NEXT[s.phase], turn: s.turn + 1 })), LENGTH[state.phase]);
    return () => clearTimeout(id);
  }, [fixed, state]);
  return fixed ? { phase: fixed, turn: -1 } : state;
}

function Thumb({ size = 40 }: { size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-xl" style={{ width: size, height: size, background: "linear-gradient(145deg,#E3F4F0,#C9EAE2)" }}>
      <Droplets className="text-[#0E8A7B]" style={{ width: size * 0.5, height: size * 0.5 }} aria-hidden="true" />
    </span>
  );
}

function StockChip({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F5F1] px-2 py-0.5 text-[11px] font-bold text-[#0B6F63]">
      <span className="size-1.5 rounded-full bg-[#14A38F]" /> {n} en stock
    </span>
  );
}

function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <span className={`${small ? "text-[10px]" : "text-[11px]"} font-bold tracking-[0.22em] whitespace-nowrap uppercase`} style={{ color: INK }}>
      Pharma<span style={{ color: MINT }}>boost</span>
    </span>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// A — Verre clair : la capsule s'élargit d'un moment à l'autre ; laser au scan, barre de progression, carte du conseil.
// ---------------------------------------------------------------------------------------------------------------
function GlassBanner({ phase, turn }: { phase: Phase; turn: number }) {
  const width = phase === "scan" ? 290 : phase === "load" ? 340 : 390;
  return (
    <div className="overflow-hidden rounded-[22px] border border-[#BFE6DD] bg-white/85 backdrop-blur-xl transition-[width] duration-500 ease-out" style={{ width, boxShadow: SOFT }}>
      <div className="flex h-11 items-center gap-2.5 px-4">
        <GreenCross lit={4} size={20} />
        <Wordmark />
        <span className="ml-auto text-[11px] font-semibold text-[#5B7A73]">{phase === "advice" ? `${ADVICE.length} conseils` : ""}</span>
      </div>
      <div key={`${phase}-${turn}`} className="pp-in px-4 pb-4">
        {phase === "scan" && (
          <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl bg-[#F3FAF8] px-3 py-3">
            <ScanLine className="size-6 text-[#0E8A7B]" aria-hidden="true" />
            <div>
              <p className="text-[11px] font-bold tracking-wide text-[#0E8A7B] uppercase">Scan détecté</p>
              <p className="text-[14px] font-bold" style={{ color: INK }}>{DRUG}</p>
            </div>
            <span className="absolute inset-y-0 left-0 w-1/4" style={{ background: "linear-gradient(90deg,transparent,rgba(20,163,143,.35),transparent)", animation: "pp-sweep 1s ease-in-out infinite" }} />
          </div>
        )}
        {phase === "load" && (
          <div>
            <p className="text-[13.5px] font-bold" style={{ color: INK }}>Analyse de l&apos;ordonnance…</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E3F1EE]">
              <div className="h-full rounded-full" style={{ background: "linear-gradient(90deg,#14A38F,#0E8A7B)", animation: `pp-fill ${LENGTH.load - 300}ms ease-in-out both` }} />
            </div>
            <div className="mt-2 flex gap-3 text-[11px] font-semibold text-[#5B7A73]">
              {STEPS.map((step, i) => (
                <span key={step} className="pp-in inline-flex items-center gap-1 whitespace-nowrap" style={{ animationDelay: `${300 + i * 650}ms` }}>
                  <Check className="size-3 text-[#14A38F]" aria-hidden="true" /> {step}
                </span>
              ))}
            </div>
          </div>
        )}
        {phase === "advice" && (
          <div className="space-y-2">
            {ADVICE.map((a, i) => (
              <div key={a.name} className="pp-in flex items-center gap-3 rounded-2xl border border-[#D8EEE9] bg-white px-3 py-2.5" style={{ animationDelay: `${i * 140}ms` }}>
                <Thumb />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold" style={{ color: INK }}>{a.name}</p>
                  <p className="text-[11.5px] text-[#5B7A73]">pour {DRUG}</p>
                </div>
                <StockChip n={a.stock} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// B — Île vivante : une seule capsule qui respire ; onde au scan, anneau qui se remplit, puis elle s'ouvre vers le bas.
// ---------------------------------------------------------------------------------------------------------------
function IslandBanner({ phase, turn }: { phase: Phase; turn: number }) {
  const open = phase === "advice";
  return (
    <div className="overflow-hidden border border-[#CDEBE4] bg-white transition-all duration-500 ease-[cubic-bezier(.2,.9,.3,1.1)]" style={{ width: open ? 380 : 300, borderRadius: open ? 26 : 999, boxShadow: SOFT }}>
      <div className="flex h-12 items-center gap-3 px-3">
        <span className="relative flex size-8 items-center justify-center">
          {phase === "scan" && <span className="absolute inset-0 rounded-full bg-[#14A38F]" style={{ animation: "pp-pulse 1s ease-out infinite" }} />}
          {phase === "load" && (
            <svg viewBox="0 0 40 40" className="absolute inset-0 size-8 -rotate-90" aria-hidden="true">
              <circle cx="20" cy="20" r="18" fill="none" stroke="#E3F1EE" strokeWidth="3" />
              <circle key={turn} cx="20" cy="20" r="18" fill="none" stroke={MINT} strokeWidth="3" strokeLinecap="round" strokeDasharray="113" style={{ animation: `pp-ring ${LENGTH.load - 200}ms ease-in-out both` }} />
            </svg>
          )}
          <span className="relative"><GreenCross lit={4} size={18} /></span>
        </span>
        <div key={`${phase}-${turn}`} className="pp-in min-w-0 flex-1">
          {phase === "scan" && <p className="truncate text-[13.5px] font-bold" style={{ color: INK }}>{DRUG}</p>}
          {phase === "load" && <p className="truncate text-[13.5px] font-semibold text-[#3D5E57]">Recherche du meilleur conseil…</p>}
          {phase === "advice" && <Wordmark />}
        </div>
        {phase === "advice" && (
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] font-extrabold text-white" style={{ background: MINT, animation: "pp-pop .4s ease-out both" }}>{ADVICE.length}</span>
        )}
      </div>
      {open && (
        <div className="px-3 pb-3">
          {ADVICE.map((a, i) => (
            <div key={a.name} className="pp-in flex items-center gap-3 border-t border-[#EDF6F4] py-2.5" style={{ animationDelay: `${120 + i * 140}ms` }}>
              <Thumb size={36} />
              <p className="min-w-0 flex-1 truncate text-[13.5px] font-bold" style={{ color: INK }}>{a.name}</p>
              {a.challenge && <Star className="size-4 fill-[#F2B230] text-[#F2B230]" aria-label="Challenge laboratoire" />}
              <StockChip n={a.stock} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// C — Carte sobre : coche dessinée au scan, squelette scintillant au chargement, le vrai contenu prend sa place sans saut.
// ---------------------------------------------------------------------------------------------------------------
function SkeletonBanner({ phase, turn }: { phase: Phase; turn: number }) {
  return (
    <div className="w-[360px] rounded-[18px] border border-[#DCEFEA] bg-white p-4" style={{ boxShadow: SOFT }}>
      <div className="flex items-center gap-2">
        <GreenCross lit={4} size={18} />
        <Wordmark small />
        <span className="ml-auto rounded-full bg-[#F3FAF8] px-2 py-0.5 text-[10.5px] font-bold text-[#0B6F63]">{LABEL[phase]}</span>
      </div>
      <div key={`${phase}-${turn}`} className="mt-3 min-h-[118px]">
        {phase === "scan" && (
          <div className="pp-in flex h-[118px] flex-col items-center justify-center gap-2">
            <span className="flex size-12 items-center justify-center rounded-full bg-[#E6F5F1]">
              <svg viewBox="0 0 24 24" className="size-7" aria-hidden="true">
                <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke={MINT} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="40" style={{ animation: "pp-draw .6s .1s ease-out both" }} />
              </svg>
            </span>
            <p className="text-[13.5px] font-bold" style={{ color: INK }}>{DRUG} scanné</p>
          </div>
        )}
        {phase === "load" && (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="pp-skel size-10" />
                <div className="flex-1 space-y-1.5">
                  <span className="pp-skel block h-3.5 w-3/4" />
                  <span className="pp-skel block h-3 w-1/2" />
                </div>
                <span className="pp-skel h-5 w-16 rounded-full" />
              </div>
            ))}
            <p className="text-center text-[11px] font-semibold text-[#5B7A73]">Lecture du stock, des dates courtes et des challenges…</p>
          </div>
        )}
        {phase === "advice" && (
          <div className="space-y-3">
            {ADVICE.map((a, i) => (
              <div key={a.name} className="flex items-center gap-3" style={{ animation: `pp-in .4s ${i * 120}ms ease-out both` }}>
                <Thumb />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold" style={{ color: INK }}>{a.name}</p>
                  <p className="text-[11.5px] text-[#5B7A73]">{a.challenge ? "Challenge laboratoire en cours" : `pour ${DRUG}`}</p>
                </div>
                <StockChip n={a.stock} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// D — Bandeau menthe : dégradé vert, code-barres qui danse, étapes cochées une à une, carte blanche qui monte.
// ---------------------------------------------------------------------------------------------------------------
function MintBanner({ phase, turn }: { phase: Phase; turn: number }) {
  return (
    <div className="w-[380px] overflow-hidden rounded-[22px] p-[1px]" style={{ background: "linear-gradient(135deg,#7FD8C6,#0E8A7B)", boxShadow: SOFT }}>
      <div className="rounded-[21px] px-4 pt-3 pb-4" style={{ background: "linear-gradient(135deg,#16A792 0%,#0E8A7B 55%,#0B6F63 100%)" }}>
        <div className="flex items-center gap-2 text-white">
          <span className="rounded-md bg-white p-0.5"><GreenCross lit={4} size={16} /></span>
          <span className="text-[11px] font-bold tracking-[0.22em] uppercase">Pharmaboost</span>
          {phase === "advice" && <Sparkles className="ml-auto size-4 text-[#C9F5EA]" aria-hidden="true" />}
        </div>
        <div key={`${phase}-${turn}`} className="mt-3">
          {phase === "scan" && (
            <div className="pp-in flex items-center gap-4 text-white">
              <span className="flex h-9 items-end gap-[3px]" aria-hidden="true">
                {[3, 1, 2, 1, 3, 2, 1, 3, 1, 2].map((w, i) => (
                  <span key={i} className="h-full origin-bottom rounded-sm bg-white" style={{ width: w + 1, animation: `pp-bar .7s ${i * 60}ms ease-in-out infinite` }} />
                ))}
              </span>
              <div>
                <p className="text-[11px] font-semibold text-[#C9F5EA]">Boîte scannée</p>
                <p className="text-[15px] font-bold">{DRUG}</p>
              </div>
            </div>
          )}
          {phase === "load" && (
            <div className="flex flex-wrap gap-2">
              {STEPS.map((step, i) => (
                <span key={step} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11.5px] font-semibold text-white">
                  <span className="flex size-4 items-center justify-center rounded-full bg-white" style={{ animation: `pp-pop .35s ${400 + i * 650}ms ease-out both` }}>
                    <Check className="size-3 text-[#0E8A7B]" aria-hidden="true" />
                  </span>
                  {step}
                </span>
              ))}
            </div>
          )}
          {phase === "advice" && (
            <div className="space-y-2">
              {ADVICE.map((a, i) => (
                <div key={a.name} className="pp-in flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5" style={{ animationDelay: `${i * 140}ms`, animation: i === 0 ? `pp-in .45s ease-out both, pp-glow 1.6s .6s ease-in-out infinite` : undefined }}>
                  <Thumb size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold" style={{ color: INK }}>{a.name}</p>
                    {a.challenge && <p className="inline-flex items-center gap-1 text-[11px] font-bold text-[#B7791F]"><Star className="size-3 fill-current" aria-hidden="true" /> Challenge laboratoire</p>}
                  </div>
                  <StockChip n={a.stock} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Un faux écran de logiciel de gestion, gris clair, pour voir la bannière dans son décor. */
function Desk({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="text-[15px] font-bold" style={{ color: INK }}>{title}</h2>
        <p className="text-[12.5px] text-[#5B7A73]">{note}</p>
      </div>
      <div className="relative h-[330px] overflow-hidden rounded-2xl border border-[#DDE3E8] bg-[#EEF2F5]">
        <div className="h-8 bg-[#DCE3EA]" />
        <div className="space-y-2 p-4 opacity-70">
          {[90, 70, 80, 60, 75, 50].map((w, i) => <div key={i} className="h-3 rounded bg-[#D2DAE2]" style={{ width: `${w}%` }} />)}
        </div>
        <div className="absolute inset-x-0 top-3 flex justify-center">{children}</div>
      </div>
    </section>
  );
}

export function BannerProposals() {
  const [fixed, setFixed] = useState<Phase | null>(null);
  const { phase, turn } = usePhase(fixed);
  return (
    <main className="min-h-screen bg-[#F7FAF9] px-6 py-8">
      <style>{CSS}</style>
      <div className="mx-auto max-w-[1180px]">
        <h1 className="text-[22px] font-bold" style={{ color: INK }}>Bannière : quatre propositions</h1>
        <p className="mt-1 text-[13.5px] text-[#5B7A73]">Chacune joue le scan, le chargement puis le conseil, en boucle. Exemple : {DRUG}.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {([null, "scan", "load", "advice"] as const).map((p) => (
            <button key={p ?? "boucle"} type="button" onClick={() => setFixed(p)} className={`h-9 rounded-full px-4 text-[13px] font-bold transition ${fixed === p ? "bg-[#0E8A7B] text-white" : "border border-[#CFE3DE] bg-white text-[#0F2B26] hover:bg-[#F0F8F6]"}`}>
              {p ? `Figer : ${LABEL[p]}` : "Lecture en boucle"}
            </button>
          ))}
          <span className="ml-2 self-center text-[12.5px] font-semibold text-[#0E8A7B]">En cours : {LABEL[phase]}</span>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Desk title="A · Verre clair" note="La capsule s'élargit à chaque étape : laser au scan, barre de progression, cartes du conseil."><GlassBanner phase={phase} turn={turn} /></Desk>
          <Desk title="B · Île vivante" note="Une seule pilule qui respire : onde au scan, anneau qui se remplit, puis elle s'ouvre."><IslandBanner phase={phase} turn={turn} /></Desk>
          <Desk title="C · Carte sobre" note="Coche dessinée au scan, squelette scintillant au chargement, le contenu arrive sans saut."><SkeletonBanner phase={phase} turn={turn} /></Desk>
          <Desk title="D · Bandeau menthe" note="Dégradé vert, code-barres qui danse, étapes cochées une à une, cartes blanches."><MintBanner phase={phase} turn={turn} /></Desk>
        </div>
      </div>
    </main>
  );
}
