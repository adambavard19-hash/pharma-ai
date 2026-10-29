"use client";

import { useState, type ReactNode } from "react";
import { ArrowUp, LifeBuoy, MessageCircle, Send, Sparkles } from "lucide-react";
import { Robot } from "@/components/robot";

/**
 * Le bloc « Une question du patient ? Aide » dans la fiche menthe du conseil, en plusieurs façons. La réponse de l'aide est
 * un texte d'EXEMPLE neutre (aucun texte médical inventé) : on juge la présentation, pas le contenu.
 */
const GREEN = "#0E8A7B";
const INK = "#0F2B26";
const MUTED = "#5B6B66";
const ANSWER = "La réponse de l'aide s'affiche ici, d'après la fiche du produit. (Exemple)";
const QUICK = ["Enceinte ou allaitante ?", "Pour un enfant ?", "Avec d'autres médicaments ?", "Combien de temps ?"];

/** La fiche menthe du conseil, comme au poste : le cadre, l'ADN, la carte blanche, le titre. */
function Sheet({ children }: { children: ReactNode }) {
  return (
    <div className="w-[400px] max-w-full overflow-hidden rounded-[22px] bg-[linear-gradient(160deg,#BDEBD7,#8FDDBE)] p-[11px] shadow-[0_0_0_1.5px_#3DBF8E,0_18px_40px_-14px_rgba(14,124,90,.5)]">
      <div className="space-y-2.5 rounded-[18px] bg-white p-3 text-left" style={{ color: INK }}>
        <div className="flex items-center gap-3">
          <span className="inline-flex size-[52px] items-center justify-center rounded-xl bg-white p-1 ring-1 ring-[#E3EBE8]">
            {/* eslint-disable-next-line @next/next/no-img-element -- photo studio locale */}
            <img src="/produits-studio/0000030106659.jpg" alt="" className="size-full object-contain" />
          </span>
          <div>
            <p className="text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: GREEN }}>pour Curacné 20 mg</p>
            <p className="text-[16px] leading-5 font-bold">Cicaplast Lèvres <span style={{ color: GREEN }}>7,95 €</span></p>
          </div>
        </div>
        <p className="text-[12px] leading-[17px]" style={{ color: MUTED }}>« À dire au patient » et les questions…</p>
        {children}
      </div>
    </div>
  );
}

function Disclaimer() {
  return <p className="text-[10px]" style={{ color: MUTED }}>Aide du modèle : vérifiez sur la notice ou le RCP avant de conseiller.</p>;
}

/** A · Ce qui est en ligne : le lien, puis le champ dans un encadré menthe. */
function Current() {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold underline" style={{ color: MUTED }}>
        <LifeBuoy className="size-3.5" /> Une question du patient ? Aide
      </button>
      {open && (
        <div className="mt-1.5 space-y-2 rounded-xl bg-[#E4F6EE] p-2.5 ring-1 ring-[#BFE6D4]">
          <div className="flex gap-1.5">
            <input placeholder="Ex. : peut-on le prendre enceinte ?" className="h-9 min-w-0 flex-1 rounded-full border border-[#CFE3DA] bg-white px-3 text-[12.5px] outline-none" />
            <button type="button" className="h-9 rounded-full px-3.5 text-[12px] font-bold text-white" style={{ background: GREEN }}>Demander</button>
          </div>
          <Disclaimer />
        </div>
      )}
    </div>
  );
}

/** B · Les questions toutes prêtes : un clic sur une pastille pose la question, ou on écrit la sienne. */
function Quick() {
  const [asked, setAsked] = useState<string | null>(null);
  return (
    <div className="space-y-2 rounded-xl bg-[#E4F6EE] p-2.5 ring-1 ring-[#BFE6D4]">
      <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.1em] uppercase" style={{ color: GREEN }}>
        <Sparkles className="size-3.5" /> Le patient demande…
      </p>
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((question) => (
          <button key={question} type="button" onClick={() => setAsked(question)} className={`h-7 rounded-full px-2.5 text-[11.5px] font-semibold ${asked === question ? "text-white" : "bg-white ring-1 ring-[#CFE3DA]"}`} style={asked === question ? { background: GREEN } : { color: INK }}>
            {question}
          </button>
        ))}
      </div>
      {asked && <p className="rounded-xl bg-white px-3 py-2 text-[12px] leading-[17px] ring-1 ring-[#CFE3DA]">{ANSWER}</p>}
      <div className="flex gap-1.5">
        <input placeholder="Une autre question…" className="h-9 min-w-0 flex-1 rounded-full border border-[#CFE3DA] bg-white px-3 text-[12.5px] outline-none" />
        <button type="button" aria-label="Demander" className="inline-flex size-9 items-center justify-center rounded-full text-white" style={{ background: GREEN }}>
          <Send className="size-4" />
        </button>
      </div>
      <Disclaimer />
    </div>
  );
}

/** C · Une discussion avec le robot : ses réponses en bulles, comme une messagerie. */
function Chat() {
  return (
    <div className="space-y-2 rounded-xl bg-[#E4F6EE] p-2.5 ring-1 ring-[#BFE6D4]">
      <div className="flex items-end gap-2">
        <Robot size={28} mood="happy" label="" />
        <p className="rounded-2xl rounded-bl-sm bg-white px-3 py-1.5 text-[12px] ring-1 ring-[#CFE3DA]">Une question du patient sur ce produit ? Je vous aide.</p>
      </div>
      <p className="ml-auto w-fit rounded-2xl rounded-br-sm px-3 py-1.5 text-[12px] text-white" style={{ background: GREEN }}>Peut-on le prendre enceinte ?</p>
      <div className="flex items-end gap-2">
        <Robot size={28} mood="happy" label="" />
        <p className="rounded-2xl rounded-bl-sm bg-white px-3 py-1.5 text-[12px] leading-[17px] ring-1 ring-[#CFE3DA]">{ANSWER}</p>
      </div>
      <div className="flex items-center gap-1.5 rounded-full bg-white py-1 pr-1 pl-3 ring-1 ring-[#CFE3DA]">
        <input placeholder="Écrire la question…" className="h-7 min-w-0 flex-1 text-[12.5px] outline-none" />
        <button type="button" aria-label="Envoyer" className="inline-flex size-7 items-center justify-center rounded-full text-white" style={{ background: GREEN }}>
          <ArrowUp className="size-4" />
        </button>
      </div>
      <Disclaimer />
    </div>
  );
}

/** D · Une seule ligne au bas de la fiche, toujours là : on tape et c'est parti. */
function OneLine() {
  return (
    <div className="space-y-1.5 border-t border-[#E3EBE8] pt-2.5">
      <div className="flex items-center gap-2 rounded-full bg-[#F1FAF6] py-1 pr-1 pl-3 ring-1 ring-[#BFE6D4]">
        <MessageCircle className="size-4 shrink-0" style={{ color: GREEN }} />
        <input placeholder="Une question du patient ? Demandez à l'aide…" className="h-8 min-w-0 flex-1 bg-transparent text-[12.5px] outline-none" />
        <button type="button" className="h-8 rounded-full px-3 text-[12px] font-bold text-white" style={{ background: GREEN }}>Demander</button>
      </div>
      <Disclaimer />
    </div>
  );
}

const VARIANTS: { key: string; title: string; text: string; View: () => ReactNode }[] = [
  { key: "A", title: "Ce qui est en ligne", text: "Le lien « Une question du patient ? Aide », puis le champ dans un encadré menthe.", View: Current },
  { key: "B", title: "Les questions toutes prêtes", text: "Les questions les plus fréquentes en pastilles : un clic et la réponse arrive. On peut aussi écrire la sienne.", View: Quick },
  { key: "C", title: "Une discussion avec le robot", text: "Comme une messagerie : le robot propose son aide, les questions et ses réponses en bulles.", View: Chat },
  { key: "D", title: "Une seule ligne, toujours là", text: "Plus de lien à ouvrir : une ligne au bas de la fiche, on tape la question et c'est parti.", View: OneLine },
];

export function HelpTrials() {
  return (
    <main className="min-h-screen bg-[#EEF2F6] px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[#0F2F2A]">« Une question du patient ? » : quatre façons</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-7 text-[#4D6B64]">Dans la fiche menthe du conseil, comme au poste. La réponse est un texte d&apos;exemple : on juge la présentation.</p>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {VARIANTS.map((variant) => (
            <article key={variant.key} className="flex flex-col gap-3 rounded-2xl border border-[#DCE7E2] bg-white p-5">
              <div>
                <p className="text-[12px] font-bold tracking-[0.12em] text-[#4D6B64] uppercase">{variant.key === "A" ? "En ligne aujourd'hui" : `Proposition ${variant.key}`}</p>
                <h2 className="text-[19px] font-bold text-[#0F2F2A]">{variant.title}</h2>
                <p className="mt-1 text-[13.5px] leading-6 text-[#4D6B64]">{variant.text}</p>
              </div>
              <div className="flex justify-center rounded-xl bg-[#EEF2F6] p-4">
                <Sheet>
                  <variant.View />
                </Sheet>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
