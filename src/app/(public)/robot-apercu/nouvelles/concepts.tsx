"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Pill, ScanLine, Sparkles, Star, Timer, X } from "lucide-react";
import { CounterIsland } from "@/components/island/counter-island";
import { ISLAND_CSS } from "@/components/island/island-shell";
import { INITIAL_ISLAND } from "@/core/island/banner-flow";
import { BOXES, GAVISCON, ITEMS } from "../styles/styles";

/* Les couleurs de la bannière en ligne (« C — Vert PharmaBoost »). */
const G = { bg: "#0F2F2A", deep: "#0A221E", lemon: "#E8FF9C", teal: "#247061", paper: "#F4F8F6", ink: "#0F2F2A", soft: "#4D6B64", line: "#DCE7E2", cell: "#E9F1EE", warn: "#B54708", red: "#B42318" };

/* ------------------------------------------------------------------ la vente d'exemple (vidéo du 19 oct., chiffres d'exemple) */

type Answer = { label: string; say: string; product?: string; stop?: boolean };
type Advice = { name: string; price: string; margin: string; marginCents: number; stock: number; low?: boolean; challenge?: string; shortDate?: string; why: string; ask: [string, string]; answers: [Answer[], Answer[]]; pitch: string };
type Box = { drug: string; advice: Advice[] };

const SALE: Box[] = [
  {
    drug: "PHLOROGLUCINOL VIATRIS 80 mg",
    advice: [
      {
        name: "MACROGOL 4000 ARROW 4 g",
        price: "5,20 €",
        margin: "1,85 €",
        marginCents: 185,
        stock: 14,
        why: "Des douleurs de ventre s'accompagnent souvent de constipation.",
        ask: ["Avez-vous aussi du mal à aller à la selle ?", "Est-ce pour un enfant de moins de 8 ans ?"],
        answers: [
          [{ label: "Oui", say: "Un sachet le matin, dans un grand verre d'eau." }, { label: "Non", say: "Rien à ajouter pour le transit.", stop: true }],
          [{ label: "Non", say: "Je vous propose ce produit." }, { label: "Oui", say: "Demandez l'avis du médecin pour un enfant.", stop: true }],
        ],
        pitch: "Ce laxatif doux réhydrate les selles sans irriter l'intestin. Un sachet par jour, le matin, dans un verre d'eau.",
      },
    ],
  },
  {
    drug: "GAVISCONELL MENTHE SANS SUCRE",
    advice: [
      {
        name: "NEOBIANACID CITRON CPR 70",
        price: "15,50 €",
        margin: "4,79 €",
        marginCents: 479,
        stock: 8,
        challenge: "Challenge Neobianacid · 12/20",
        why: "Pour les brûlures qui reviennent, un protecteur en comprimé, facile à emporter.",
        ask: ["Les brûlures reviennent-elles surtout après les repas ou la nuit ?", "Avez-vous du mal à avaler, ou maigrissez-vous sans raison ?"],
        answers: [
          [{ label: "Après les repas", say: "À croquer juste après le repas, dès les premières brûlures." }, { label: "Surtout la nuit", say: "Au coucher, et surélevez la tête du lit.", product: "NEOBIANACID Cpr suc B/45 MENTHE" }],
          [{ label: "Non", say: "Je vous propose ce produit." }, { label: "Oui", say: "Je ne propose rien : parlez-en au médecin sans attendre.", stop: true }],
        ],
        pitch: "Ces comprimés forment un film protecteur qui calme les brûlures en complément de votre traitement. Un comprimé à croquer après le repas ou au coucher.",
      },
      {
        name: "NEOBIANACID Cpr suc B/45 MENTHE",
        price: "15,50 €",
        margin: "4,79 €",
        marginCents: 479,
        stock: 3,
        low: true,
        shortDate: "11/2026",
        why: "La même protection au goût menthe, à écouler avant sa date courte.",
        ask: ["Préférez-vous le goût menthe ?", "Avez-vous du mal à avaler, ou maigrissez-vous sans raison ?"],
        answers: [
          [{ label: "Oui, menthe", say: "Parfait, celui-ci est à la menthe." }, { label: "Plutôt citron", say: "Prenez plutôt le citron.", product: "NEOBIANACID CITRON CPR 70" }],
          [{ label: "Non", say: "Je vous propose ce produit." }, { label: "Oui", say: "Je ne propose rien : parlez-en au médecin sans attendre.", stop: true }],
        ],
        pitch: "Un comprimé à sucer après le repas ou au coucher, jusqu'à quatre par jour.",
      },
    ],
  },
];
const ALL = SALE.flatMap((box) => box.advice.map((advice) => ({ ...advice, drug: box.drug })));
const TOTAL_MARGIN = (ALL.reduce((sum, a) => sum + a.marginCents, 0) / 100).toFixed(2).replace(".", ",");

/* ---------------------------------------------------------------------------------------------------------- petits morceaux */

function Tags({ advice, dark }: { advice: Advice; dark?: boolean }) {
  return (
    <span className="flex flex-wrap gap-1">
      {advice.challenge && (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: G.lemon, color: "#3D4F00" }}>
          <Star className="size-3" aria-hidden="true" /> Challenge
        </span>
      )}
      {advice.shortDate && (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "#FFE1DE", color: G.red }}>
          <Timer className="size-3" aria-hidden="true" /> Date courte {advice.shortDate}
        </span>
      )}
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={dark ? { background: "rgba(255,255,255,0.1)", color: "#fff" } : { background: G.cell, color: advice.low ? G.warn : G.teal }}>
        {advice.low ? "Stock faible" : "En stock"} · {advice.stock}
      </span>
    </span>
  );
}

function Figures({ advice }: { advice: Advice }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {[
        ["Prix", advice.price],
        ["Marge HT", advice.margin],
        ["Stock", String(advice.stock)],
      ].map(([label, value]) => (
        <div key={label} className="rounded-lg px-2 py-1.5 text-center" style={{ background: G.cell }}>
          <p className="text-[9.5px] font-bold tracking-[0.06em] uppercase" style={{ color: G.soft }}>{label}</p>
          <p className="text-[14px] font-extrabold tabular-nums" style={{ color: label === "Stock" && advice.low ? G.warn : G.ink }}>{value}</p>
        </div>
      ))}
    </div>
  );
}

/** Les deux questions, réponses à toucher, et ce qu'elles changent. */
function Questions({ advice, big }: { advice: Advice; big?: boolean }) {
  const [picked, setPicked] = useState<(number | null)[]>([null, null]);
  return (
    <ol className="space-y-2.5">
      {advice.ask.map((question, q) => {
        const chosen = picked[q] !== null ? advice.answers[q][picked[q]!] : null;
        return (
          <li key={question}>
            <p className={`flex gap-2 font-bold ${big ? "text-[14px]" : "text-[12.5px]"}`} style={{ color: G.ink }}>
              <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10.5px]" style={{ background: G.teal, color: "#fff" }}>{q + 1}</span>
              {question}
            </p>
            <div className="mt-1.5 ml-7 flex flex-wrap gap-1.5">
              {advice.answers[q].map((answer, a) => (
                <button key={answer.label} type="button" onClick={() => setPicked(picked.map((v, i) => (i === q ? (v === a ? null : a) : v)))} className={`rounded-full border font-semibold transition-colors ${big ? "h-9 px-4 text-[13px]" : "h-7 px-3 text-[12px]"}`} style={picked[q] === a ? { background: G.teal, borderColor: G.teal, color: "#fff" } : { background: "#fff", borderColor: "#B9CFC6", color: G.ink }}>
                  {answer.label}
                </button>
              ))}
            </div>
            {chosen && (
              <div className="mt-1.5 ml-7 rounded-lg px-2.5 py-2 text-[12.5px]" style={{ background: chosen.stop ? "#FFF3D6" : "rgba(232,255,156,0.6)", color: G.ink }}>
                {chosen.say}
                {chosen.product && (
                  <p className="mt-1 font-bold" style={{ color: G.teal }}>
                    → Proposer plutôt : {chosen.product}
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Robot({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full" style={{ width: size, height: size, background: G.lemon, color: G.bg }}>
      <Sparkles className="size-[55%]" aria-hidden="true" />
    </span>
  );
}

/** Un faux écran de LGPI, pour juger ce que la bannière cache. */
function FakeLgpi({ children, height = 820 }: { children: ReactNode; height?: number }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[#B8C2CC] bg-[#EEF1F4]" style={{ height }}>
      <div className="flex h-9 items-center gap-2 bg-[#3B5A7A] px-3 text-[12px] font-semibold text-white/90">LGPI · Vente n° 1 sur 1 · BENVENISTE Donna</div>
      <div className="grid grid-cols-[1fr_120px_80px_80px] gap-px bg-[#C9D2DA] text-[11.5px]">
        {["Désignation", "Prest", "Stock", "Prix"].map((h) => (
          <div key={h} className="bg-[#DCE3EA] px-2 py-1.5 font-bold text-[#334]">{h}</div>
        ))}
        {[
          ["PHLOROGLUCINOL VIATRIS 80 mg", "PHN", "31", "3,10 €"],
          ["GAVISCONELL MENTHE SANS SUCRE", "PHN", "26", "8,80 €"],
        ].map((row) => row.map((cell, i) => <div key={cell + i} className="bg-[#FFF8D6] px-2 py-1.5 text-[#223]">{cell}</div>))}
      </div>
      <div className="absolute right-3 bottom-3 rounded-md bg-[#3B5A7A] px-3 py-2 text-[12px] font-bold text-white">Total : 11,90 €</div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------- 1. le guide pas à pas */

function Guided() {
  const [at, setAt] = useState(1);
  const advice = ALL[at];
  return (
    <FakeLgpi>
      <div className="absolute top-12 left-1/2 w-[400px] -translate-x-1/2 overflow-hidden rounded-[22px] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]" style={{ background: G.bg }}>
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 text-white">
          <Robot />
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-semibold text-white/60">Pour {advice.drug}</span>
            <span className="block text-[14px] font-extrabold">Conseil {at + 1} sur {ALL.length}</span>
          </span>
          <button type="button" aria-label="Conseil précédent" onClick={() => setAt((at + ALL.length - 1) % ALL.length)} className="inline-flex size-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"><ChevronLeft className="size-4" /></button>
          <button type="button" aria-label="Conseil suivant" onClick={() => setAt((at + 1) % ALL.length)} className="inline-flex size-8 items-center justify-center rounded-full" style={{ background: G.lemon, color: G.bg }}><ChevronRight className="size-4" /></button>
        </div>
        <div className="mx-2 mb-2 space-y-3 rounded-[16px] p-3.5" style={{ background: G.paper }}>
          <div>
            <p className="text-[17px] leading-tight font-extrabold" style={{ color: G.ink }}>{advice.name}</p>
            <p className="mt-1 text-[12.5px]" style={{ color: G.soft }}>{advice.why}</p>
            <div className="mt-2"><Tags advice={advice} /></div>
          </div>
          <Figures advice={advice} />
          <div className="border-t pt-3" style={{ borderColor: G.line }}>
            <p className="mb-2 text-[10.5px] font-bold tracking-[0.08em] uppercase" style={{ color: G.soft }}>1 · Demandez</p>
            <Questions key={advice.name} advice={advice} big />
          </div>
          <div className="border-t pt-3" style={{ borderColor: G.line }}>
            <p className="mb-1 text-[10.5px] font-bold tracking-[0.08em] uppercase" style={{ color: G.soft }}>2 · Dites</p>
            <p className="text-[13px] leading-5" style={{ color: G.ink }}>« {advice.pitch} »</p>
          </div>
          <p className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-bold" style={{ background: G.lemon, color: G.bg }}>
            <ScanLine className="size-4" aria-hidden="true" /> 3 · Bipez-le : il passe en vendu tout seul
          </p>
        </div>
        <div className="flex justify-center gap-1.5 pb-2.5">
          {ALL.map((a, i) => <span key={a.name} className="h-1.5 rounded-full transition-all" style={{ width: i === at ? 18 : 6, background: i === at ? G.lemon : "rgba(255,255,255,0.3)" }} />)}
        </div>
      </div>
    </FakeLgpi>
  );
}

/* ------------------------------------------------------------------------------------------------ 2. le bandeau fin */

function Strip() {
  const [open, setOpen] = useState<number | null>(1);
  return (
    <FakeLgpi>
      <div className="absolute inset-x-3 top-11">
        <div className="flex items-center gap-1.5 rounded-full p-1.5 pr-2 shadow-[0_14px_34px_-14px_rgba(0,0,0,0.6)]" style={{ background: G.bg }}>
          <Robot size={30} />
          {ALL.map((advice, i) => (
            <button key={advice.name} type="button" onClick={() => setOpen(open === i ? null : i)} className="flex min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-1.5 text-left transition-colors" style={open === i ? { background: G.lemon, color: G.bg } : { background: "rgba(255,255,255,0.08)", color: "#fff" }}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-extrabold">{advice.name}</span>
                <span className="block truncate text-[11px] font-semibold opacity-75">{advice.price} · marge {advice.margin}{advice.challenge ? " · ★" : ""}{advice.shortDate ? " · date courte" : ""}</span>
              </span>
              <ChevronDown className={`size-4 shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
          ))}
          <button type="button" className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[12px] font-bold" style={{ background: G.teal, color: "#fff" }}><Check className="size-4" /> Terminer</button>
        </div>
        {open !== null && (
          <div className="mx-auto mt-2 w-[460px] space-y-3 rounded-[18px] p-4 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.55)]" style={{ background: G.paper }}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11.5px] font-semibold" style={{ color: G.soft }}>Pour {ALL[open].drug}</p>
                <p className="text-[16px] font-extrabold" style={{ color: G.ink }}>{ALL[open].name}</p>
              </div>
              <button type="button" aria-label="Fermer" onClick={() => setOpen(null)} className="rounded-full p-1 hover:bg-black/5"><X className="size-4" /></button>
            </div>
            <Tags advice={ALL[open]} />
            <Questions key={open} advice={ALL[open]} />
            <p className="rounded-lg px-3 py-2 text-[12.5px]" style={{ background: G.cell, color: G.ink }}><b>À dire :</b> {ALL[open].pitch}</p>
          </div>
        )}
      </div>
    </FakeLgpi>
  );
}

/* -------------------------------------------------------------------------------------------- 3. le volet de côté */

function Side() {
  const [open, setOpen] = useState<string | null>(ALL[1].name);
  return (
    <FakeLgpi>
      <aside className="absolute top-9 right-0 bottom-0 flex w-[350px] flex-col shadow-[-20px_0_50px_-30px_rgba(0,0,0,0.6)]" style={{ background: G.bg }}>
        <div className="flex items-center gap-2.5 px-4 py-3 text-white">
          <Robot size={34} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-extrabold">{ALL.length} conseils</p>
            <p className="text-[11.5px] font-semibold" style={{ color: G.lemon }}>Jusqu&apos;à {TOTAL_MARGIN} € de marge sur cette vente</p>
          </div>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-2.5 pb-2">
          {SALE.map((box) => (
            <div key={box.drug}>
              <p className="flex items-center gap-1.5 px-1.5 pb-1 text-[11.5px] font-bold text-white/60"><Pill className="size-3.5" aria-hidden="true" /> {box.drug}</p>
              <div className="space-y-1.5">
                {box.advice.map((advice) => (
                  <div key={advice.name} className="rounded-[14px]" style={{ background: G.paper }}>
                    <button type="button" onClick={() => setOpen(open === advice.name ? null : advice.name)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] leading-tight font-extrabold" style={{ color: G.ink }}>{advice.name}</span>
                        <span className="mt-1 block"><Tags advice={advice} /></span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[13px] font-extrabold tabular-nums" style={{ color: G.ink }}>{advice.price}</span>
                        <span className="block text-[11px] font-bold tabular-nums" style={{ color: G.teal }}>+{advice.margin}</span>
                      </span>
                    </button>
                    {open === advice.name && (
                      <div className="space-y-2.5 border-t px-3 pt-2.5 pb-3" style={{ borderColor: G.line }}>
                        <Questions advice={advice} />
                        <p className="text-[12.5px] leading-5" style={{ color: G.ink }}><b>À dire :</b> {advice.pitch}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="p-2.5">
          <button type="button" className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-extrabold" style={{ background: G.lemon, color: G.bg }}><Check className="size-4" /> Terminer la vente</button>
        </div>
      </aside>
    </FakeLgpi>
  );
}

/* ------------------------------------------------------------------------------- 4. le meilleur conseil d'abord */

/** Le conseil à proposer en premier : celui qui coche le plus (challenge, date courte), puis la meilleure marge. */
const BEST = [...ALL].sort((a, b) => Number(Boolean(b.challenge)) + Number(Boolean(b.shortDate)) - (Number(Boolean(a.challenge)) + Number(Boolean(a.shortDate))) || b.marginCents - a.marginCents)[0];

function Best() {
  const [more, setMore] = useState(false);
  const [others, setOthers] = useState(false);
  return (
    <FakeLgpi>
      <div className="absolute right-4 bottom-14 w-[380px] overflow-hidden rounded-[22px] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]" style={{ background: G.bg }}>
        <div className="flex items-center gap-2 px-4 pt-3 text-white">
          <Robot />
          <p className="text-[11px] font-bold tracking-[0.12em] uppercase" style={{ color: G.lemon }}>À proposer maintenant</p>
        </div>
        <div className="px-4 pt-2 pb-3 text-white">
          <p className="text-[20px] leading-tight font-extrabold">{BEST.name}</p>
          <p className="mt-1 text-[12.5px] text-white/70">Pour {BEST.drug}</p>
          <div className="mt-3 flex items-end gap-6">
            <div><p className="text-[10px] font-bold tracking-[0.08em] text-white/50 uppercase">Prix</p><p className="text-[24px] font-extrabold whitespace-nowrap tabular-nums">{BEST.price}</p></div>
            <div><p className="text-[10px] font-bold tracking-[0.08em] text-white/50 uppercase">Marge HT</p><p className="text-[24px] font-extrabold whitespace-nowrap tabular-nums" style={{ color: G.lemon }}>{BEST.margin}</p></div>
          </div>
          <div className="mt-2"><Tags advice={BEST} dark /></div>
          <p className="mt-3 rounded-xl bg-white/[0.08] px-3 py-2.5 text-[13px] leading-5">« {BEST.pitch} »</p>
        </div>
        {more && (
          <div className="mx-2 mb-2 rounded-[16px] p-3" style={{ background: G.paper }}>
            <Questions advice={BEST} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-1.5 px-2 pb-2">
          <button type="button" onClick={() => setMore(!more)} className="h-10 rounded-xl text-[13px] font-bold" style={{ background: G.lemon, color: G.bg }}>{more ? "Masquer les questions" : "Les 2 questions"}</button>
          <button type="button" onClick={() => setOthers(!others)} className="h-10 rounded-xl bg-white/10 text-[13px] font-bold text-white hover:bg-white/15">Autres conseils ({ALL.length - 1})</button>
        </div>
        {others && (
          <ul className="space-y-1 px-2 pb-2">
            {ALL.filter((a) => a !== BEST).map((a) => (
              <li key={a.name} className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-2 text-white">
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold">{a.name}</span>
                <span className="text-[12px] font-bold tabular-nums" style={{ color: G.lemon }}>+{a.margin}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </FakeLgpi>
  );
}

/* ------------------------------------------------------------------------------- 0. la bannière en ligne, pour comparer */

const noop = () => {};

function Current() {
  return (
    <FakeLgpi>
      <div className="absolute inset-x-0 top-11 flex justify-center">
        <CounterIsland
          state={{ ...INITIAL_ISLAND, stage: "advice", outcomes: [null, null, null] }}
          items={ITEMS}
          drug={GAVISCON}
          alert={null}
          pills={[]}
          boxes={BOXES}
          compactAdvice
          keepAwake
          autoOutcome
          onAnswer={noop}
          onEmail={noop}
          onSendEmail={noop}
          onAddEmail={noop}
          onFinish={noop}
          onDismissAlert={noop}
          finishLabel="Terminer la vente"
        />
      </div>
    </FakeLgpi>
  );
}

/* ------------------------------------------------------------------------------------------------------- la page */

const CONCEPTS = [
  { id: "0", name: "Ta bannière actuelle (en ligne)", pitch: "Celle qui tourne aujourd'hui dans les pharmacies, avec la même vente, pour comparer. Passez la souris dessus pour dérouler le menu.", view: <Current /> },
  { id: "1", name: "Le guide pas à pas", pitch: "Une seule carte, en trois temps : demandez → dites → bipez. On passe d'un conseil à l'autre avec les flèches. Le plus simple pour un pharmacien qui débute.", view: <Guided /> },
  { id: "2", name: "Le bandeau fin", pitch: "Une barre fine en haut de l'écran : tous les conseils d'un coup d'œil avec prix et marge. Un clic déroule les questions. Ne cache presque rien de LGPI.", view: <Strip /> },
  { id: "3", name: "Le volet de côté", pitch: "Un panneau contre le bord droit, rangé boîte par boîte, avec la marge possible de la vente en haut. Tout est lisible sans survol, rien ne bouge.", view: <Side /> },
  { id: "4", name: "Le meilleur conseil d'abord", pitch: "PharmaBoost choisit LE conseil à proposer (challenge, date courte, meilleure marge) et l'affiche en grand, en bas à droite. Les autres sont à un clic. Le plus rapide : une seconde.", view: <Best /> },
];

export function NewBanners() {
  return (
    <main className="min-h-dvh bg-[#E9EDF1] px-4 py-6 sm:px-6">
      <style>{ISLAND_CSS}</style>
      <div className="mx-auto max-w-[1500px]">
        <p className="font-mono text-[11.5px] tracking-[0.14em] text-brand-700 uppercase">Aperçu de développement</p>
        <h1 className="mt-1 text-[26px] leading-tight font-bold tracking-[-0.02em] text-text-primary">Quatre nouvelles bannières, et l&apos;actuelle</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-text-secondary">
          La même vente (PHLOROGLUCINOL + GAVISCONELL), posée sur un faux écran de LGPI pour juger ce qu&apos;elle cache. Tout est cliquable : réponses du patient, flèches, onglets. Dites-moi le numéro que vous voulez, ou ce que vous prenez dans chacune.
        </p>
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          {CONCEPTS.map((c) => (
            <section key={c.id} className="rounded-2xl border border-border-subtle bg-white p-4 shadow-sm" data-concept={c.id}>
              <header className="mb-3 flex items-start gap-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[17px] font-bold" style={{ background: G.bg, color: G.lemon }}>{c.id}</span>
                <div>
                  <h2 className="text-[17px] font-bold text-text-primary">{c.name}</h2>
                  <p className="text-[13px] leading-5 text-text-secondary">{c.pitch}</p>
                </div>
              </header>
              {c.view}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
