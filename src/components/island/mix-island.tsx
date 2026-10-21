"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, ExternalLink, FileText, MessageCircle, Pill, Sparkles } from "lucide-react";
import { BANNER } from "../../../agent/src/banner-design";
import { SHEET_MISSING, type CounterSheetLine } from "../../../agent/src/counter-sheet";
import type { IslandOutcome } from "@/core/island/banner-flow";
import { Robot } from "@/components/robot";
import { AnswerProduct, type IslandAdvice } from "./counter-island";
import { IslandShell } from "./island-shell";
import { HelixBackdrop } from "@/components/app/helix/helix-backdrop";
import { islandTheme, MIX_PAPER, PHARMABOOST_GREEN } from "./island-theme";

/**
 * La bannière « mix » du poste (fondateur, 19 oct. 2026, maquette 5 choisie) : le haut reste toujours à l'écran — le meilleur
 * conseil, le challenge, la marge possible de la vente — et, à la souris, elle se déploie sur ce meilleur conseil en trois
 * temps : 1. Questions (les deux questions, réponses cliquables), 2. Discours (le conseil à dire), 3. Fiche (posologie,
 * contre-indications, effets indésirables). Les autres conseils se parcourent avec les flèches ; l'autre possibilité en
 * stock pour la même boîte est à un clic. Vendu / Non vendu restent sans clic : un conseil bipé passe en vendu.
 *
 * L'ancienne bannière (`CounterIsland` compacte) reste joignable : `?banniere=ancienne` (voir poste-island.tsx).
 */

const C = islandTheme({ ...BANNER.colors, ...PHARMABOOST_GREEN, ...MIX_PAPER });
const T = BANNER.text;

/** « 4,79 € » → 479 ; rien de lisible → 0. */
export function centsOf(price: string | undefined): number {
  const match = /(\d+)(?:[,.](\d{1,2}))?/.exec((price ?? "").replace(/\s/g, ""));
  if (!match) return 0;
  return Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
}

/** 1143 → « 11,43 € ». */
export function eurosOf(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

/**
 * L'ordre de présentation : d'abord ce qui coche le plus (challenge, date courte), puis la meilleure marge ; à égalité, l'ordre
 * du serveur. Rend les index dans `items` (la réponse part toujours avec l'index d'origine).
 */
export function bestOrder(items: readonly Pick<IslandAdvice, "challenge" | "shortDate" | "margin">[]): number[] {
  const score = (item: (typeof items)[number]) => Number(Boolean(item.challenge)) + Number(Boolean(item.shortDate));
  return items.map((_, index) => index).sort((a, b) => score(items[b]) - score(items[a]) || centsOf(items[b].margin) - centsOf(items[a].margin) || a - b);
}

/** Ce que la vente peut rapporter : la somme des marges connues des conseils (« jusqu'à 11,43 € »). */
export function possibleMargin(items: readonly Pick<IslandAdvice, "margin">[]): number {
  return items.reduce((sum, item) => sum + centsOf(item.margin), 0);
}

type Step = "ask" | "say" | "sheet";
const STEPS: { id: Step; label: string; Icon: typeof Pill }[] = [
  { id: "ask", label: "Questions", Icon: MessageCircle },
  { id: "say", label: "Discours", Icon: Sparkles },
  { id: "sheet", label: "Fiche", Icon: Pill },
];

export type MixIslandProps = {
  items: IslandAdvice[];
  outcomes: readonly (IslandOutcome | undefined)[];
  /** Déployée (la souris est sur l'île) ; repliée, seul le haut reste. */
  open: boolean;
  /** Debout contre un bord de l'écran : plus étroite. */
  narrow?: boolean;
  look?: number | null;
  aurore?: boolean;
  onOpen: () => void;
  onFinish: () => void;
  onAnswer: (index: number, outcome: IslandOutcome) => void;
  /** Les boîtes scannées : celle qui est en challenge (toute la gamme d'un laboratoire) le dit en haut, avec son gain. */
  boxes?: { id: string; name: string; challenge?: string; reward?: string }[];
};

export function MixIsland({ items, outcomes, open, narrow, look, aurore = true, onOpen, onFinish, onAnswer, boxes = [] }: MixIslandProps) {
  const challengedBoxes = boxes.filter((box) => box.challenge);
  const order = bestOrder(items);
  const sold = (index: number) => outcomes[index] === "SOLD";
  const soldIndexes = order.filter(sold);
  const firstOpen = order.find((index) => !sold(index)) ?? order[0];
  const [at, setAt] = useState(() => Math.max(0, order.indexOf(firstOpen)));
  const [step, setStep] = useState<Step>("ask");
  const position = Math.min(at, order.length - 1);
  const index = order[position];
  const item = items[index];
  const best = items[firstOpen];
  const total = possibleMargin(items);
  const soldMargin = possibleMargin(soldIndexes.map((i) => items[i]));
  const go = (next: number) => {
    setAt((next + order.length) % order.length);
    setStep("ask");
  };
  const alternatives = order.map((i, pos) => ({ i, pos })).filter(({ i }) => i !== index && item.drug && items[i].drug === item.drug);
  const width = narrow ? (open ? 340 : 300) : open ? 430 : 400;

  return (
    <IslandShell
      width={width}
      tone="accent"
      contentKey={open ? "mix-ouvert" : "mix-replie"}
      label="Conseils de la vente (cliquez pour les voir)"
      // L'hélice d'ADN vivante du site derrière la bannière (fondateur, 21 oct. 2026 : essai « 1 » de /robot-apercu/adn-vivant).
      backdrop={aurore ? <div data-ile-helice="" className="absolute inset-0 isolate"><HelixBackdrop position="contained" framing="app" lazy className="[&_canvas]:scale-[1.6]" /></div> : undefined}
    >
      <div data-ile-mix={open ? "ouvert" : "replie"}>
        {/* Le haut, toujours là : le meilleur conseil à proposer, ou ce qui est déjà vendu. */}
        <div className="flex w-full items-center gap-2 py-1.5 pr-1.5 pl-2">
          <button type="button" data-ile-replie="" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            <Robot size={30} mood="happy" look={look} label="Le robot PharmaBoost" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[13.5px] leading-[18px] font-semibold tracking-[-0.01em] text-[#0F2F2A]">
                {aurore && <span className="aur-dot shrink-0" aria-hidden="true" />}
                <span className="truncate">{soldIndexes.length > 0 ? `✓ ${soldIndexes.length} vendu${soldIndexes.length > 1 ? "s" : ""}${soldMargin > 0 ? ` · +${eurosOf(soldMargin)} de marge` : ""}` : best.name}</span>
              </span>
              <span className="block truncate text-[11px] leading-[15px] text-[#3F5E57]">
                {items.length} conseil{items.length > 1 ? "s" : ""}
                {total > 0 ? ` · jusqu'à ${eurosOf(total)} de marge` : ""}
                {!open ? " · cliquez" : ""}
              </span>
            </span>
            {best.challenge && soldIndexes.length === 0 && (
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: C.challengeBg, color: C.challengeFg }}>★ {T.challenge}</span>
            )}
          </button>
          <button
            type="button"
            data-ile-client-suivant=""
            data-ile-sans-deploiement=""
            onClick={onFinish}
            className={aurore ? "aur-btn h-8 shrink-0 rounded-full px-3 text-[12px] font-semibold" : "h-8 shrink-0 rounded-xl px-2.5 text-[12px] font-bold"}
            style={aurore ? undefined : { background: C.accent, color: "#04261A" }}
          >
            Terminer →
          </button>
        </div>

        {/* La boîte scannée est en challenge (fondateur, 19 oct. 2026 : Lactibiane Imedia, laboratoire Pileje, 1 € par boîte) :
            toujours visible, repliée ou non. */}
        {challengedBoxes.length > 0 && (
          <div data-ile-challenge="" className="mx-2 mb-1.5 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] leading-[15px] font-semibold" style={{ background: "rgba(242,165,22,0.14)", color: C.challengeIcon }}>
            <span aria-hidden="true">★</span>
            <span className="min-w-0 flex-1">
              {challengedBoxes.map((box) => (
                <span key={box.id} className="block">
                  {/^challenge\b/i.test(box.challenge ?? "") ? box.challenge : `Challenge ${box.challenge}`} : {box.name}
                  {box.reward ? <span className="font-medium text-[#0F2F2A]/80"> · {box.reward}</span> : null}
                </span>
              ))}
            </span>
          </div>
        )}

        {open && (
          <div className="px-2 pb-2">
            <div className="flex items-center gap-2 px-1 pb-1.5">
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[#3F5E57]">
                {position === 0 ? "À proposer en premier" : `Conseil ${position + 1} sur ${order.length}`}
                {item.drug ? ` · pour ${item.drug}` : ""}
              </span>
              {order.length > 1 && (
                <>
                  <button type="button" aria-label="Conseil précédent" onClick={() => go(position - 1)} className="inline-flex size-7 items-center justify-center rounded-full bg-[#0F2F2A]/10 text-[#0F2F2A] hover:bg-[#0F2F2A]/20">
                    <ChevronLeft className="size-4" aria-hidden="true" />
                  </button>
                  <button type="button" aria-label="Conseil suivant" onClick={() => go(position + 1)} className="inline-flex size-7 items-center justify-center rounded-full" style={{ background: C.accent, color: "#04261A" }}>
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>

            <div data-ile-mix-carte="" className="rounded-[16px] p-3 text-left" style={{ background: C.panel, color: C.ink }}>
              <div className="flex items-start gap-3">
                {/* La photo studio du produit, sur fond blanc ; sans photo studio, rien (jamais une photo amateur). */}
                {item.image && (
                  <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-xl bg-white p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element -- image locale de l'agent ou du site, déjà dimensionnée */}
                    <img data-ile-mix-photo="" src={item.image} alt="" width={48} height={48} draggable={false} className="isl-float size-full object-contain" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p key={index} data-ile-mix-titre="" className="text-[15.5px] leading-[19px] font-extrabold break-words">{item.sheet?.name || item.name}</p>
                  {(item.sheet?.reasons[0] || item.reason) && <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-[15px]" style={{ color: C.inkSoft }}>{item.sheet?.reasons[0] || item.reason}</p>}
                </div>
                <div className="shrink-0 text-right">
                  {/* Le prix seulement avec un stock fiable (jamais un chiffre douteux) ; la marge, pour le pharmacien seul. */}
                  <p className="text-[17px] leading-none font-extrabold whitespace-nowrap tabular-nums">{item.price && item.stock !== "UNKNOWN" ? item.price : "—"}</p>
                  <p className="mt-1 text-[11.5px] font-bold whitespace-nowrap tabular-nums" style={{ color: C.numberFg }}>{item.margin ? `marge ${item.margin}` : "marge —"}</p>
                </div>
              </div>
              <Tags item={item} />

              {sold(index) ? (
                <div data-ile-mix-vendu="" className="isl-pop mt-2.5 flex min-h-[210px] flex-col items-center justify-center gap-2.5 rounded-xl px-3 text-center" style={{ background: C.challengeBg, color: "#0F2F2A" }}>
                  <span className="inline-flex size-10 items-center justify-center rounded-full" style={{ background: "#0F2F2A", color: C.challengeBg }}>
                    <Check className="size-5" strokeWidth={3} aria-hidden="true" />
                  </span>
                  <p className="text-[14px] font-extrabold">Vendu{item.margin ? ` · +${item.margin} de marge` : ""}</p>
                  {soldIndexes.length < order.length && (
                    <button type="button" onClick={() => go(order.findIndex((i) => !sold(i)))} className="h-8 rounded-lg px-3 text-[12px] font-bold" style={{ background: "#0F2F2A", color: C.challengeBg }}>
                      Conseil suivant
                    </button>
                  )}
                  <button type="button" onClick={() => onAnswer(index, null)} className="text-[11px] font-semibold underline-offset-2 hover:underline" style={{ color: "#3D4F00" }}>
                    Annuler « Vendu »
                  </button>
                </div>
              ) : (
                <>
                  <div role="tablist" className="mt-2.5 grid grid-cols-3 gap-1 rounded-xl p-1" style={{ background: C.cell }}>
                    {STEPS.map(({ id, label, Icon }, n) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={step === id}
                        data-ile-mix-etape={id}
                        onClick={() => setStep(id)}
                        className="inline-flex h-7 items-center justify-center gap-1 rounded-lg text-[11.5px] font-bold"
                        style={step === id ? { background: C.raised, color: C.accent, boxShadow: "0 1px 3px rgba(0,0,0,.25)" } : { color: C.inkSoft }}
                      >
                        <Icon className="size-3.5" aria-hidden="true" /> {n + 1}. {label}
                      </button>
                    ))}
                  </div>
                  <div className="isl-scroll mt-2 max-h-[230px] min-h-[150px] overflow-y-auto pr-1 text-[12px] leading-[16px]">
                    {step === "ask" && <Ask key={index} item={item} />}
                    {step === "say" && <Say item={item} />}
                    {step === "sheet" && <Sheet item={item} />}
                  </div>
                  {item.sheet?.alternatives && item.sheet.alternatives.length > 0 && (
                    <div data-ile-mix-alternative="" className="mt-2 border-t pt-1.5" style={{ borderColor: C.line }}>
                      <p className="text-[9.5px] font-bold tracking-[0.06em] uppercase" style={{ color: C.inkSoft }}>Le patient n&apos;en veut pas ? En stock aussi</p>
                      {item.sheet.alternatives.map((other) => (
                        <div key={other.name} className="mt-0.5 flex w-full items-center gap-2 rounded-lg px-1.5 py-1">
                          <span className="min-w-0 flex-1 truncate text-[12px] font-bold">{other.name}</span>
                          {other.price && <span className="shrink-0 text-[11.5px] font-bold tabular-nums">{other.price}</span>}
                          {other.margin && <span className="shrink-0 text-[11px] font-bold tabular-nums" style={{ color: C.numberFg }}>marge {other.margin}</span>}
                        </div>
                      ))}
                      <p className="px-1.5 text-[10.5px]" style={{ color: C.inkSoft }}>Bipez celui qu&apos;il choisit : le conseil passe en vendu avec ce produit.</p>
                    </div>
                  )}
                  {alternatives.length > 0 && (
                    <div className="mt-2 border-t pt-1.5" style={{ borderColor: C.line }}>
                      <p className="text-[9.5px] font-bold tracking-[0.06em] uppercase" style={{ color: C.inkSoft }}>Autre possibilité en stock</p>
                      {alternatives.slice(0, 2).map(({ i, pos }) => (
                        <button key={i} type="button" onClick={() => go(pos)} className="mt-0.5 flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-[#0F2F2A]/5">
                          <span className="min-w-0 flex-1 truncate text-[12px] font-bold">{items[i].name}</span>
                          {items[i].price && items[i].stock !== "UNKNOWN" && <span className="shrink-0 text-[11.5px] font-bold tabular-nums" style={{ color: C.numberFg }}>{items[i].price}</span>}
                          <ChevronRight className="size-3.5 shrink-0" style={{ color: C.inkSoft }} aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {order.length > 1 && (
              <div className="flex justify-center gap-1.5 pt-2">
                {order.map((i, pos) => (
                  <span key={i} className="h-1.5 rounded-full transition-all" style={{ width: pos === position ? 16 : 6, background: sold(i) ? C.challengeBg : pos === position ? "#FFFFFF" : "rgba(255,255,255,0.3)" }} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </IslandShell>
  );
}

function Tags({ item }: { item: IslandAdvice }) {
  const stock =
    item.stock === "IN_STOCK" ? { label: `${T.inStock}${item.quantity !== undefined ? ` · ${item.quantity}` : ""}`, fg: C.numberFg }
    : item.stock === "LOW_STOCK" ? { label: `${T.lowStock}${item.quantity !== undefined ? ` · ${item.quantity}` : ""}`, fg: C.lowFg }
    : item.stock === "OUT_OF_STOCK" ? { label: "Rupture", fg: C.outFg }
    : { label: "Stock à vérifier", fg: C.inkSoft };
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {item.challenge && <Chip bg={C.challengeBg} fg={C.challengeFg}>★ {item.challengeLabel ? (/^challenge\b/i.test(item.challengeLabel) ? item.challengeLabel : `${T.challenge} ${item.challengeLabel}`) : T.challenge}</Chip>}
      {item.shortDate && <Chip bg={C.dateBg} fg={C.dateFg}>{T.shortDate} {item.shortDate}</Chip>}
      <Chip bg={C.cell} fg={stock.fg}>{stock.label}</Chip>
    </div>
  );
}

function Chip({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
  return <span className="inline-flex h-5 items-center rounded-full px-2 text-[10.5px] font-bold" style={{ background: bg, color: fg }}>{children}</span>;
}

/** 1. Questions : les deux questions ; la réponse touchée dit quoi faire, et parfois un produit plus précis du stock. */
function Ask({ item }: { item: IslandAdvice }) {
  const ask = item.sheet?.ask ?? [];
  const answers = item.sheet?.answers ?? [];
  const [picked, setPicked] = useState<Record<number, number>>({});
  if (ask.length === 0) return <p style={{ color: C.inkSoft }}>Les questions de ce conseil sont en cours de rédaction : passez à « Discours ».</p>;
  return (
    <ol className="space-y-2">
      {ask.map((question, q) => {
        const choices = answers.filter((answer) => answer.ask === q);
        const chosen = picked[q] !== undefined ? choices[picked[q]] : undefined;
        return (
          <li key={question} data-pitch-question="">
            <span className="flex gap-1.5 font-bold">
              <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[9.5px]" style={{ background: C.number, color: C.numberFg }}>{q + 1}</span>
              {question}
            </span>
            {choices.length > 0 && (
              <span className="mt-1 ml-5.5 flex flex-wrap gap-1">
                {choices.map((choice, n) => (
                  <button
                    key={choice.label}
                    type="button"
                    data-pitch-answer=""
                    aria-pressed={picked[q] === n}
                    onClick={() => setPicked((current) => {
                      const next = { ...current };
                      if (next[q] === n) delete next[q];
                      else next[q] = n;
                      return next;
                    })}
                    className="h-7 rounded-full border px-2.5 text-[11.5px] font-semibold"
                    style={picked[q] === n ? { background: C.pick, borderColor: C.pick, color: "#FFFFFF" } : { background: C.raised, borderColor: C.pickLine, color: C.raisedInk }}
                  >
                    {choice.label}
                  </button>
                ))}
              </span>
            )}
            {chosen && (
              <span data-pitch-then="" className="isl-pop mt-1 ml-5.5 block rounded-md px-2 py-1.5" style={{ background: C.then }}>
                <span className="block">{chosen.say}</span>
                {chosen.product && <AnswerProduct product={chosen.product} />}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** 2. Discours : le conseil en deux phrases, sinon la phrase du comptoir de la règle. */
function Say({ item }: { item: IslandAdvice }) {
  const text = item.sheet?.pitch || item.sheet?.script;
  return text ? <p className="rounded-lg px-2.5 py-2 text-[12.5px] leading-[18px]" style={{ background: C.raised, color: C.raisedInk }}>« {text} »</p> : <p style={{ color: C.inkSoft }}>Rien d&apos;écrit pour ce conseil : voyez la fiche.</p>;
}

/** 3. Fiche : posologie, contre-indications, effets indésirables — ce que PharmaBoost sait ; une rubrique vide renvoie à la notice. */
function Sheet({ item }: { item: IslandAdvice }) {
  const sheet = item.sheet;
  const usage = sheet?.usage ?? [];
  const effects = sheet?.sideEffects ?? [];
  return (
    <div className="space-y-2">
      <Part title="Posologie">
        {usage.length > 0 || sheet?.description ? (
          <>
            <Lines lines={usage} />
            {sheet?.description && <p className="break-words">{sheet.description}</p>}
          </>
        ) : (
          <Missing>{SHEET_MISSING.usage}</Missing>
        )}
      </Part>
      <Part title="Contre-indications">{sheet && sheet.contraindications.length > 0 ? <Lines lines={sheet.contraindications} /> : <Missing>{SHEET_MISSING.contraindications}</Missing>}</Part>
      <Part title="Effets indésirables">
        {effects.length > 0 ? (
          <>
            <p className="break-words">{effects.join(" · ")}</p>
            <p className="text-[10.5px]" style={{ color: C.inkSoft }}>Fréquents, d&apos;après le RCP officiel (BDPM).</p>
          </>
        ) : (
          <Missing>{SHEET_MISSING.sideEffects}</Missing>
        )}
      </Part>
      {item.href && (
        <a href={item.href} target="_blank" rel="noopener" draggable={false} data-advice-link="" className="inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-semibold hover:brightness-95" style={{ background: C.line, color: C.ink }}>
          <FileText className="size-3.5" aria-hidden="true" /> Fiche complète <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[9.5px] font-bold tracking-[0.06em] uppercase" style={{ color: C.inkSoft }}>{title}</p>
      <div className="mt-0.5 space-y-0.5">{children}</div>
    </div>
  );
}

function Lines({ lines }: { lines: CounterSheetLine[] }) {
  return (
    <ul className="space-y-0.5">
      {lines.map((line) => (
        <li key={line.text} className="break-words">
          • {line.text}
          {line.detail ? <span style={{ color: C.inkSoft }}> — {line.detail}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function Missing({ children }: { children: ReactNode }) {
  return <p className="italic" style={{ color: C.inkSoft }}>{children}</p>;
}
