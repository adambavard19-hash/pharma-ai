"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, LifeBuoy, MessageCircle, Pill } from "lucide-react";
import type { HelpAdvice } from "@/core/poste/island-bridge";
import { BANNER } from "../../../agent/src/banner-design";
import type { CounterSheetLine } from "../../../agent/src/counter-sheet";
import type { IslandOutcome } from "@/core/island/banner-flow";
import { Robot } from "@/components/robot";
import { AnswerProduct, type IslandAdvice } from "./counter-island";
import { IslandShell } from "./island-shell";
import { HelixBackdrop } from "@/components/app/helix/helix-backdrop";
import { islandTheme, MIX_PAPER, PHARMABOOST_GREEN } from "./island-theme";

/**
 * La bannière « mix » du poste (fondateur, 19 oct. 2026, maquette 5 choisie) : le haut reste toujours à l'écran — le meilleur
 * conseil, le challenge, la marge possible de la vente — et, à la souris, elle se déploie sur ce meilleur conseil en deux
 * temps (fondateur, 22 oct. 2026 : « Discours » retiré) : 1. Fiche (posologie, à dire au patient, contre-indications, effets
 * indésirables), 2. Questions (les deux questions, réponses cliquables). Plus de lien « Fiche complète ». Les autres conseils se parcourent avec les flèches ; l'autre possibilité en
 * stock pour la même boîte est à un clic. Vendu / Non vendu restent sans clic : un conseil bipé est « Bipé », et ne compte vendu
 * qu'à la validation de la vente (fondateur, 21 oct. 2026 : « vendu seulement si le pharmacien a cliqué sur FIN Valider »).
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

// « Discours » retiré, « Aide » ajoutée (fondateur, 22 oct. 2026) : la fiche, les questions, et l'aide quand on ne sait pas répondre.
type Step = "ask" | "sheet" | "help";
const STEPS: { id: Step; label: string; Icon: typeof Pill }[] = [
  { id: "sheet", label: "Fiche", Icon: Pill },
  { id: "ask", label: "Questions", Icon: MessageCircle },
  { id: "help", label: "Aide", Icon: LifeBuoy },
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
  /** Un clic sur le haut de la bannière ouverte la referme (fondateur, 21 oct. 2026). */
  onClose?: () => void;
  onFinish: () => void;
  onAnswer: (index: number, outcome: IslandOutcome) => void;
  /** Les boîtes scannées : celle qui est en challenge (toute la gamme d'un laboratoire) le dit en haut, avec son gain. */
  boxes?: { id: string; name: string; challenge?: string; reward?: string }[];
  /** L'onglet « Aide » : les questions déjà posées sur cette vente et leurs réponses ; absent, pas d'onglet Aide. */
  help?: { log: HelpExchange[]; onAsk: (question: string, advice: HelpAdvice) => void };
};

/** Une question à l'aide et sa réponse (vide tant qu'elle n'est pas arrivée). */
export type HelpExchange = { advice: string; question: string; answer: string; error?: string };

export function MixIsland({ items, outcomes, open, narrow, look, aurore = true, onOpen, onClose, onFinish, onAnswer, boxes = [], help }: MixIslandProps) {
  const challengedBoxes = boxes.filter((box) => box.challenge);
  const order = bestOrder(items);
  const sold = (index: number) => outcomes[index] === "SOLD";
  const soldIndexes = order.filter(sold);
  const firstOpen = order.find((index) => !sold(index)) ?? order[0];
  const [at, setAt] = useState(() => Math.max(0, order.indexOf(firstOpen)));
  const [step, setStep] = useState<Step>("sheet");
  const position = Math.min(at, order.length - 1);
  const index = order[position];
  const item = items[index];
  const best = items[firstOpen];
  const go = (next: number) => {
    setAt((next + order.length) % order.length);
    setStep("sheet");
  };
  const alternatives = order.map((i, pos) => ({ i, pos })).filter(({ i }) => i !== index && item.drug && items[i].drug === item.drug);
  const width = narrow ? (open ? 330 : 300) : open ? 400 : 400;

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
        <div className="flex w-full items-center gap-2 px-2 py-1.5">
          <button type="button" data-ile-replie="" aria-expanded={open} onClick={open && onClose ? onClose : onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            <Robot size={30} mood="happy" look={look} label="Le robot PharmaBoost" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[13.5px] leading-[18px] font-semibold tracking-[-0.01em] text-[#0F2F2A]">
                {aurore && <span className="aur-dot shrink-0" aria-hidden="true" />}
                {/* Jamais « 1 bipé · +3,28 € à la validation » (fondateur, 22 oct. 2026 : « je ne veux pas voir ça ») : le nom du conseil. */}
                <span className="truncate">{best.name}</span>
              </span>
              {/* Sous le nom, avant tout clic (fondateur, 22 oct. 2026) : le stock et son nombre, la marge et son montant, le
                  challenge et la date courte quand il y en a. */}
              <span data-ile-mix-repere="" className="mt-0.5 flex flex-wrap items-center gap-1">
                {/* En couleurs (fondateur, 22 oct. 2026) : stock vert (orange s'il est faible, rouge en rupture), marge jaune, challenge
                    vert citron, date courte rouge. */}
                <HeadChip {...stockColors(best)}>{stockLabel(best)}</HeadChip>
                {best.margin && <HeadChip bg="#FFE58A" fg="#4A3500">Marge {best.margin}</HeadChip>}
                {best.challenge && <HeadChip bg={C.challengeBg} fg={C.challengeFg}>★ {T.challenge}</HeadChip>}
                {best.shortDate && <HeadChip bg="#FF8A80" fg="#4A0B07">{T.shortDate} {best.shortDate}</HeadChip>}
              </span>
            </span>
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
                  {/* Le gain, de la couleur du challenge : sur le fond noir de la bannière, l'encre foncée d'avant ne se voyait plus (21 oct. 2026). */}
                  {box.reward ? <span data-ile-challenge-gain=""> · {box.reward}</span> : null}
                </span>
              ))}
            </span>
          </div>
        )}

        {open && (
          <div className="px-2 pb-2">
            <div className="flex items-center gap-2 px-1 pb-1">
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

            {/* La carte ouverte, comme l'essai « L » de /robot-apercu/carte-conseil (fondateur, 22 oct. 2026 : « je veux vraiment que
                ça ressemble au L ») : l'hélice du site sur papier clair tout autour, une grande carte blanche pleine, la photo qui
                en dépasse, le nom et le prix en grand, la raison encadrée, les onglets à droite, des rubriques légères. */}
            <div data-ile-mix-l="" className="relative overflow-hidden rounded-[22px] bg-[#EFF3F1]">
              <div className="pointer-events-none absolute inset-0 isolate" aria-hidden="true">
                <HelixBackdrop position="contained" framing="app" lazy className="[&_canvas]:scale-[1.6]" />
              </div>
              <div className={`relative px-2.5 pb-2.5 ${item.image ? "pt-[56px]" : "pt-2.5"}`}>
                <div data-ile-mix-carte="" className="rounded-[18px] p-3 text-left shadow-[0_12px_32px_-18px_rgba(15,43,38,0.55)]" style={{ background: "#FFFFFF", color: L.ink }}>
                  <div className={`flex items-end gap-3 ${item.image ? "-mt-[52px]" : ""}`}>
                    {/* La photo studio du produit ; sans photo studio, rien (jamais une photo amateur). */}
                    {item.image && (
                      <span className="inline-flex size-[70px] shrink-0 items-center justify-center rounded-2xl bg-white p-1.5 shadow-[0_6px_18px_-8px_rgba(15,43,38,0.45)]">
                        {/* eslint-disable-next-line @next/next/no-img-element -- image locale de l'agent ou du site, déjà dimensionnée */}
                        <img data-ile-mix-photo="" src={item.image} alt="" width={58} height={58} draggable={false} className="isl-float size-full object-contain" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1 pb-0.5">
                      {item.drug && <p className="text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: L.green }}>pour {item.drug}</p>}
                      {/* Le prix collé au nom du conseil, puis la marge et le stock sur une même ligne (fondateur, 22 oct. 2026). */}
                      <p key={index} data-ile-mix-titre="" className="mt-0.5 text-[17px] leading-[21px] font-bold tracking-[-0.025em] break-words">
                        {item.sheet?.name || item.name}
                        {/* Le prix seulement avec un stock fiable (jamais un chiffre douteux). */}
                        <span className="ml-2 whitespace-nowrap tabular-nums" style={{ color: L.green }}>{item.price && item.stock !== "UNKNOWN" ? item.price : "—"}</span>
                      </p>
                    </div>
                  </div>
                  <Tags item={item} margin={item.margin} />
                  {(item.sheet?.reasons[0] || item.reason) && (
                    <p className="mt-2 rounded-xl border-2 px-3 py-1.5 text-[12.5px] leading-[17px]" style={{ borderColor: "#5E9C8C", color: L.ink, fontWeight: 400 }}>{item.sheet?.reasons[0] || item.reason}</p>
                  )}

                  {sold(index) ? (
                    // Un conseil bipé : une ligne discrète, pas un grand panneau (fondateur, 22 oct. 2026).
                    <div data-ile-mix-vendu="" className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] font-bold" style={{ background: L.soft, color: L.ink }}>
                      <Check className="size-4 shrink-0" strokeWidth={3} style={{ color: L.green }} aria-hidden="true" />
                      <span className="flex-1">Vendu</span>
                      {soldIndexes.length < order.length && (
                        <button type="button" onClick={() => go(order.findIndex((i) => !sold(i)))} className="h-7 rounded-lg px-2.5 text-[11.5px] font-bold text-white" style={{ background: L.green }}>
                          Conseil suivant
                        </button>
                      )}
                      <button type="button" onClick={() => onAnswer(index, null)} className="text-[11px] font-semibold underline-offset-2 hover:underline" style={{ color: L.muted }}>
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="mt-2 flex justify-end">
                        <div role="tablist" className="inline-flex rounded-xl border p-1" style={{ background: L.soft, borderColor: "#B9D8CE" }}>
                          {STEPS.filter((entry) => entry.id !== "help" || help).map(({ id, label }) => (
                            <button
                              key={id}
                              type="button"
                              role="tab"
                              aria-selected={step === id}
                              data-ile-mix-etape={id}
                              onClick={() => setStep(id)}
                              className="h-6 rounded-md px-2.5 text-[11.5px] font-semibold"
                              style={step === id ? { background: "#FFFFFF", color: L.ink, boxShadow: "0 1px 3px rgba(15,43,38,.18)" } : { color: L.muted }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <ScrollBody key={`${index}-${step}`}>
                        {step === "ask" && <Ask key={index} item={item} />}
                        {step === "sheet" && <Sheet item={item} />}
                        {step === "help" && help && <Help item={item} help={help} />}
                      </ScrollBody>
                      {((item.sheet?.alternatives?.length ?? 0) > 0 || alternatives.length > 0) && (
                        <div data-ile-mix-alternative="" className="mt-2">
                          <p className="text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: L.muted }}>Autre alternative en stock</p>
                          <div className="mt-1 space-y-1">
                            {(item.sheet?.alternatives ?? []).map((other) => (
                              <div key={other.name} className="flex items-center gap-2 rounded-xl border px-2.5 py-1.5" style={{ borderColor: "#E3EBE8" }}>
                                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{other.name}</span>
                                {other.price && <span className="shrink-0 text-[12.5px] font-bold tabular-nums" style={{ color: L.green }}>{other.price}</span>}
                                {other.margin && <span className="shrink-0 rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold tabular-nums" style={{ borderColor: "#BDE5CF", background: "#EAF8F0", color: "#0E7A4E" }}>MARGE {other.margin}</span>}
                              </div>
                            ))}
                            {alternatives.slice(0, 2).map(({ i, pos }) => (
                              <button key={i} type="button" onClick={() => go(pos)} className="flex w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left hover:bg-[#F6F9F8]" style={{ borderColor: "#E3EBE8" }}>
                                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{items[i].name}</span>
                                {items[i].price && items[i].stock !== "UNKNOWN" && <span className="shrink-0 text-[12.5px] font-bold tabular-nums" style={{ color: L.green }}>{items[i].price}</span>}
                                <ChevronRight className="size-3.5 shrink-0" style={{ color: L.muted }} aria-hidden="true" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
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

function Tags({ item, margin }: { item: IslandAdvice; /** La marge, pour le pharmacien seul : sur la même ligne que le stock. */ margin?: string }) {
  const stock =
    item.stock === "IN_STOCK" ? { label: `${T.inStock}${item.quantity !== undefined ? ` · ${item.quantity}` : ""}`, fg: C.numberFg }
    : item.stock === "LOW_STOCK" ? { label: `${T.lowStock}${item.quantity !== undefined ? ` · ${item.quantity}` : ""}`, fg: C.lowFg }
    : item.stock === "OUT_OF_STOCK" ? { label: "Rupture", fg: C.outFg }
    : { label: "Stock à vérifier", fg: C.inkSoft };
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {margin && <Chip bg="#FFF5D6" fg="#9A6400">Marge {margin}</Chip>}
      {item.challenge && <Chip bg={C.challengeBg} fg={C.challengeFg}>★ {item.challengeLabel ? (/^challenge\b/i.test(item.challengeLabel) ? item.challengeLabel : `${T.challenge} ${item.challengeLabel}`) : T.challenge}</Chip>}
      {item.shortDate && <Chip bg={C.dateBg} fg={C.dateFg}>{T.shortDate} {item.shortDate}</Chip>}
      <Chip bg={C.cell} fg={stock.fg}>{stock.label}</Chip>
    </div>
  );
}

/**
 * Le texte de l'onglet, à hauteur fixe : ce qui dépasse (« À dire au patient » sous la posologie) se lit en faisant défiler,
 * la bannière ne grandit pas. Un repère « ▾ suite » le dit tant qu'il reste du texte plus bas.
 */
function ScrollBody({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    el.addEventListener("scroll", check, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", check);
    };
  }, []);
  return (
    <div className="relative">
      <div ref={ref} data-ile-mix-l-corps="" className="mt-2 max-h-[150px] pr-1.5 text-[12px] leading-[17px]">
        <div>{children}</div>
      </div>
      {more && (
        <button
          type="button"
          onClick={() => ref.current?.scrollBy({ top: 90, behavior: "smooth" })}
          className="absolute right-3 bottom-0 left-0 flex h-7 items-end justify-center bg-gradient-to-t from-white via-white/90 to-transparent pb-0.5 text-[10.5px] font-bold"
          style={{ color: L.green }}
        >
          ▾ suite
        </button>
      )}
    </div>
  );
}

/** Le stock d'un conseil, en clair : « En stock · 29 », « Stock faible · 3 », « Rupture », « Stock à vérifier ». */
function stockLabel(item: IslandAdvice): string {
  const count = item.quantity !== undefined ? ` · ${item.quantity}` : "";
  return item.stock === "IN_STOCK" ? `${T.inStock}${count}` : item.stock === "LOW_STOCK" ? `${T.lowStock}${count}` : item.stock === "OUT_OF_STOCK" ? "Rupture" : "Stock à vérifier";
}

/** Les couleurs du stock dans la petite bannière : vert, orange s'il est faible, rouge en rupture, gris s'il est à vérifier. */
function stockColors(item: IslandAdvice): { bg: string; fg: string } {
  return item.stock === "IN_STOCK" ? { bg: "#7BE0B0", fg: "#063B26" } : item.stock === "LOW_STOCK" ? { bg: "#FFB86B", fg: "#4A2600" } : item.stock === "OUT_OF_STOCK" ? { bg: "#FF8A80", fg: "#4A0B07" } : { bg: "rgba(255,255,255,0.14)", fg: "#F2FFF9" };
}

/** Un repère de la petite bannière du haut, lisible sur le fond noir. */
function HeadChip({ bg = "rgba(255,255,255,0.14)", fg = "#F2FFF9", children }: { bg?: string; fg?: string; children: ReactNode }) {
  return <span className="inline-flex h-[18px] items-center rounded-full px-1.5 text-[10.5px] font-bold whitespace-nowrap [text-shadow:none]" style={{ background: bg, color: fg }}>{children}</span>;
}

function Chip({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
  return <span className="inline-flex h-5 items-center rounded-full px-2 text-[10.5px] font-bold" style={{ background: bg, color: fg }}>{children}</span>;
}

/** 3. Questions : les deux questions ; la réponse touchée dit quoi faire, et parfois un produit plus précis du stock. */
function Ask({ item }: { item: IslandAdvice }) {
  const ask = item.sheet?.ask ?? [];
  const answers = item.sheet?.answers ?? [];
  const [picked, setPicked] = useState<Record<number, number>>({});
  if (ask.length === 0) return <p style={{ color: C.inkSoft }}>Les questions de ce conseil sont en cours de rédaction : appuyez-vous sur la fiche.</p>;
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

/**
 * 1. Fiche : posologie, conseils au patient, contre-indications, effets indésirables — ce que PharmaBoost sait ; une rubrique
 * vide renvoie à la notice. La posologie, c'est combien et combien de fois par jour (fondateur, 22 oct. 2026) : les mises en
 * garde à dire au patient (« diarrhée au-delà de 48 h : consultez ») ont leur rubrique, jamais sous « Posologie ».
 */
function Sheet({ item }: { item: IslandAdvice }) {
  const sheet = item.sheet;
  const usage = sheet?.usage ?? [];
  const effects = sheet?.sideEffects ?? [];
  const contraindications = sheet?.contraindications ?? [];
  // Compacte (fondateur, 22 oct. 2026 : « ça prend trop d'espace ») : les rubriques vides tiennent en une seule ligne.
  const unknown = [contraindications.length === 0 ? "contre-indications" : null, effects.length === 0 ? "effets indésirables" : null].filter(Boolean);
  return (
    <div className="space-y-2.5">
      <Part title="Posologie">{sheet?.description ? <p className="break-words">{sheet.description}</p> : <Missing>{POSOLOGY_MISSING}</Missing>}</Part>
      {usage.length > 0 && (
        <Part title="À dire au patient">
          <Lines lines={usage.slice(0, TELL_MAX)} />
        </Part>
      )}
      {contraindications.length > 0 && (
        <Part title="Contre-indications">
          <Lines lines={contraindications} />
        </Part>
      )}
      {effects.length > 0 && (
        <Part title="Effets indésirables">
          <p className="break-words">{effects.join(" · ")}</p>
          <p className="text-[10.5px]" style={{ color: L.muted }}>Fréquents, d&apos;après le RCP officiel (BDPM).</p>
        </Part>
      )}
      {unknown.length > 0 && <Missing>{`${unknown.join(" et ").replace(/^./, (c) => c.toUpperCase())} : non renseignés dans PharmaBoost, voir la notice.`}</Missing>}
    </div>
  );
}

const POSOLOGY_MISSING = "Non renseignée dans PharmaBoost : voir la notice.";

/**
 * 3. Aide : le pharmacien qui ne sait pas répondre au patient pose sa question sur CE conseil ; la réponse arrive dessous
 * (agent du poste → serveur → modèle). Rien du patient ne part : la question et la fiche du conseil.
 */
function Help({ item, help }: { item: IslandAdvice; help: NonNullable<MixIslandProps["help"]> }) {
  const [draft, setDraft] = useState("");
  const name = item.sheet?.name || item.name;
  const log = help.log.filter((entry) => entry.advice === name).slice(-3);
  const ask = () => {
    const question = draft.replace(/\s+/g, " ").trim();
    if (question.length < 2) return;
    help.onAsk(question.slice(0, 400), {
      name,
      ...(item.sheet?.reasons[0] || item.reason ? { reason: item.sheet?.reasons[0] || item.reason } : {}),
      ...(item.sheet?.description ? { posology: item.sheet.description } : {}),
      ...(item.sheet?.usage.length ? { tell: item.sheet.usage.map((line) => line.text) } : {}),
    });
    setDraft("");
  };
  return (
    <div className="space-y-2" data-ile-aide="">
      {log.length === 0 && <p style={{ color: C.inkSoft }}>Le patient pose une question à laquelle vous ne savez pas répondre ? Demandez à l&apos;aide, sur ce conseil.</p>}
      {log.map((entry, index) => (
        <div key={index} className="space-y-1">
          <p className="ml-6 rounded-xl rounded-br-sm px-2.5 py-1.5 text-white" style={{ background: C.pick }}>{entry.question}</p>
          <p className="mr-6 rounded-xl rounded-bl-sm px-2.5 py-1.5" style={{ background: C.raised, color: C.raisedInk }}>
            {entry.answer || entry.error || "L'aide réfléchit…"}
          </p>
        </div>
      ))}
      <div className="flex gap-1.5" data-ile-sans-deploiement="">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") ask();
          }}
          maxLength={400}
          placeholder="Ex. : peut-on le prendre enceinte ?"
          className="h-8 min-w-0 flex-1 rounded-lg bg-white px-2.5 text-[12px] text-[#0F2F2A] outline-none"
        />
        <button type="button" onClick={ask} className="h-8 shrink-0 rounded-lg px-2.5 text-[11.5px] font-bold" style={{ background: C.accent, color: "#04261A" }}>
          Demander
        </button>
      </div>
      <p className="text-[10px]" style={{ color: C.inkSoft }}>Aide du modèle : vérifiez sur la notice ou le RCP avant de conseiller.</p>
    </div>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      {/* Les sous-titres légers de l'essai « L » (22 oct. 2026) : petites capitales espacées, gris doux ; le texte dessous, foncé. */}
      <p className="text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: L.muted }}>{title}</p>
      <div className="mt-1 space-y-1" style={{ color: L.ink, fontWeight: 400 }}>{children}</div>
    </div>
  );
}

function Lines({ lines }: { lines: CounterSheetLine[] }) {
  return (
    <ul className="space-y-0.5">
      {lines.map((line) => (
        // Droit et sans gras, comme l'essai « L » (22 oct. 2026) ; en ligne, pour passer devant le gras du fond noir.
        <li key={line.text} className="break-words" style={{ fontStyle: "normal", fontWeight: 400 }}>
          · {line.text}
          {line.detail ? <span style={{ color: L.muted }}> — {line.detail}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function Missing({ children }: { children: ReactNode }) {
  return <p style={{ color: L.muted, fontWeight: 400 }}>{children}</p>;
}

/** Les couleurs de la carte ouverte (essai « L ») : encre foncée sur blanc, vert de la marque, gris doux. */
const L = { ink: "#0F2B26", green: "#0E8A7B", muted: "#5B6B66", soft: "#F3F7F5" } as const;

/** « À dire au patient » : deux phrases au plus (fondateur, 22 oct. 2026 : « trop d'info, limite à 2 phrases »). */
const TELL_MAX = 2;
