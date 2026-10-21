"use client";

import { Robot } from "@/components/robot/robot";

const CHIP = "rounded-full border border-warning-200 bg-warning-50 px-3.5 py-2 text-[13.5px] font-semibold text-warning-900";
const TITLE = "text-[34px] leading-[1.05] font-semibold tracking-[-0.03em] text-text-primary text-balance md:text-[48px]";

function RobotBar({ line = "Au scan, le bon conseil, pris dans votre rayon." }: { line?: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-[#0F2F2A] p-4 text-white">
      <Robot size={52} mood="happy" label="Le robot PharmaBoost" />
      <div>
        <p className="text-[16px] font-bold">PharmaBoost y pense pour vous.</p>
        <p className="mt-0.5 text-[13.5px] text-[#BFD9D0]">{line}</p>
      </div>
    </div>
  );
}

function Frame({ n, label, hint, children }: { n: string; label: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-[#D9E2DF] bg-surface-app">
      <div className="border-b border-[#D9E2DF] px-6 py-3">
        <p className="text-[14px] font-bold text-[#0F2F2A]">{n} · {label}</p>
        <p className="text-[12.5px] text-[#4B6A62]">{hint}</p>
      </div>
      <div className="px-6 py-12 md:px-10">{children}</div>
    </section>
  );
}

const CSS = `
@keyframes c-in { from { opacity: 0; transform: translateY(8px) scale(.96); } to { opacity: 1; transform: none; } }
@keyframes c-out { 0%, 70% { opacity: 1; } 100% { opacity: .25; filter: blur(1px); } }
.c-chip { animation: c-in .5s cubic-bezier(.2,.8,.2,1) both, c-out 3.5s ease forwards; }
.c-robot { animation: c-in .6s cubic-bezier(.2,.8,.2,1) 2.6s both; }
@keyframes c-defile { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.c-defile { animation: c-defile 28s linear infinite; }
@media (prefers-reduced-motion: reduce) { .c-chip, .c-robot, .c-defile { animation: none; } }
`;

const ALL = ["Ordonnance de 6 lignes", "Patient pressé", "File d'attente", "Posologie à rappeler", "Date courte en réserve", "Challenge du laboratoire", "Le bon conseil ?", "Quel produit en stock ?"];

export function ConstatVariants() {
  return (
    <main className="min-h-screen bg-white px-4 py-8">
      <style>{CSS}</style>
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <h1 className="text-[24px] font-bold text-[#0F2F2A]">« Le pharmacien ne peut pas penser à tout », en moins de texte</h1>
          <p className="mt-1 text-[14px] text-[#4B6A62]">Quatre façons de dire la même chose. Rechargez la page pour revoir les animations.</p>
        </div>

        <Frame n="0" label="Aujourd'hui" hint="Le titre, un paragraphe de quatre lignes, huit pastilles et le robot.">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className={TITLE}>Le pharmacien ne peut pas penser à tout.</h2>
              <p className="mt-4 text-[20px] leading-8 font-medium text-text-primary">Une ordonnance chargée, un patient pressé, la file qui s&apos;allonge : le pharmacien est vite débordé. Le conseil qui accompagnerait le traitement passe à la trappe. PharmaBoost est là pour l&apos;accompagner et le soulager.</p>
            </div>
            <div className="rounded-[28px] border border-border-subtle bg-surface-card p-7">
              <div className="flex flex-wrap gap-2">{ALL.map((c) => <span key={c} className={CHIP}>{c}</span>)}</div>
              <div className="mt-6"><RobotBar /></div>
            </div>
          </div>
        </Frame>

        <Frame n="A" label="Une seule phrase" hint="Le paragraphe tient en une ligne ; quatre pastilles au lieu de huit.">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className={TITLE}>Le pharmacien ne peut pas penser à tout.</h2>
              <p className="mt-4 text-[20px] leading-8 font-medium text-text-primary">Alors le conseil passe à la trappe.</p>
            </div>
            <div className="rounded-[28px] border border-border-subtle bg-surface-card p-7">
              <div className="flex flex-wrap gap-2">{["Ordonnance de 6 lignes", "Patient pressé", "File d'attente", "Le bon conseil ?"].map((c) => <span key={c} className={CHIP}>{c}</span>)}</div>
              <div className="mt-6"><RobotBar /></div>
            </div>
          </div>
        </Frame>

        <Frame n="B" label="Le désordre, puis le calme" hint="Aucun paragraphe. Les pastilles arrivent, s'estompent, et le robot apporte la réponse.">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <h2 className={TITLE}>Le pharmacien ne peut pas penser à tout.</h2>
            <div className="rounded-[28px] border border-border-subtle bg-surface-card p-7">
              <div className="flex flex-wrap gap-2">{ALL.map((c, i) => <span key={c} className={`c-chip ${CHIP}`} style={{ animationDelay: `${i * 180}ms, ${i * 180}ms` }}>{c}</span>)}</div>
              <div className="c-robot mt-6"><RobotBar /></div>
            </div>
          </div>
        </Frame>

        <Frame n="C" label="Trois mots, une réponse" hint="Centré, en grand : trois mots qui disent la pression, puis le robot.">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className={TITLE}>6 lignes. 1 patient pressé. Et le conseil ?</h2>
            <div className="mx-auto mt-8 max-w-xl text-left"><RobotBar line="Il pense au conseil à votre place, au moment du scan." /></div>
          </div>
        </Frame>

        <Frame n="D" label="Le bandeau qui défile" hint="Le titre seul ; les pastilles défilent en continu sous lui, puis le robot.">
          <div className="text-center">
            <h2 className={TITLE}>Le pharmacien ne peut pas penser à tout.</h2>
            <div className="relative mt-8 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
              <div className="c-defile flex w-max gap-2">{[...ALL, ...ALL].map((c, i) => <span key={i} className={`${CHIP} whitespace-nowrap`}>{c}</span>)}</div>
            </div>
            <div className="mx-auto mt-6 max-w-xl text-left"><RobotBar /></div>
          </div>
        </Frame>
      </div>
    </main>
  );
}
