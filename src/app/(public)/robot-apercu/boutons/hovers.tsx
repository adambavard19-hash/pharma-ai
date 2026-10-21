"use client";

import { ArrowRight } from "lucide-react";

const EFFECTS = [
  { id: "aucun", label: "0 · Aujourd'hui", hint: "La couleur change à peine." },
  { id: "roule", label: "1 · Le texte roule", hint: "Le mot monte et laisse place au même mot qui arrive par en dessous ; la flèche file à droite." },
  { id: "reflet", label: "2 · Reflet qui traverse", hint: "Un éclat de lumière balaie le bouton." },
  { id: "souleve", label: "3 · Se soulève", hint: "Le bouton monte un peu, son ombre grandit." },
  { id: "remplit", label: "4 · Se remplit", hint: "La couleur remplit le bouton de gauche à droite." },
  { id: "rebond", label: "5 · Petit rebond", hint: "Le bouton grossit avec un léger rebond." },
  { id: "halo", label: "6 · Halo", hint: "Un halo vert s'allume autour du bouton." },
] as const;

const CSS = `
.bt { position: relative; isolation: isolate; overflow: hidden; display: inline-flex; align-items: center; gap: .5rem; height: 48px; padding: 0 1.6rem; border-radius: 999px; font-weight: 600; font-size: 15px; cursor: pointer; transition: transform .35s cubic-bezier(.3,1.6,.5,1), box-shadow .35s ease, background-color .3s ease, color .3s ease; }
.bt-plein { background: #1F7A6C; color: #fff; }
.bt-contour { background: #fff; color: #0F2F2A; border: 1.5px solid #CFDCD8; }
.bt .mot { display: inline-grid; overflow: hidden; height: 1.3em; line-height: 1.3em; }
.bt .mot > span { grid-area: 1/1; transition: transform .45s cubic-bezier(.7,0,.2,1); }
.bt .mot > span + span { transform: translateY(110%); }
.bt svg { transition: transform .45s cubic-bezier(.7,0,.2,1); }

.e-aucun .bt-plein:hover { background: #18665A; }

.e-roule .bt:hover .mot > span:first-child { transform: translateY(-110%); }
.e-roule .bt:hover .mot > span + span { transform: none; }
.e-roule .bt:hover svg { transform: translateX(4px); }

.e-reflet .bt::after { content: ""; position: absolute; inset: 0; z-index: 1; background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.55) 50%, transparent 65%); transform: translateX(-120%); pointer-events: none; }
.e-reflet .bt-contour::after { background: linear-gradient(105deg, transparent 35%, rgba(31,122,108,.18) 50%, transparent 65%); }
.e-reflet .bt:hover::after { transform: translateX(120%); transition: transform .8s ease; }

.e-souleve .bt:hover { transform: translateY(-3px); box-shadow: 0 14px 28px -12px rgba(15,47,42,.45); }

.e-remplit .bt::before { content: ""; position: absolute; inset: 0; z-index: -1; background: #0F2F2A; transform: scaleX(0); transform-origin: left; transition: transform .45s cubic-bezier(.7,0,.2,1); }
.e-remplit .bt-contour::before { background: #1F7A6C; }
.e-remplit .bt:hover::before { transform: scaleX(1); }
.e-remplit .bt-contour:hover { color: #fff; border-color: #1F7A6C; }

.e-rebond .bt:hover { transform: scale(1.06); }
.e-rebond .bt:active { transform: scale(.97); }

.e-halo .bt:hover { box-shadow: 0 0 0 5px rgba(31,122,108,.18), 0 0 26px rgba(31,122,108,.35); }

.e-x a.lien { position: relative; color: #3F5E57; font-size: 15px; }
.e-roule a.lien::after, .e-remplit a.lien::after, .e-reflet a.lien::after { content: ""; position: absolute; left: 0; right: 0; bottom: -4px; height: 2px; background: #1F7A6C; transform: scaleX(0); transform-origin: right; transition: transform .35s ease; }
.e-roule a.lien:hover::after, .e-remplit a.lien:hover::after, .e-reflet a.lien:hover::after { transform: scaleX(1); transform-origin: left; }
.e-souleve a.lien, .e-rebond a.lien { display: inline-block; transition: transform .3s cubic-bezier(.3,1.6,.5,1), color .2s; }
.e-souleve a.lien:hover { transform: translateY(-2px); color: #0F2F2A; }
.e-rebond a.lien:hover { transform: scale(1.08); color: #0F2F2A; }
.e-halo a.lien:hover { color: #1F7A6C; text-shadow: 0 0 12px rgba(31,122,108,.35); }
@media (prefers-reduced-motion: reduce) { .bt, .bt *, .bt::before, .bt::after, a.lien, a.lien::after { transition: none !important; } }
`;

function Word({ text }: { text: string }) {
  return (
    <span className="mot">
      <span>{text}</span>
      <span aria-hidden="true">{text}</span>
    </span>
  );
}

export function ButtonHovers() {
  return (
    <main className="min-h-screen bg-[#F6F8F7] px-4 py-8">
      <style>{CSS}</style>
      <div className="mx-auto max-w-5xl">
        <h1 className="text-[24px] font-bold text-[#0F2F2A]">Les boutons du site, animés au survol</h1>
        <p className="mt-1 text-[14px] text-[#4B6A62]">Passez la souris sur chaque bouton et sur les liens du menu. L&apos;effet choisi s&apos;appliquera à tous les boutons cliquables du site.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {EFFECTS.map((effect) => (
            <section key={effect.id} className={`e-x e-${effect.id} rounded-2xl border border-[#D9E2DF] bg-white p-5`}>
              <p className="text-[14px] font-bold text-[#0F2F2A]">{effect.label}</p>
              <p className="text-[12.5px] text-[#4B6A62]">{effect.hint}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="button" className="bt bt-plein">
                  <Word text="Réserver une démo" /> <ArrowRight className="size-4" />
                </button>
                <button type="button" className="bt bt-contour">
                  <Word text="S'abonner" />
                </button>
              </div>
              <nav className="mt-4 flex gap-5">
                {["Au comptoir", "Pourquoi", "Offre", "Affiliation"].map((label) => (
                  <a key={label} href="#" className="lien" onClick={(event) => event.preventDefault()}>
                    {label}
                  </a>
                ))}
              </nav>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
