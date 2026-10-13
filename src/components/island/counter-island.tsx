"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, ExternalLink, FileText, GripVertical, Loader2, Mail, PartyPopper, ScanLine, Send, TriangleAlert } from "lucide-react";
import { BANNER } from "../../../agent/src/banner-design";
import { SHEET_MISSING, SHEET_PATIENT_LABELS, type CounterSheet, type CounterSheetLine } from "../../../agent/src/counter-sheet";
import { Robot } from "@/components/robot";
import { analysisSteps, allAnswered, followAdviceLink, isTap, registerTap, splitAlert, STAGE_MOOD, STAGE_WIDTH, stageTitle, stageTone, type IslandOutcome, type IslandState } from "@/core/island/banner-flow";
import { cn } from "@/lib/utils";
import { IslandShell } from "./island-shell";

/**
 * La bannière du comptoir en île : la capsule noire en haut de l'écran, NOTRE robot dedans, et tout le parcours d'une
 * délivrance joué à l'intérieur (scan, analyse qui se coche, conseils en cartes, Vendu / Non vendu, e-mail du bilan,
 * vente terminée, mise en garde). Les textes et les couleurs sont ceux de la bannière Windows (`banner-design.ts`).
 *
 * Composant d'affichage : l'état vient de l'extérieur (aperçu, ou plus tard la vraie vente), les gestes remontent.
 */

const C = BANNER.colors;
const T = BANNER.text;

export type IslandAdvice = {
  name: string;
  price?: string;
  /** La marge HT par unité (« 11,10 € ») : pour le pharmacien, jamais pour le patient. */
  margin?: string;
  drug?: string;
  reason?: string;
  challenge?: boolean;
  shortDate?: string;
  stock?: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "UNKNOWN";
  quantity?: number;
  image?: string;
  /**
   * La page PharmaBoost de ce conseil, lu en entier (agent/src/sale-link.ts) : le bouton « Fiche complète » de la carte
   * déployée. Absent : pas de bouton (vente d'exemple, site public).
   */
  href?: string;
  /**
   * Ce que la carte montre une fois DÉPLOYÉE (un appui sur elle) : nom complet, raison complète, phrase du comptoir,
   * contre-indications, conseils d'utilisation — la fiche complète de la page de vente, bornée (core/counter/advice-sheet.ts).
   * Absente (agent plus ancien) : la carte se déploie sur le nom et la raison complets, et la fiche complète.
   */
  sheet?: CounterSheet;
};

export type IslandPill = { key: string; label: string; value: string; dot?: string };

export type CounterIslandProps = {
  state: IslandState;
  items: IslandAdvice[];
  drug: string;
  alert: { title: string; text: string } | null;
  pills: IslandPill[];
  /** Survol de la capsule au repos : elle s'ouvre sur le résumé du comptoir. */
  hoverOpen?: boolean;
  onAnswer: (index: number, outcome: IslandOutcome) => void;
  onEmail: (value: string) => void;
  onSendEmail: () => void;
  onAddEmail: () => void;
  onFinish: () => void;
  onDismissAlert: () => void;
  /** Le bilan par e-mail se propose dans l'île (poste). Faux sur l'écran de vente du logiciel, où le plan patient prend le relais. */
  emailEnabled?: boolean;
  /** Le libellé du bouton de fin (« Vente terminée » au poste). */
  finishLabel?: string;
  /** Le look du robot (le comptoir de la personne). */
  look?: number | null;
  /** L'île peut se replier en capsule (écran de vente : elle ne doit pas cacher la page). Elle se rouvre à chaque nouvelle étape. */
  collapsible?: boolean;
  /** La personne ne peut pas trancher les conseils (préparateur sans ce droit) : les cartes se lisent, sans boutons. */
  readOnly?: boolean;
  /** La hauteur de la liste des conseils, en pixels : au-delà, on défile DANS l'île (elle ne masque pas le logiciel de gestion). */
  listMaxHeight?: number;
  /** Les mises en garde une par une (« Titre — Sous-titre : Explication ») : chacune mise en forme. À défaut, `alert.text`. */
  alertItems?: string[];
  /** L'île se déplace (poste Windows) : une poignée le montre au repos et au survol. */
  movable?: boolean;
  /**
   * « Fiche complète » s'ouvre ailleurs (poste Windows : l'hôte l'envoie au navigateur par défaut du PC). Faux : sur la
   * même page (écran de vente, où la carte du conseil se déplie).
   */
  adviceLinksOutside?: boolean;
  /** Un vrai clic sur « Fiche complète » (pas un glisser) : la page peut viser ce conseil elle-même. */
  onOpenAdvice?: (index: number) => void;
};

/** La carte déployée, retenue avec la liste des conseils affichés : une autre vente (d'autres conseils) repart repliée. */
export type UnfoldedAdvice = { name: string; among: string } | null;

const amongOf = (items: Pick<IslandAdvice, "name">[]) => items.map((item) => item.name).join("\n");

/** Le nom de la carte déployée parmi ces conseils, ou null : une seule à la fois. */
export function unfoldedName(unfolded: UnfoldedAdvice, items: Pick<IslandAdvice, "name">[]): string | null {
  return unfolded && unfolded.among === amongOf(items) ? unfolded.name : null;
}

/** Un appui sur une carte : elle se déploie (et replie l'autre) ; un second appui sur elle la replie. */
export function toggleAdvice(unfolded: UnfoldedAdvice, items: Pick<IslandAdvice, "name">[], name: string): UnfoldedAdvice {
  return unfoldedName(unfolded, items) === name ? null : { name, among: amongOf(items) };
}

/** Ce que dit le bouton « Fiche complète » (survol, lecteur d'écran). */
const OPEN_ADVICE = "Lire le conseil en entier dans PharmaBoost : contre-indications, conseils d'utilisation";

/** Hauteur par défaut de la liste des conseils : une carte et demie visibles, le reste se fait défiler. */
export const ADVICE_LIST_MAX_HEIGHT = 196;

const STOCK: Record<NonNullable<IslandAdvice["stock"]>, { bg: string; fg: string; label: string }> = {
  IN_STOCK: { bg: C.stockBg, fg: C.stockFg, label: T.inStock },
  LOW_STOCK: { bg: C.lowBg, fg: C.lowFg, label: T.lowStock },
  OUT_OF_STOCK: { bg: C.outBg, fg: C.outFg, label: T.outOfStock },
  UNKNOWN: { bg: C.unknownBg, fg: C.unknownFg, label: T.unknownStock },
};

function Chip({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] font-semibold whitespace-nowrap" style={{ background: bg, color: fg }}>
      {children}
    </span>
  );
}

export function CounterIsland(props: CounterIslandProps) {
  const { state, items, alert, pills } = props;
  const count = items.length;
  const [hover, setHover] = useState(false);
  const [taps, setTaps] = useState<number[]>([]);
  const [grumpy, setGrumpy] = useState(false);
  const [cheer, setCheer] = useState(0);
  const [collapsedAt, setCollapsedAt] = useState<string | null>(null);
  // La carte DÉPLOYÉE (une seule à la fois), retenue avec les conseils affichés : une autre vente repart repliée.
  const [unfolded, setUnfolded] = useState<UnfoldedAdvice>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openName = unfoldedName(unfolded, items);

  // La fête du robot rejouée à chaque « Vente terminée ».
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la fête suit l'étape
    if (state.stage === "done") setCheer(Date.now());
  }, [state.stage]);

  useEffect(() => {
    if (!grumpy) return;
    const id = setTimeout(() => setGrumpy(false), 3000);
    return () => clearTimeout(id);
  }, [grumpy]);

  const resting = state.stage === "idle";
  const peek = resting && hover && props.hoverOpen !== false && !grumpy;
  const mood = grumpy ? "concerned" : STAGE_MOOD[state.stage];
  const tone = grumpy ? "warning" : stageTone(state.stage);
  const width = grumpy ? 340 : peek ? 400 : props.collapsible && collapsedAt === state.stage && state.stage !== "idle" ? 280 : STAGE_WIDTH[state.stage];
  const title = stageTitle(state, count);

  const onTap = () => {
    const result = registerTap(taps, Date.now());
    setTaps(result.taps);
    if (result.tooMany) {
      setGrumpy(true);
      setTaps([]);
    }
  };

  const robot = (size: number, style?: CSSProperties) => (
    <span className="relative shrink-0" style={style}>
      <Robot size={size} mood={mood} cheerKey={cheer || undefined} interactive sound="counter" look={props.look} label="Le robot PharmaBoost" />
    </span>
  );

  // Repliée pour CETTE étape seulement : une nouvelle étape (conseils prêts, mise en garde…) rouvre l'île.
  const collapsed = props.collapsible === true && collapsedAt === state.stage && state.stage !== "idle";
  const toggle = props.collapsible && state.stage !== "idle" && !grumpy ? (
    <button
      type="button"
      onClick={() => setCollapsedAt(collapsed ? null : state.stage)}
      aria-label={collapsed ? "Déplier l'île" : "Replier l'île"}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-[#36E8C8]"
    >
      {collapsed ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronUp className="size-4" aria-hidden="true" />}
    </button>
  ) : null;

  let body: ReactNode;
  if (collapsed) {
    body = (
      <div className="flex h-10 items-center gap-2 pr-2 pl-1.5">
        {robot(28)}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white/85">{title}</span>
        {toggle}
      </div>
    );
  } else if (grumpy) {
    body = (
      <Row robot={robot(30)} title="Doucement !" sub="Trop de clics d'un coup — je reprends dans 3 secondes." />
    );
  } else if (peek) {
    body = (
      <div className="px-3 pt-2.5 pb-3">
        <Row robot={robot(30)} title={title} sub={props.movable ? "Je surveille le comptoir. Glissez-moi pour me déplacer." : "Je surveille le comptoir. Scannez une boîte pour commencer."} compact />
        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          {pills.map((pill) => (
            <div key={pill.key} className="rounded-2xl bg-white/[0.06] px-2.5 py-2">
              <p className="text-[10.5px] font-medium tracking-[0.04em] text-white/55 uppercase">{pill.label}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[14px] font-semibold tabular-nums">
                {pill.dot && <span className="size-1.5 rounded-full" style={{ background: pill.dot }} />}
                {pill.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  } else {
    switch (state.stage) {
      case "idle":
        body = (
          <div className="flex h-10 items-center gap-2 pr-3.5 pl-1.5">
            {robot(28)}
            <span className="min-w-0 flex-1 truncate text-[13px] text-white/80">{title}</span>
            <span className="size-2 shrink-0 rounded-full" style={{ background: C.accent, boxShadow: `0 0 8px ${C.accent}` }} aria-label="Poste connecté" />
            {props.movable && <GripVertical className="-mr-1.5 size-3.5 shrink-0 text-white/30" aria-hidden="true" />}
          </div>
        );
        break;
      case "scan":
        body = (
          <div className="relative">
            <Row robot={robot(30)} title={T.scanTitle} sub={T.scanSub} icon={<ScanLine className="size-4" style={{ color: C.glow }} aria-hidden="true" />} />
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden">
              <span className="isl-scanbar block h-full w-1/3" style={{ background: `linear-gradient(90deg, transparent, ${C.glow}, transparent)` }} />
            </span>
          </div>
        );
        break;
      case "analyzing": {
        const steps = analysisSteps(props.drug, count);
        body = (
          <div className="px-3 pt-2.5 pb-3">
            <Row robot={robot(30)} title={title} sub={props.drug} compact />
            <ol className="mt-2 space-y-0.5 rounded-xl bg-white/[0.05] px-2.5 py-2 font-mono text-[11.5px] leading-[18px]">
              {/* Les trois dernières lignes seulement : l'île reste fine pendant que l'analyse se coche. */}
              {steps.slice(0, Math.min(state.stepsDone + 1, steps.length)).map((step, i) => ({ step, i })).slice(-3).map(({ step, i }) => {
                const done = i < state.stepsDone;
                return (
                  <li key={step} className="isl-line flex items-center gap-2">
                    {done ? <Check className="size-3.5 shrink-0" style={{ color: C.accent }} strokeWidth={3} aria-hidden="true" /> : <Loader2 className="isl-spin size-3.5 shrink-0 text-white/60" aria-hidden="true" />}
                    <span className={cn("truncate", done ? "text-white/85" : "text-white/60")}>{step}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        );
        break;
      }
      case "ready":
        body = <Row robot={robot(32)} title={title} sub={`${T.forDrug}${props.drug}`} trailing={<span className="isl-pop rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: C.accent, color: "#04261A" }}>{count}</span>} />;
        break;
      case "advice":
        body = (
          <div className="px-2.5 pt-2.5 pb-2.5">
            <Row robot={robot(30)} title={title} sub={allAnswered(state, count) ? T.allDone : `${T.forDrug}${props.drug}`} compact />
            <AdviceList maxHeight={props.listMaxHeight ?? ADVICE_LIST_MAX_HEIGHT} count={count} unfolded={openName}>
              {items.map((item, index) => (
                <AdviceCard
                  key={item.name}
                  item={item}
                  outcome={state.outcomes[index] ?? null}
                  readOnly={props.readOnly}
                  outside={props.adviceLinksOutside}
                  open={openName === item.name}
                  onToggle={() => setUnfolded(toggleAdvice(unfolded, items, item.name))}
                  onOpen={() => props.onOpenAdvice?.(index)}
                  onAnswer={(outcome) => props.onAnswer(index, outcome)}
                />
              ))}
            </AdviceList>
            <div className="mt-2 flex items-center gap-2">
              {props.emailEnabled !== false && <button type="button" onClick={props.onAddEmail} className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/[0.08] text-[12.5px] font-semibold text-white/90 transition-colors hover:bg-white/[0.14] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#36E8C8]">
                <Mail className="size-3.5" aria-hidden="true" /> {T.emailAdd}
              </button>}
              <button type="button" onClick={props.onFinish} className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#36E8C8]" style={{ background: C.accent, color: "#04261A" }}>
                <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> {props.finishLabel ?? T.finish}
              </button>
            </div>
          </div>
        );
        break;
      case "email":
        body = (
          <div className="px-3 pt-2.5 pb-3">
            <Row robot={robot(30)} title="Bilan conseil par e-mail" sub="Le patient reçoit ses conseils et vos coordonnées." compact />
            <form
              className="mt-3 flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                props.onSendEmail();
              }}
            >
              <label className="sr-only" htmlFor="ile-email">E-mail du patient</label>
              <input
                id="ile-email"
                type="email"
                value={state.email}
                onChange={(event) => props.onEmail(event.target.value)}
                placeholder="patient@exemple.fr"
                className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-[13.5px] text-white placeholder:text-white/35 focus:border-[#36E8C8] focus:outline-none"
              />
              <button type="submit" className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-bold" style={{ background: C.accent, color: "#04261A" }}>
                <Send className="size-3.5" aria-hidden="true" /> Envoyer
              </button>
            </form>
          </div>
        );
        break;
      case "emailSent":
        body = <Row robot={robot(30)} title="E-mail envoyé" sub={state.email || "Le bilan est parti."} trailing={<span className="isl-pop flex size-7 items-center justify-center rounded-full" style={{ background: C.accent }}><Check className="size-4 text-[#04261A]" strokeWidth={3} aria-hidden="true" /></span>} />;
        break;
      case "done": {
        const sold = items.filter((_, i) => state.outcomes[i] === "SOLD");
        body = (
          <Row
            robot={robot(32)}
            title={T.doneTitle}
            sub={sold.length ? `${sold.length} conseil${sold.length > 1 ? "s" : ""} vendu${sold.length > 1 ? "s" : ""}${sold[0]?.price ? ` · ${sold.map((item) => item.price).filter(Boolean).join(" + ")}` : ""}` : "Merci, à la prochaine délivrance."}
            trailing={<PartyPopper className="isl-pop size-5" style={{ color: C.challengeIcon }} aria-hidden="true" />}
          />
        );
        break;
      }
      case "alert": {
        const parts = (props.alertItems?.length ? props.alertItems : alert?.text ? [alert.text] : []).map(splitAlert);
        body = (
          <div className="px-3 pt-2.5 pb-3">
            <Row robot={robot(30)} title={alert?.title ?? T.readFirst} sub={parts.length > 1 ? `${T.duringSale} · ${parts.length} points` : T.duringSale} compact icon={<TriangleAlert className="size-4 text-white/60" aria-hidden="true" />} />
            <AdviceList maxHeight={176} count={parts.length} label={`${parts.length} point${parts.length > 1 ? "s" : ""} à lire`} noun="point">
              {parts.map((part, index) => (
                <li key={index} data-advice-card="" className="snap-start rounded-xl bg-white/[0.06] px-3 py-2">
                  {part.title && <p className="text-[13px] leading-[18px] font-semibold text-white">{part.title}</p>}
                  {part.subtitle && <p className="text-[11.5px] leading-4 font-medium text-white/65">{part.subtitle}</p>}
                  <p className={cn("text-[12.5px] leading-[18px] text-white/85", (part.title || part.subtitle) && "mt-1")}>{part.detail}</p>
                </li>
              ))}
            </AdviceList>
            <div className="mt-2 flex justify-end">
              <button type="button" onClick={props.onDismissAlert} className="h-8 rounded-lg bg-white px-3.5 text-[12.5px] font-bold text-[#0B0F14]">
                Compris
              </button>
            </div>
          </div>
        );
        break;
      }
      case "quiet":
        body = <Row robot={robot(30)} title={T.quiet} sub={T.quietSub} />;
        break;
    }
  }

  return (
    <div
      onClick={(event) => {
        // Appuyer sur une carte de conseil la déploie : ce n'est pas taquiner le robot.
        if (!(event.target as Element).closest("button, input, form, a, [data-advice-card]")) onTap();
      }}
    >
      <IslandShell
        width={width}
        tone={tone}
        contentKey={grumpy ? "grumpy" : peek ? "peek" : collapsed ? `${state.stage}-replie` : state.stage}
        label="Bannière PharmaBoost du comptoir"
        onPointerEnter={() => {
          if (leaveTimer.current) clearTimeout(leaveTimer.current);
          setHover(true);
        }}
        onPointerLeave={() => {
          leaveTimer.current = setTimeout(() => setHover(false), 350);
        }}
      >
        {toggle && !collapsed ? (
          <div className="relative pr-7">
            {body}
            <div className="absolute top-2 right-1.5">{toggle}</div>
          </div>
        ) : (
          body
        )}
      </IslandShell>
    </div>
  );
}

function Row({ robot, title, sub, trailing, icon, compact }: { robot: ReactNode; title: string; sub?: string; trailing?: ReactNode; icon?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", compact ? "" : "px-2.5 py-2")}>
      {robot}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[13.5px] leading-[18px] font-semibold" aria-live="polite">
          {icon}
          {title}
        </p>
        {sub && <p className="truncate text-[12px] leading-4 text-white/60">{sub}</p>}
      </div>
      {trailing}
    </div>
  );
}

/** Ce que disent la carte repliée et la carte déployée (survol, lecteur d'écran). */
const UNFOLD = "Appuyer pour déployer le conseil : contre-indications, conseils d'utilisation";
const FOLD = "Appuyer pour replier le conseil";
/** La carte déployée sans fiche (serveur plus ancien) : le détail se lit dans la fiche complète. */
const IN_FULL_SHEET = "À lire dans la fiche complète.";

export function AdviceCard({ item, outcome, onAnswer, readOnly, outside, open, onToggle, onOpen }: { item: IslandAdvice; outcome: IslandOutcome; onAnswer: (outcome: IslandOutcome) => void; readOnly?: boolean; outside?: boolean; open: boolean; onToggle: () => void; onOpen?: () => void }) {
  const stock = item.stock ? STOCK[item.stock] : null;
  const press = useRef<{ x: number; y: number } | null>(null);
  const detailsId = useId();
  // Repliée, le nom et la raison tiennent sur deux lignes ; déployée, le nom COMPLET (la carte l'abrège) et la raison
  // passent dans le détail, en entier.
  const name = (open && item.sheet?.name) || item.name;
  const summary = (
    <>
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- vignette locale déjà à la bonne taille
        <img src={item.image} alt="" width={40} height={40} draggable={false} className="size-10 shrink-0 rounded-lg bg-white object-contain" />
      ) : (
        <span className="size-10 shrink-0 rounded-lg" style={{ background: C.line }} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-[13px] leading-[18px] font-bold break-words", !open && "line-clamp-2")}>{name}</p>
          <span className="flex shrink-0 items-center gap-1 pt-px">
            {item.price && stock && item.stock !== "UNKNOWN" && <span className="text-[12.5px] font-bold tabular-nums">{item.price}</span>}
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} style={{ color: C.inkSoft }} aria-hidden="true" />
          </span>
        </div>
        {item.reason && !open && <p className="line-clamp-2 text-[11.5px] leading-4 break-words" style={{ color: C.inkSoft }}>{item.reason}</p>}
        <div className="mt-1 flex flex-wrap gap-1">
          {item.challenge && <Chip bg={C.challengeBg} fg={C.challengeFg}>★ {T.challenge}</Chip>}
          {item.shortDate && <Chip bg={C.dateBg} fg={C.dateFg}>{T.shortDate} {item.shortDate}</Chip>}
          {item.margin && <Chip bg="rgba(54,232,200,0.14)" fg="#0B6B57">Marge {item.margin} HT</Chip>}
          {stock && <Chip bg={stock.bg} fg={stock.fg}>{stock.label}{item.quantity !== undefined && item.stock !== "OUT_OF_STOCK" ? ` · ${item.quantity}` : ""}</Chip>}
        </div>
      </div>
    </>
  );
  return (
    <li data-advice-card="" data-open={open ? "" : undefined} className="isl-line snap-start rounded-xl p-2" style={{ background: C.panel, color: C.ink }}>
      {/* Toute la carte, hors boutons : un appui la DÉPLOIE sur place (un second la replie). Un appui suivi d'un mouvement
          (défilement de la liste) ne déploie rien. Elle est dans la liste qui défile : jamais une prise pour déplacer l'île. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={open ? detailsId : undefined}
        title={open ? FOLD : UNFOLD}
        data-advice-toggle=""
        className="-m-1 flex cursor-pointer gap-2 rounded-lg p-1 transition-colors hover:bg-black/[0.04] focus-visible:outline-2 focus-visible:outline-[#36E8C8]"
        onPointerDown={(event) => { press.current = { x: event.screenX, y: event.screenY }; }}
        onClick={(event) => {
          const tap = isTap(press.current, { x: event.screenX, y: event.screenY });
          press.current = null;
          if (tap) onToggle();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onToggle();
        }}
      >
        {summary}
        <span className="sr-only">{` — ${open ? FOLD : UNFOLD}`}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        {readOnly && !outcome ? (
          <span className="inline-flex h-7 flex-1 items-center justify-center rounded-lg text-[12px] font-medium" style={{ background: C.line, color: C.inkSoft }}>
            À proposer · le pharmacien valide
          </span>
        ) : outcome ? (
          <>
            <span className="isl-pop inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-lg text-[12px] font-bold" style={outcome === "SOLD" ? { background: C.soldBg, color: C.soldFg } : { background: C.notSoldBg, color: C.notSoldFg }}>
              {outcome === "SOLD" && <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />}
              {outcome === "SOLD" ? T.sold : T.notSold}
            </span>
            {!readOnly && (
              <button type="button" onClick={() => onAnswer(null)} className="h-7 rounded-lg px-2.5 text-[12px] font-semibold hover:bg-black/5" style={{ color: C.inkSoft }}>
                {T.change}
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" onClick={() => onAnswer("SOLD")} className="h-7 flex-1 rounded-lg text-[12px] font-bold transition-[filter] hover:brightness-105" style={{ background: C.soldBg, color: C.soldFg }}>
              {T.sold}
            </button>
            <button type="button" onClick={() => onAnswer("NOT_SOLD")} className="h-7 flex-1 rounded-lg text-[12px] font-bold transition-[filter] hover:brightness-95" style={{ background: C.notSoldBg, color: C.notSoldFg }}>
              {T.notSold}
            </button>
          </>
        )}
      </div>
      {open && <AdviceDetails id={detailsId} item={item} outside={outside} onOpen={onOpen} />}
    </li>
  );
}

/**
 * La carte déployée : la raison complète, ce que le pharmacien peut dire, les contre-indications et les conseils
 * d'utilisation — la fiche complète de la page de vente, bornée (core/counter/advice-sheet.ts). Rien n'est rédigé ici :
 * une rubrique vide le dit et renvoie à la notice. « Fiche complète » ouvre la page de la vente sur ce conseil.
 */
function AdviceDetails({ id, item, outside, onOpen }: { id: string; item: IslandAdvice; outside?: boolean; onOpen?: () => void }) {
  const sheet = item.sheet;
  const press = useRef<{ x: number; y: number } | null>(null);
  const reasons = sheet?.reasons.length ? sheet.reasons : item.reason ? [item.reason] : [];
  // Sans fiche (serveur plus ancien) on ne sait pas : on renvoie à la fiche complète quand elle existe, jamais « rien ».
  const unknown = !sheet && item.href ? IN_FULL_SHEET : null;
  const usageEmpty = !sheet || (sheet.usage.length === 0 && !sheet.description);
  return (
    <div id={id} data-advice-details="" className="mt-2 space-y-2 border-t pt-2 text-[12px] leading-[17px]" style={{ borderColor: C.line }}>
      <SheetPart title="Pourquoi ce conseil">
        {reasons.length > 0 ? reasons.map((reason) => <p key={reason} className="break-words">{reason}</p>) : <Missing>{SHEET_MISSING.reasons}</Missing>}
      </SheetPart>
      {sheet?.script && (
        <SheetPart title="À dire au patient">
          <p className="break-words">« {sheet.script} »</p>
        </SheetPart>
      )}
      <SheetPart title="Contre-indications">
        {sheet && sheet.contraindications.length > 0 ? <SheetLines lines={sheet.contraindications} /> : <Missing>{unknown ?? SHEET_MISSING.contraindications}</Missing>}
        {sheet && sheet.more.contraindications > 0 && <More count={sheet.more.contraindications} />}
      </SheetPart>
      <SheetPart title="Conseils d'utilisation">
        {sheet && sheet.usage.length > 0 && <SheetLines lines={sheet.usage} />}
        {sheet?.description && <p className="break-words">{sheet.description}</p>}
        {usageEmpty && <Missing>{unknown ?? SHEET_MISSING.usage}</Missing>}
        {sheet && sheet.more.usage > 0 && <More count={sheet.more.usage} />}
      </SheetPart>
      {sheet?.cut && <p className="text-[11px]" style={{ color: C.inkSoft }}>Texte abrégé : la suite se lit dans la fiche complète.</p>}
      {item.href && (
        // La page de la vente, ouverte sur ce conseil : au poste, l'hôte Windows l'envoie au navigateur du PC (lien vérifié
        // deux fois) ; sur l'écran de vente, sa carte se déplie sur la même page. Après un glisser, rien ne s'ouvre.
        <a
          href={item.href}
          target={outside ? "_blank" : undefined}
          rel={outside ? "noopener" : undefined}
          draggable={false}
          title={OPEN_ADVICE}
          data-advice-link=""
          className="inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-lg text-[12px] font-semibold transition-colors hover:bg-black/[0.08] focus-visible:outline-2 focus-visible:outline-[#36E8C8]"
          style={{ background: C.line, color: C.ink }}
          onPointerDown={(event) => { press.current = { x: event.screenX, y: event.screenY }; }}
          onClick={(event) => {
            followAdviceLink(press.current, event, onOpen);
            press.current = null;
          }}
        >
          <FileText className="size-3.5" aria-hidden="true" /> Fiche complète
          {outside && <ExternalLink className="size-3" aria-hidden="true" />}
          <span className="sr-only">{` — ${OPEN_ADVICE}${outside ? " (s'ouvre dans le navigateur)" : ""}`}</span>
        </a>
      )}
    </div>
  );
}

function SheetPart({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <p className="text-[10.5px] font-bold tracking-[0.04em] uppercase" style={{ color: C.inkSoft }}>{title}</p>
      <div className="mt-0.5 space-y-1">{children}</div>
    </section>
  );
}

function SheetLines({ lines }: { lines: CounterSheetLine[] }) {
  return (
    <ul className="space-y-1">
      {lines.map((line, index) => (
        <li key={`${line.text}-${index}`} className="break-words">
          <span className="font-semibold">{line.text}</span>
          {line.patient && <span className={cn("ml-1 text-[11px]", line.patient === "CONCERNED" && "font-bold")} style={{ color: line.patient === "CONCERNED" ? C.ink : C.inkSoft }}>· {SHEET_PATIENT_LABELS[line.patient]}</span>}
          {line.detail && <span className="block" style={{ color: C.inkSoft }}>{line.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

function Missing({ children }: { children: ReactNode }) {
  return <p className="break-words italic" style={{ color: C.inkSoft }}>{children}</p>;
}

function More({ count }: { count: number }) {
  return <p className="text-[11px] font-medium" style={{ color: C.inkSoft }}>+ {count} dans la fiche complète</p>;
}

/**
 * La liste des conseils, à hauteur fixe : au-delà, on DÉFILE dans l'île (molette, doigt, ou les flèches — un clic
 * suffit, même quand le poste ne donne pas le clavier à l'île). Un dégradé en bas dit qu'il en reste ; « 2 / 3 » dit où
 * l'on en est. L'île garde ainsi sa taille normale et ne masque pas le logiciel de gestion.
 */
function AdviceList({ maxHeight, count, children, label, noun = "conseil", unfolded = null }: { maxHeight: number; count: number; children: ReactNode; label?: string; noun?: string; unfolded?: string | null }) {
  const list = useRef<HTMLUListElement>(null);
  const [view, setView] = useState({ up: false, down: false, first: 1 });

  const update = useCallback(() => {
    const node = list.current;
    if (!node) return;
    const cards = [...node.querySelectorAll<HTMLElement>("[data-advice-card]")];
    const top = node.scrollTop;
    const index = cards.findIndex((card) => card.offsetTop + card.offsetHeight / 2 >= top);
    setView({ up: top > 2, down: top + node.clientHeight < node.scrollHeight - 2, first: index < 0 ? 1 : index + 1 });
  }, []);

  useEffect(() => {
    const node = list.current;
    if (!node) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [update, count]);

  // Une carte vient de se déployer : la liste la ramène en haut (son détail se lit en défilant DANS l'île), puis les
  // flèches et « 2/3 » se recalculent — la liste a grandi ou rétréci sans changer de taille.
  useEffect(() => {
    const node = list.current;
    if (!node) return;
    const card = unfolded ? node.querySelector<HTMLElement>("[data-advice-card][data-open]") : null;
    if (card) node.scrollTo({ top: card.offsetTop, behavior: "smooth" });
    update();
  }, [update, unfolded]);

  const scrollBy = (direction: 1 | -1) => {
    const node = list.current;
    if (!node) return;
    const card = node.querySelector<HTMLElement>("[data-advice-card]");
    node.scrollBy({ top: direction * ((card?.offsetHeight ?? 90) + 6), behavior: "smooth" });
  };

  const scrolls = view.up || view.down;
  return (
    <div className="relative mt-2">
      <ul
        ref={list}
        onScroll={update}
        aria-label={label ?? `${count} conseil${count > 1 ? "s" : ""}`}
        className={cn("isl-scroll snap-y space-y-1.5 overflow-y-auto overscroll-contain", unfolded ? "snap-proximity" : "snap-mandatory")}
        style={{ maxHeight, paddingRight: scrolls ? 26 : 0 }}
      >
        {children}
      </ul>
      {view.down && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-7 rounded-b-xl bg-gradient-to-t from-[#0B0F14] to-transparent" />}
      {scrolls && (
        <div className="absolute top-0 right-0 bottom-0 flex w-6 flex-col items-center justify-between py-0.5">
          <button type="button" onClick={() => scrollBy(-1)} disabled={!view.up} aria-label={`${noun === "conseil" ? "Conseil" : "Point"} précédent`} className="flex size-6 items-center justify-center rounded-full bg-white/[0.08] text-white/80 transition-opacity hover:bg-white/[0.16] disabled:opacity-25">
            <ChevronUp className="size-3.5" aria-hidden="true" />
          </button>
          <span className="text-[10px] font-semibold tabular-nums text-white/55" aria-live="polite">
            {view.first}/{count}
          </span>
          <button type="button" onClick={() => scrollBy(1)} disabled={!view.down} aria-label={`${noun === "conseil" ? "Conseil" : "Point"} suivant`} className="flex size-6 items-center justify-center rounded-full bg-white/[0.08] text-white/80 transition-opacity hover:bg-white/[0.16] disabled:opacity-25">
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
