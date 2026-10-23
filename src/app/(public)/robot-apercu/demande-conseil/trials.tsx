"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, MessageCircleQuestion, PenLine, Search, Sparkles } from "lucide-react";
import { Robot } from "@/components/robot";

/** Les mêmes exemples que la bannière du poste. */
const EXAMPLES = ["Mal de gorge, adulte", "Diarrhée depuis hier", "Peau sèche, enfant 6 ans", "Fatigue, examens"];
const LIME = "#E8FF9C";
const MINT = "#36E8C8";

/** La capsule au repos, telle qu'au poste : fond sombre, ADN vivant, robot et « En attente de scan… ». */
function Capsule({ children, status = true }: { children: ReactNode; status?: boolean }) {
  return (
    <div className="relative w-[400px] overflow-hidden rounded-[26px] border border-white/10 text-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.7)]" style={{ background: "#0B1513" }}>
      {/* Le même ADN qu'au poste au repos (island-adn) : l'image de l'hélice, éclairée sur le fond sombre. */}
      <div
        className="pointer-events-none absolute -inset-[20%]"
        aria-hidden="true"
        style={{ background: "url(/poste/adn-helice.jpg) 62% 40%/cover no-repeat", filter: "invert(1) hue-rotate(180deg) brightness(1.15) contrast(1.25) saturate(1.3)", mixBlendMode: "screen", opacity: 0.85 }}
      />
      <div className="relative px-3 pt-2.5 pb-3">
        <div className="flex items-center gap-2.5">
          <Robot size={30} mood="happy" label="Le robot PharmaBoost" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] leading-[18px] font-semibold">En attente de scan…</p>
            <p className="truncate text-[12px] leading-4 text-white/60">Je surveille le comptoir. Glissez-moi pour me déplacer.</p>
          </div>
          {/* Le poste connecté ne disparaît pas : il devient un petit point vert en haut à droite. */}
          {status && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] font-semibold text-white/70" title="Comptoir 6 connecté">
              <span className="size-1.5 rounded-full" style={{ background: MINT, boxShadow: `0 0 6px ${MINT}` }} />
              Comptoir 6
            </span>
          )}
        </div>
        <div className="mt-2.5">{children}</div>
      </div>
    </div>
  );
}

/** Le champ qui s'ouvre au clic (le même partout) : écrire la demande, ou toucher un exemple. */
function AskForm({ title, onClose, light = false }: { title: string; onClose: () => void; light?: boolean }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  if (sent)
    return (
      <div className={`rounded-2xl px-3 py-2.5 text-[12.5px] ${light ? "bg-white text-[#0F2B26]" : "bg-white/[0.07] text-white/85"}`}>
        Recherche des conseils pour « {sent} »… <span className="opacity-60">(exemple : au poste, les conseils arrivent comme après un scan)</span>
        <button type="button" onClick={onClose} className="ml-2 font-semibold underline">Revenir</button>
      </div>
    );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim().length > 1) setSent(text.trim());
      }}
      className={`rounded-2xl p-2.5 ${light ? "bg-white text-[#0F2B26]" : "bg-white/[0.07]"}`}
    >
      <p className="text-[13px] font-bold">{title}</p>
      <div className="mt-2 flex gap-1.5">
        <input autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder="Ex. : mal de gorge, adulte" className="h-9 min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 text-[13px] text-[#0F2F2A] outline-none" />
        <button type="submit" className="h-9 shrink-0 rounded-lg px-3 text-[12.5px] font-bold" style={{ background: LIME, color: "#04261A" }}>Chercher</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {EXAMPLES.map((example) => (
          <button key={example} type="button" onClick={() => setSent(example)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${light ? "bg-[#F3F7F5] text-[#0F2B26]" : "bg-white/10 text-white/85"}`}>
            {example}
          </button>
        ))}
        <button type="button" onClick={onClose} className="ml-auto px-1 text-[11px] font-semibold opacity-60 hover:opacity-100">Fermer</button>
      </div>
    </form>
  );
}

/** Une entrée : fermée, elle montre la présentation de l'essai ; ouverte, le champ. */
function Trial({ letter, name, note, title, children, light, status }: { letter: string; name: string; note: string; title: string; children: (open: () => void) => ReactNode; light?: boolean; status?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-2">
      <div>
        <p className="text-[13px] font-bold text-[#0F2B26]">
          <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-[#0E8A7B] text-[12px] text-white">{letter}</span>
          {name}
        </p>
        <p className="mt-0.5 text-[12.5px] text-[#5B6B66]">{note}</p>
      </div>
      <Capsule status={status}>{open ? <AskForm title={title} light={light} onClose={() => setOpen(false)} /> : children(() => setOpen(true))}</Capsule>
    </section>
  );
}

export function AskTrials() {
  return (
    <main className="min-h-screen bg-[#EEF2F0] px-4 py-8">
      <div className="mx-auto max-w-[900px]">
        <h1 className="text-[22px] font-bold text-[#0F2B26]">« Demander un conseil » dans la bannière au repos</h1>
        <p className="mt-1 text-[14px] text-[#5B6B66]">
          La case « Comptoir 6 · Connecté » est remplacée par l&apos;entrée pour poser la question du patient. Le comptoir connecté reste visible en petit, en haut à droite. Cliquez sur chaque essai pour voir le champ s&apos;ouvrir.
        </p>
        <div className="mt-6 grid gap-8 md:grid-cols-2">
          <Trial letter="A" name="« Votre patient vous pose une question ? »" note="Un grand bouton vert clair, sur toute la largeur." title="Que demande le patient ?">
            {(open) => (
              <button type="button" onClick={open} className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-[filter] hover:brightness-105" style={{ background: LIME, color: "#04261A" }}>
                <span className="text-[14px] font-bold">Votre patient vous pose une question ?</span>
                <ArrowRight className="size-4" />
              </button>
            )}
          </Trial>

          <Trial letter="B" name="« Une question du patient ? » — champ visible" note="Le champ est déjà là : on clique dedans et on écrit." title="Une question du patient ?">
            {(open) => (
              <button type="button" onClick={open} className="w-full rounded-2xl bg-white/[0.07] p-2.5 text-left">
                <p className="text-[12px] font-semibold text-white/70">Une question du patient ?</p>
                <span className="mt-1.5 flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-[13px] text-[#5B6B66]">
                  <Search className="size-3.5" /> Ex. : mal de gorge, adulte
                </span>
              </button>
            )}
          </Trial>

          <Trial letter="C" name="« Demander un conseil » — case comme avant" note="La même case que « Comptoir 6 », au même endroit, en plus large." title="Que demande le patient ?">
            {(open) => (
              <button type="button" onClick={open} className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.06] px-3 py-2.5 text-left hover:bg-white/[0.1]">
                <span className="inline-flex size-9 items-center justify-center rounded-xl" style={{ background: "rgba(54,232,200,0.15)", color: MINT }}>
                  <PenLine className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10.5px] font-medium tracking-[0.04em] text-white/55 uppercase">Sans scan</span>
                  <span className="block text-[14px] font-semibold">Demander un conseil</span>
                </span>
                <ArrowRight className="size-4 text-white/50" />
              </button>
            )}
          </Trial>

          <Trial letter="D" name="« Le patient demande… » — exemples visibles" note="Les demandes fréquentes sont déjà affichées : un clic suffit." title="Le patient demande…">
            {(open) => (
              <div className="rounded-2xl bg-white/[0.06] p-2.5">
                <button type="button" onClick={open} className="flex w-full items-center justify-between text-left">
                  <span className="text-[13px] font-bold">Le patient demande…</span>
                  <span className="text-[11.5px] font-semibold" style={{ color: LIME }}>Écrire ✎</span>
                </button>
                <div className="mt-2 flex flex-wrap gap-1">
                  {EXAMPLES.slice(0, 3).map((example) => (
                    <button key={example} type="button" onClick={open} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/85 hover:bg-white/20">{example}</button>
                  ))}
                </div>
              </div>
            )}
          </Trial>

          <Trial letter="E" name="« Un conseil sans ordonnance ? »" note="Encadré lumineux, avec l'icône de question." title="Que demande le patient ?">
            {(open) => (
              <button type="button" onClick={open} className="flex w-full items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left" style={{ borderColor: MINT, background: "rgba(54,232,200,0.08)" }}>
                <MessageCircleQuestion className="size-6 shrink-0" style={{ color: MINT }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold">Un conseil sans ordonnance ?</span>
                  <span className="block text-[12px] text-white/65">Écrivez ce que le patient demande.</span>
                </span>
              </button>
            )}
          </Trial>

          <Trial letter="F" name="« Votre patient vous pose une question ? » — carte blanche" note="Carte blanche comme la carte du conseil (façon Kontoir)." title="Votre patient vous pose une question ?" light>
            {(open) => (
              <button type="button" onClick={open} className="flex w-full items-center gap-3 rounded-[18px] bg-white p-3 text-left text-[#0F2B26] shadow-[0_12px_32px_-18px_rgba(15,43,38,0.55)]">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[#0E8A7B] text-white">
                  <MessageCircleQuestion className="size-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold">Votre patient vous pose une question ?</span>
                  <span className="block text-[12px] text-[#5B6B66]">Trouvez le bon conseil en stock.</span>
                </span>
                <ArrowRight className="size-4 text-[#0E8A7B]" />
              </button>
            )}
          </Trial>

          <Trial letter="G" name="Le robot parle : « Une question ? Écrivez-la-moi »" note="Une bulle du robot, plus humaine." title="Que demande le patient ?">
            {(open) => (
              <button type="button" onClick={open} className="relative ml-8 block w-[calc(100%-2rem)] rounded-2xl rounded-tl-sm bg-white/[0.1] px-3 py-2.5 text-left hover:bg-white/[0.14]">
                <span className="block text-[13.5px] font-semibold">Votre patient vous pose une question ?</span>
                <span className="block text-[12px]" style={{ color: LIME }}>Écrivez-la-moi, je trouve le conseil →</span>
              </button>
            )}
          </Trial>

          <Trial letter="H" name="« Demandez à PharmaBoost » — deux boutons" note="Le bouton de la demande, et le comptoir connecté gardé à côté." title="Que demande le patient ?" status={false}>
            {(open) => (
              <div className="grid grid-cols-[1fr_auto] gap-1.5">
                <button type="button" onClick={open} className="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-left" style={{ background: LIME, color: "#04261A" }}>
                  <Sparkles className="size-4" />
                  <span className="text-[13.5px] font-bold">Demandez à PharmaBoost</span>
                </button>
                <div className="rounded-2xl bg-white/[0.06] px-2.5 py-1.5">
                  <p className="text-[10px] font-medium tracking-[0.04em] text-white/55 uppercase">Comptoir 6</p>
                  <p className="flex items-center gap-1 text-[12.5px] font-semibold">
                    <span className="size-1.5 rounded-full" style={{ background: MINT }} /> Connecté
                  </p>
                </div>
              </div>
            )}
          </Trial>
        </div>
      </div>
    </main>
  );
}
