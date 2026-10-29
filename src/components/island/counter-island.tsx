"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ExternalLink, FileText, GripVertical, Mail, Maximize2, Minimize2, PartyPopper, Pill, ScanLine, Send, TriangleAlert, Trophy, X } from "lucide-react";
import { islandTheme, PHARMABOOST_GREEN } from "./island-theme";
import { BANNER } from "../../../agent/src/banner-design";
import { SHEET_MISSING, SHEET_PATIENT_LABELS, type CounterSheet, type CounterSheetLine } from "../../../agent/src/counter-sheet";
import { Robot } from "@/components/robot";
import { HelixBackdrop } from "@/components/app/helix/helix-backdrop";
import { ScanCapsule, SCAN_CSS, SCAN_STEPS, WHITE_PILL_WIDTH, WhitePill, shortAdviceName, whiteFoundWidth, type ScanLook, type WhiteFound } from "./scan-capsule";
import { eurosOf, possibleMargin } from "./mix-island";
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

/**
 * Les couleurs de la bannière, chacune réglable par une variable CSS (« --isl-panel »…) : sans variable, ce sont celles d'aujourd'hui.
 * Les essais de couleurs et de polices (fondateur, 19 oct. 2026) les changent sur un parent, sans toucher au code de la bannière.
 */
const C = islandTheme({ ...BANNER.colors, ...PHARMABOOST_GREEN });

/** Les confettis de la fête d'une vente avec conseil vendu : dix éclats autour du robot, chacun sa direction. */
export const BURST_PIECES = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map((angle, index) => ({
  angle,
  distance: 30 + (index % 3) * 7,
  color: ["#FFD65A", "#58F2D8", "#FF8FA3", "#FFFFFF"][index % 4],
  delay: (index % 4) * 40,
}));
const T = BANNER.text;

export type IslandAdvice = {
  name: string;
  price?: string;
  /** La marge HT par unité (« 11,10 € ») : pour le pharmacien, jamais pour le patient. */
  margin?: string;
  drug?: string;
  reason?: string;
  challenge?: boolean;
  /** Le challenge et son gain (« Pileje · 1 € par boîte »), quand on le connaît. */
  challengeLabel?: string;
  /** Un produit de la campagne de surstock de l'officine : il passe en premier, pastille « Surstock ». */
  overstock?: boolean;
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
  /** Le menu déroulant (prix, marge, stock, questions, conseil) déjà ouvert : les exemples du site le montrent sans survol. */
  pitchOpen?: boolean;
};

export type IslandPill = { key: string; label: string; value: string; dot?: string };

export type CounterIslandProps = {
  state: IslandState;
  /**
   * L'animation du scan (fondateur, 29 oct. 2026) : la gélule ou la croix de pharmacie à la place des lignes qui se cochent ;
   * absente, les lignes d'avant.
   */
  scanLook?: ScanLook;
  /**
   * La fin de vente « compacte » (fondateur, 29 oct. 2026, essai « Fin 3 ») : l'e-mail tient en une ligne (Envoyer, Passer) avec
   * le compte à rebours dedans, et le Bravo pose tout de suite « Qui a servi ce patient ? ».
   */
  compactEnd?: boolean;
  /** Le compte à rebours de la vente validée dans le logiciel de gestion : secondes restantes et part restante (0 à 1). */
  emailCountdown?: { seconds: number; ratio: number } | null;
  /** « Qui a servi ce patient ? » dans le Bravo (fin compacte) : l'équipe, la personne choisie, et le choix. */
  served?: { team: { id: string; name: string }[]; chosen: string | null; done: boolean; onPick: (id: string) => void } | null;
  items: IslandAdvice[];
  drug: string;
  alert: { title: string; text: string } | null;
  pills: IslandPill[];
  /** Survol de la capsule au repos : elle s'ouvre sur le résumé du comptoir. */
  hoverOpen?: boolean;
  /** Au poste (fondateur, 21 oct. 2026) : la capsule au repos s'ouvre d'un CLIC, plus au survol ; elle se referme quand la souris sort. */
  peekOnClick?: boolean;
  /**
   * « Votre patient vous pose une question ? » (fondateur, 23 oct. 2026, essai A) : à la place de la case « Comptoir · Connecté »
   * de la capsule ouverte au repos ; le comptoir connecté passe en petit en haut à droite.
   */
  ask?: ReactNode;
  /** La capsule reste ouverte même souris dehors : le pharmacien écrit la demande du patient. */
  holdPeek?: boolean;
  onAnswer: (index: number, outcome: IslandOutcome) => void;
  /**
   * Le poste de caisse (fondateur, 16 oct. 2026) : Vendu / Non vendu se décident SANS clic — un conseil bipé passe en
   * « Vendu », un conseil non bipé en « Non vendu » à la validation de la vente. Les cartes n'affichent que leur état
   * (« À proposer », « ✓ Vendu ») ; la correction (« Vendu sans scan », « Annuler ») est dans la carte déployée.
   */
  autoOutcome?: boolean;
  onEmail: (value: string) => void;
  onSendEmail: () => void;
  onAddEmail: () => void;
  /** Quitter l'écran de l'e-mail sans l'envoyer (un bouton : on ne dépend jamais du clavier pour en sortir). */
  onCloseEmail?: () => void;
  /** L'e-mail demandé au moment de « Vente terminée » (poste) : « Envoyer et terminer », ou « Terminer sans e-mail » ici. */
  onFinishWithoutEmail?: () => void;
  onFinish: () => void;
  /** Les boîtes bipées de la vente : chacune se retire (le patient l'a reposée). Absent : pas de « Retirer ». */
  boxes?: { id: string; name: string; challenge?: string; reward?: string }[];
  onRemoveBox?: (id: string) => void;
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
  /**
   * Les conseils s'affichent d'abord en mode COMPACT (poste) : un conseil à la fois, sur une ligne, qui passe tout seul au
   * suivant une fois tranché ; un bouton agrandit la bannière (la liste complète) ou la réduit, et le choix est retenu.
   */
  compactAdvice?: boolean;
  /** Les essais de couleurs : l'île compacte ne se replie jamais en capsule faute de survol. */
  keepAwake?: boolean;
};

/** Le choix « bannière agrandie » du pharmacien, retenu sur ce poste. */
const SIZE_KEY = "pb-ile-agrandie";
function readExpanded(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(SIZE_KEY) === "1";
  } catch {
    return false;
  }
}
function saveExpanded(value: boolean) {
  try {
    window.localStorage.setItem(SIZE_KEY, value ? "1" : "0");
  } catch {
    // Stockage indisponible : le choix vaut pour cette vente seulement.
  }
}

/** Le conseil montré en mode compact : celui qu'on a choisi avec les flèches, sinon le premier qui attend une réponse. */
export function compactIndex(outcomes: readonly (IslandOutcome | undefined)[], count: number, chosen: number | null): number {
  if (chosen !== null && chosen >= 0 && chosen < count) return chosen;
  for (let index = 0; index < count; index += 1) if (!outcomes[index]) return index;
  return Math.max(0, count - 1);
}

/** Les conseils rangés par boîte scannée (« Pour : GAVISCON »), dans l'ordre où elles apparaissent : un bloc par boîte. */
export function groupByDrug(items: readonly Pick<IslandAdvice, "drug">[]): { drug: string; indexes: number[] }[] {
  const groups: { drug: string; indexes: number[] }[] = [];
  items.forEach((item, index) => {
    const drug = item.drug?.trim() || "";
    const group = groups.find((known) => known.drug === drug);
    if (group) group.indexes.push(index);
    else groups.push({ drug, indexes: [index] });
  });
  return groups;
}

/**
 * Les blocs de la bannière : un par boîte de la vente, dans l'ordre des boîtes — même une boîte sans conseil (« Aucun conseil »).
 * Sans la liste des boîtes (poste ancien), les blocs des conseils seuls. Une boîte ajoutée après un retrait, sans conseil, ne fait
 * plus disparaître la séparation (POSTE4, 15 oct. 2026).
 */
export function boxGroups(items: readonly Pick<IslandAdvice, "drug">[], boxes?: readonly { name: string }[]): { drug: string; indexes: number[] }[] {
  const groups = groupByDrug(items);
  if (!boxes || boxes.length === 0) return groups;
  const ordered = boxes.map((box) => groups.find((group) => group.drug === box.name.trim()) ?? { drug: box.name.trim(), indexes: [] as number[] });
  // Un conseil dont la boîte n'est pas (ou plus) dans la liste garde son bloc, à la suite.
  const rest = groups.filter((group) => !ordered.some((known) => known.drug === group.drug));
  return [...ordered, ...rest];
}

/** Au plus trois boîtes à l'écran en mode compact ; au-delà, « Agrandir » montre tout. */
export const COMPACT_MAX_GROUPS = 3;

/** Largeur de l'île en colonnes : deux ou trois boîtes côte à côte, toujours dans la fenêtre du poste (600 px). */
export const COLUMNS_WIDTH: Record<number, number> = { 2: 540, 3: 588 };
/** Plusieurs boîtes : la capsule du haut (robot, nombre de conseils, terminer) reste fine ; les blocs des boîtes sont dessous. */
const MULTI_CAPSULE_WIDTH = 300;

/** Largeur de l'île compacte : la plus fine qui garde nom, prix et boutons lisibles. */
export const COMPACT_WIDTH = 330;
/** Sans geste pendant ce délai, l'île compacte se replie en capsule ; le survol la rouvre. */
export const COMPACT_SLEEP_MS = 25_000;
const COMPACT_SLEEP_WIDTH = 250;

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
export const ADVICE_LIST_MAX_HEIGHT = 156;

const STOCK: Record<NonNullable<IslandAdvice["stock"]>, { bg: string; fg: string; label: string }> = {
  IN_STOCK: { bg: C.stockBg, fg: C.stockFg, label: T.inStock },
  LOW_STOCK: { bg: C.lowBg, fg: C.lowFg, label: T.lowStock },
  OUT_OF_STOCK: { bg: C.outBg, fg: C.outFg, label: T.outOfStock },
  UNKNOWN: { bg: C.unknownBg, fg: C.unknownFg, label: T.unknownStock },
};

/** Prix en gras, puis le stock avec sa pastille de couleur (vert, orange, rouge), le challenge en doré. */
function AdviceMeta({ item, small }: { item: IslandAdvice; small?: boolean }) {
  const stock = item.stock ? STOCK[item.stock] : null;
  const showPrice = item.price && stock && item.stock !== "UNKNOWN";
  const dot = item.stock === "IN_STOCK" ? "#16B88A" : item.stock === "LOW_STOCK" ? "#F2A516" : item.stock === "OUT_OF_STOCK" ? "#E5484D" : "#9AA7B0";
  return (
    <span className={cn("flex min-w-0 items-center gap-x-2 overflow-hidden whitespace-nowrap font-semibold", small ? "text-[10.5px] leading-[14px]" : "text-[11px] leading-4")}>
      {showPrice && <span className="shrink-0 font-bold tabular-nums" style={{ color: C.ink }}>{item.price}</span>}
      {stock && (
        <span className="inline-flex min-w-0 items-center gap-1 truncate" style={{ color: item.stock === "IN_STOCK" ? C.numberFg : stock.fg }}>
          <span className="size-1.5 shrink-0 rounded-full" style={{ background: dot }} aria-hidden="true" />
          {stock.label}
          {item.quantity !== undefined && item.stock !== "OUT_OF_STOCK" ? ` · ${item.quantity}` : ""}
        </span>
      )}
      {item.margin && <span className="shrink-0 text-[#4B5F6C]">Marge {item.margin} HT</span>}
      {item.challenge && <span className="shrink-0" style={{ color: "#B7791F" }}>★ {T.challenge}</span>}
    </span>
  );
}

/**
 * Les boîtes de la vente, en petites pastilles sous la capsule : le patient en repose une, le pharmacien la retire (✕, puis « Oui »).
 * Tant que « Vente terminée » n'est pas cliqué, chaque nouvelle boîte bipée s'ajoute ici ; une boîte retirée emporte ses conseils.
 */
/** La boîte de ce bloc, si elle est en challenge (le bloc porte le nom court de la boîte). */
function challengeOfBox(boxes: CounterIslandProps["boxes"], drug: string): { challenge?: string; reward?: string } | null {
  const box = (boxes ?? []).find((candidate) => candidate.name.trim() === drug.trim());
  return box?.challenge ? box : null;
}

/** Le challenge d'une boîte scannée (toute la gamme Olioseptil…) : doré, dès le scan, avec sa récompense. */
function BoxChallenge({ title, reward, compact }: { title: string; reward?: string; compact?: boolean }) {
  return (
    <span data-ile-challenge="" className={cn("isl-pop flex items-start gap-1.5 rounded-lg font-semibold", compact ? "mt-1 px-2 py-1 text-[11px] leading-[14px]" : "mt-1.5 px-2.5 py-1.5 text-[12px] leading-4")} style={{ background: "rgba(242,165,22,0.14)", color: C.challengeIcon }}>
      <span aria-hidden="true">★</span>
      <span className="min-w-0">
        <span className="block">{title}</span>
        {reward && <span className="block font-medium text-white/80">{reward}</span>}
      </span>
    </span>
  );
}

function BoxTray({ boxes, onRemove }: { boxes: { id: string; name: string }[]; onRemove: (id: string) => void }) {
  const [asking, setAsking] = useState<string | null>(null);
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Boîtes de la vente" data-ile-boites="">
      {boxes.map((box) =>
        asking === box.id ? (
          <li key={box.id} className="isl-pop inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pr-0.5 pl-2.5 text-[11px] font-semibold text-white" style={{ background: "rgba(229,72,77,0.22)" }}>
            <span className="truncate">Retirer {box.name} ?</span>
            <button type="button" onClick={() => { setAsking(null); onRemove(box.id); }} className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold text-white" style={{ background: "#E5484D" }}>
              Oui
            </button>
            <button type="button" onClick={() => setAsking(null)} className="shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold text-white/75 hover:text-white">
              Non
            </button>
          </li>
        ) : (
          <li key={box.id} className="isl-line inline-flex max-w-full items-center gap-1 rounded-full bg-white/[0.08] py-0.5 pr-0.5 pl-2 text-[11px] font-medium text-white/85">
            <Pill className="size-3 shrink-0" style={{ color: C.accent }} aria-hidden="true" />
            <span className="max-w-[170px] truncate" title={box.name}>{box.name}</span>
            <button type="button" onClick={() => setAsking(box.id)} aria-label={`Retirer ${box.name} de la vente`} title="Retirer de la vente (le patient l'a reposée)" className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/15 hover:text-white">
              <X className="size-3" strokeWidth={2.5} aria-hidden="true" />
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

/** Le code-barres de la boîte, balayé par le laser pendant le scan. */
function Barcode() {
  return (
    <span className="isl-barcode" aria-hidden="true">
      {[2, 1, 3, 1, 2, 1, 1, 3, 1, 2, 1, 2].map((width, index) => (
        <i key={index} style={{ width }} />
      ))}
      <b />
    </span>
  );
}

function Chip({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] font-semibold whitespace-nowrap" style={{ background: bg, color: fg }}>
      {children}
    </span>
  );
}

/** Le fond blanc sur l'ADN des bannières de fin (fondateur, 29 oct. 2026 : « le fond blanc sur toutes les bannières »). */
function LightPanel({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[22px] bg-[#EFF3F1]">
      <style>{SCAN_CSS}</style>
      <div className="pointer-events-none absolute inset-0 isolate" aria-hidden="true">
        <HelixBackdrop position="contained" framing="app" lazy className="[&_canvas]:scale-[1.6]" />
      </div>
      <div className="relative p-2">
        <div className="rounded-[18px] bg-white shadow-[0_12px_32px_-18px_rgba(15,43,38,0.55)]">{children}</div>
      </div>
    </div>
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
  // Mode compact : agrandie ou non (retenu), et le conseil choisi avec les flèches (retenu avec la liste affichée).
  const [expanded, setExpandedState] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- préférence lue après le rendu serveur
    setExpandedState(readExpanded());
  }, []);
  const setExpanded = (value: boolean) => {
    setExpandedState(value);
    saveExpanded(value);
  };
  // Le conseil choisi avec les flèches, boîte par boîte (retenu avec la liste affichée).
  const [chosen, setChosen] = useState<{ byGroup: Record<string, number>; among: string } | null>(null);
  const [asleep, setAsleep] = useState<string | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openName = unfoldedName(unfolded, items);

  // La fête du robot : seulement quand la vente se termine avec au moins un conseil vendu.
  const soldAtEnd = state.stage === "done" && items.some((_, i) => state.outcomes[i] === "SOLD");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la fête suit l'étape
    if (soldAtEnd) setCheer(Date.now());
  }, [soldAtEnd]);

  useEffect(() => {
    if (!grumpy) return;
    const id = setTimeout(() => setGrumpy(false), 3000);
    return () => clearTimeout(id);
  }, [grumpy]);

  const resting = state.stage === "idle";
  const [clicked, setClicked] = useState(false);
  const peek = resting && (props.holdPeek || (props.peekOnClick ? clicked && hover : hover && props.hoverOpen !== false)) && !grumpy;
  // Une vente terminée sans conseil vendu : un robot content, sans fête.
  const mood = grumpy ? "concerned" : state.stage === "done" && !soldAtEnd ? "happy" : STAGE_MOOD[state.stage];
  const tone = grumpy ? "warning" : stageTone(state.stage);
  // Plusieurs boîtes scannées : TOUJOURS des colonnes (même si la grande version a été choisie), sauf le temps de lire le détail
  // d'un conseil touché. Une seule boîte : compacte ou grande, au choix du pharmacien.
  const multiBox = boxGroups(items, props.boxes).length > 1;
  const compact = props.compactAdvice === true && state.stage === "advice" && count > 0 && (multiBox ? !openName : !expanded);
  // Plusieurs boîtes scannées : la bannière se divise en colonnes côte à côte (une par boîte), dans la fenêtre du poste.
  const columns = compact ? Math.min(boxGroups(items, props.boxes).length, COMPACT_MAX_GROUPS) : 1;
  // Sans geste pendant 25 s, l'île compacte se replie en capsule (« 2 conseils ») ; le survol la rouvre.
  const adviceKey = compact ? amongOf(items) : "";
  useEffect(() => {
    if (!adviceKey || hover || props.keepAwake) return;
    const id = setTimeout(() => setAsleep(adviceKey), COMPACT_SLEEP_MS);
    return () => clearTimeout(id);
  }, [adviceKey, hover, props.keepAwake]);
  const sleeping = compact && !hover && asleep === adviceKey;
  const width = grumpy ? 340 : peek ? 400 : props.collapsible && collapsedAt === state.stage && state.stage !== "idle" ? 280 : sleeping ? COMPACT_SLEEP_WIDTH : compact ? (columns > 1 ? MULTI_CAPSULE_WIDTH : COMPACT_WIDTH) : STAGE_WIDTH[state.stage];
  const title = stageTitle(state, count);
  // Le scan en animation (fondateur, 29 oct. 2026) : la capsule des essais, d'un seul tenant du scan à « N conseils ».
  const scanCapsule = Boolean(props.scanLook) && (state.stage === "scan" || state.stage === "analyzing" || state.stage === "ready");
  // La petite bannière blanche (fondateur, 29 oct. 2026) : l'attente et le scan dans la même capsule blanche sur l'ADN.
  const whiteLook = props.scanLook === "blanc";
  const whiteFound: WhiteFound[] = whiteLook
    ? items.filter((item) => !item.sheet?.routine).slice(0, 3).map((item) => ({ name: shortAdviceName(item.sheet?.name || item.name), challenge: Boolean(item.challenge), shortDate: Boolean(item.shortDate) }))
    : [];

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
  // Les blocs des boîtes, posés SOUS la capsule (plusieurs boîtes scannées) ; null sinon.
  let columnsBlock: ReactNode = null;
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
      <div data-ile-repos="" className="px-3 pt-2.5 pb-3">
        <Row
          robot={robot(30)}
          title={title}
          sub={props.movable ? "Je surveille le comptoir. Glissez-moi pour me déplacer." : "Je surveille le comptoir. Scannez une boîte pour commencer."}
          compact
          trailing={
            props.ask && pills[0] ? (
              <span data-ile-poste-connecte="" className="flex shrink-0 items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] font-semibold text-white/70" title={`${pills[0].label} : ${pills[0].value}`}>
                {pills[0].dot && <span className="size-1.5 rounded-full" style={{ background: pills[0].dot, boxShadow: `0 0 6px ${pills[0].dot}` }} />}
                {pills[0].label}
              </span>
            ) : undefined
          }
        />
        {props.ask ? <div className="mt-2.5">{props.ask}</div> : <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          {pills.map((pill) => (
            <div key={pill.key} className="rounded-2xl bg-white/[0.06] px-2.5 py-2">
              <p className="text-[10.5px] font-medium tracking-[0.04em] text-white/55 uppercase">{pill.label}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[14px] font-semibold tabular-nums">
                {pill.dot && <span className="size-1.5 rounded-full" style={{ background: pill.dot }} />}
                {pill.value}
              </p>
            </div>
          ))}
        </div>}
      </div>
    );
  } else {
    const scanPhase = props.scanLook ? ({ scan: "scan", analyzing: "analyse", ready: "found" } as const)[state.stage as "scan" | "analyzing" | "ready"] : undefined;
    if (props.scanLook && scanPhase) {
      // Les étapes de l'analyse ramenées aux quatre temps de l'animation ; trouvé, le nombre de conseils (sans la marge : fondateur, 29 oct. 2026).
      const total = analysisSteps(props.drug, count).length;
      body = whiteLook ? (
        <>
          <style>{SCAN_CSS}</style>
          <WhitePill
            phase={scanPhase}
            done={Math.round((Math.min(state.stepsDone, total) / Math.max(1, total)) * SCAN_STEPS.length)}
            drug={/lecture en cours/i.test(props.drug) ? "" : props.drug}
            found={whiteFound}
          />
        </>
      ) : (
        <>
          <style>{SCAN_CSS}</style>
          <ScanCapsule
            look={props.scanLook}
            phase={scanPhase}
            done={Math.round((Math.min(state.stepsDone, total) / Math.max(1, total)) * SCAN_STEPS.length)}
            drug={/lecture en cours/i.test(props.drug) ? "" : props.drug}
            count={count}
            margin={null}
          />
        </>
      );
    } else switch (state.stage) {
      case "idle":
        if (whiteLook) {
          body = (
            <>
              <style>{SCAN_CSS}</style>
              <WhitePill phase="idle" open={hover} />
            </>
          );
          break;
        }
        body = (
          <div data-ile-repos="" className="flex h-10 items-center gap-2 pr-3.5 pl-1.5">
            {robot(28)}
            {/* « En attente de scan… » dans la police des cartes de conseil qui suivent (fondateur, 29 oct. 2026). */}
            <span className="flex-1 whitespace-nowrap text-[14px] leading-[18px] font-bold text-white">{title}</span>
            <span className="size-2 shrink-0 rounded-full" style={{ background: C.accent, boxShadow: `0 0 8px ${C.accent}` }} aria-label="Poste connecté" />
            {props.movable && <GripVertical className="-mr-1.5 size-3.5 shrink-0 text-white/30" aria-hidden="true" />}
          </div>
        );
        break;
      case "scan":
        body = (
          <div className="relative">
            <Row robot={robot(30)} title={T.scanTitle} sub={T.scanSub} icon={<ScanLine className="size-4" style={{ color: C.glow }} aria-hidden="true" />} trailing={<Barcode />} />
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden">
              <span className="isl-scanbar block h-full w-1/3" style={{ background: `linear-gradient(90deg, transparent, ${C.glow}, transparent)` }} />
            </span>
          </div>
        );
        break;
      case "analyzing": {
        // Tant que la boîte n'est pas lue, pas de « lecture en cours… » répété : le robot dit ce qu'il fait.
        const known = !/lecture en cours/i.test(props.drug);
        const steps = analysisSteps(known ? props.drug : "", count).map((step, i) => (i === 0 && !known ? "Lecture de la boîte" : step));
        body = (
          <div className="px-3 pt-2.5 pb-3">
            <Row robot={robot(30)} title={title} sub={known ? props.drug : "Le robot lit la boîte scannée"} compact />
            {/* La barre qui avance avec les étapes, et sa lueur qui file. */}
            <div className="isl-progress mt-2.5" aria-hidden="true">
              <span style={{ width: `${Math.round(((Math.min(state.stepsDone, steps.length) + 0.5) / steps.length) * 100)}%` }} />
            </div>
            <ol className="mt-2 space-y-1 rounded-xl bg-white/[0.05] px-3 py-2 text-[12.5px] leading-[18px] font-medium">
              {/* Les trois dernières lignes seulement : l'île reste fine pendant que l'analyse se coche. */}
              {steps.slice(0, Math.min(state.stepsDone + 1, steps.length)).map((step, i) => ({ step, i })).slice(-3).map(({ step, i }) => {
                const done = i < state.stepsDone;
                return (
                  <li key={step} className="isl-line flex items-center gap-2">
                    {done ? (
                      <span className="isl-pop flex size-4 shrink-0 items-center justify-center rounded-full" style={{ background: C.accent }}>
                        <Check className="size-2.5 text-[#04261A]" strokeWidth={4} aria-hidden="true" />
                      </span>
                    ) : (
                      <span className="isl-pulse size-4 shrink-0" aria-hidden="true" />
                    )}
                    <span className={cn("truncate", done ? "text-white/85" : "isl-shimmer")}>{step}</span>
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
        if (count === 0 && (props.boxes ?? []).some((box) => box.challenge)) {
          const challenged = (props.boxes ?? []).filter((box) => box.challenge);
          body = (
            <div className="px-3 pt-2.5 pb-3" data-ile-challenge-seul="">
              <div className="flex items-center gap-2.5">
                {robot(32)}
                <p className="min-w-0 flex-1 text-[15px] leading-5 font-bold" style={{ color: C.challengeIcon }} aria-live="polite">
                  {challenged.length > 1 ? `${challenged.length} produits en challenge` : "Produit en challenge"}
                </p>
              </div>
              {challenged.map((box) => (
                <div key={box.id} className="mt-1.5">
                  <p className="truncate px-0.5 text-[11.5px] font-semibold text-white/60">{box.name}</p>
                  <BoxChallenge title={box.challenge as string} reward={box.reward} />
                </div>
              ))}
              {props.boxes && props.boxes.length > 0 && props.onRemoveBox && <BoxTray boxes={props.boxes} onRemove={props.onRemoveBox} />}
              <button type="button" onClick={props.onFinish} className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-bold transition-[filter] hover:brightness-110" style={{ background: C.accent, color: "#04261A" }}>
                <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> {props.finishLabel ?? T.finish}
              </button>
            </div>
          );
          break;
        }
        if (sleeping) {
          body = (
            <div className="flex h-10 items-center gap-2 pr-3 pl-1.5">
              {robot(26)}
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-white/90">
                {allAnswered(state, count) ? T.allDone : count > 1 ? T.reducedMany.replace("{n}", String(count)) : T.reducedOne}
              </span>
              <span className="isl-pop rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: C.accent, color: "#04261A" }}>{count}</span>
            </div>
          );
          break;
        }
        if (compact) {
          const among = amongOf(items);
          // Un bloc par boîte scannée : chaque boîte montre SON conseil (le premier qui attend une réponse), ses flèches
          // parcourent les siens. Plusieurs boîtes, plusieurs blocs — la bannière se divise au lieu de tout empiler.
          const groups = boxGroups(items, props.boxes);
          const picked = chosen && chosen.among === among ? chosen.byGroup : {};
          const shownGroups = groups.slice(0, COMPACT_MAX_GROUPS);
          // Deux boîtes ou plus : un BLOC par boîte, côte à côte, chacun à sa hauteur (plus de fond noir vide sous une boîte
          // qui a moins de conseils) — en titre le médicament, bien lisible, en dessous le ou les conseils qui en découlent.
          if (shownGroups.length > 1) {
            columnsBlock = (
              <div
                className="flex items-start gap-2"
                style={{ width: `min(${COLUMNS_WIDTH[shownGroups.length]}px, calc(100vw - 24px))` }}
                onPointerEnter={() => {
                  if (leaveTimer.current) clearTimeout(leaveTimer.current);
                  setHover(true);
                }}
                onPointerLeave={() => {
                  leaveTimer.current = setTimeout(() => setHover(false), 350);
                }}
              >
                {shownGroups.map((group) => (
                  <section
                    key={group.drug || "-"}
                    data-advice-group=""
                    aria-label={`Conseils pour ${group.drug || props.drug}`}
                    className="isl-in min-w-0 flex-1 overflow-hidden rounded-[20px] p-2 text-white"
                    style={{ background: C.bg, boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 18px 40px -14px rgba(0,0,0,0.55)" }}
                  >
                    <div className="flex items-start gap-2 px-1 pt-0.5 pb-1.5">
                      <span className="mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-full" style={{ background: C.number, color: C.accent }}>
                        <Pill className="size-3.5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-[12.5px] leading-4 font-bold tracking-tight text-white" title={group.drug || props.drug}>
                          {group.drug || props.drug}
                        </span>
                        <span className="block text-[10.5px] leading-4 font-medium" style={{ color: group.indexes.length ? C.accent : "rgba(255,255,255,0.5)" }}>
                          {group.indexes.length > 1 ? `${group.indexes.length} conseils` : group.indexes.length === 1 ? "1 conseil" : "Aucun conseil"}
                        </span>
                        {challengeOfBox(props.boxes, group.drug) && <BoxChallenge compact title={challengeOfBox(props.boxes, group.drug)!.challenge as string} reward={challengeOfBox(props.boxes, group.drug)!.reward} />}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {group.indexes.map((index) => (
                        <ColumnCard
                          key={`${among}#${index}`}
                          item={items[index]}
                          outcome={state.outcomes[index] ?? null}
                          readOnly={props.readOnly}
                          auto={props.autoOutcome}
                          onAnswer={(outcome) => props.onAnswer(index, outcome)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            );
          }
          body = (
            <div className="px-2 pt-1.5 pb-2">
              <div className="flex items-center gap-1.5">
                {robot(22)}
                <p className="min-w-0 flex-1 truncate text-[12.5px] leading-4 font-semibold" aria-live="polite">
                  {allAnswered(state, count) ? T.allDone : count > 1 ? T.reducedMany.replace("{n}", String(count)) : T.reducedOne}
                  {groups.length > 1 && <span className="font-normal text-white/50"> · {groups.length} boîtes</span>}
                </p>
                {!allAnswered(state, count) && (
                  <button type="button" onClick={props.onFinish} aria-label={props.finishLabel ?? T.finish} title={props.finishLabel ?? T.finish} className="inline-flex size-6 shrink-0 items-center justify-center rounded-full transition-[filter] hover:brightness-110" style={{ background: C.accent, color: "#04261A" }}>
                    <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                  </button>
                )}
                {!multiBox && <button type="button" onClick={() => setExpanded(true)} aria-label="Agrandir la bannière" title="Agrandir la bannière" className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/[0.1] hover:text-white">
                  <Maximize2 className="size-3.5" aria-hidden="true" />
                </button>}
              </div>
              {props.boxes && props.boxes.length > 0 && props.onRemoveBox && <BoxTray boxes={props.boxes} onRemove={props.onRemoveBox} />}
              {shownGroups.length > 1 ? null : (
                shownGroups.map((group) => {
                const local = compactIndex(group.indexes.map((at) => state.outcomes[at]), group.indexes.length, picked[group.drug] ?? null);
                const index = group.indexes[local];
                const go = (next: number) => setChosen({ among, byGroup: { ...picked, [group.drug]: (next + group.indexes.length) % group.indexes.length } });
                return (
                  <div key={group.drug || "-"} data-advice-group="" className="mt-1.5">
                    <div className="flex h-4 items-center gap-1 px-1 text-[10.5px] font-semibold text-white/55">
                      <span className="min-w-0 flex-1 truncate">{group.drug ? `${T.forDrug}${group.drug}` : props.drug}</span>
                      {group.indexes.length > 1 && (
                        <span className="flex shrink-0 items-center">
                          <button type="button" onClick={() => go(local - 1)} aria-label="Conseil précédent" className="inline-flex size-4 items-center justify-center rounded-full hover:bg-white/[0.1] hover:text-white">
                            <ChevronLeft className="size-3" aria-hidden="true" />
                          </button>
                          <span className="tabular-nums">{local + 1}/{group.indexes.length}</span>
                          <button type="button" onClick={() => go(local + 1)} aria-label="Conseil suivant" className="inline-flex size-4 items-center justify-center rounded-full hover:bg-white/[0.1] hover:text-white">
                            <ChevronRight className="size-3" aria-hidden="true" />
                          </button>
                        </span>
                      )}
                    </div>
                    {challengeOfBox(props.boxes, group.drug) && <BoxChallenge compact title={challengeOfBox(props.boxes, group.drug)!.challenge as string} reward={challengeOfBox(props.boxes, group.drug)!.reward} />}
                    <CompactCard
                      key={`${among}#${index}`}
                      item={items[index]}
                      outcome={state.outcomes[index] ?? null}
                      readOnly={props.readOnly}
                      auto={props.autoOutcome}
                      onOpen={() => {
                        setUnfolded({ name: items[index].name, among });
                        setExpanded(true);
                      }}
                      onAnswer={(outcome) => {
                        const rest = { ...picked };
                        delete rest[group.drug];
                        setChosen({ among, byGroup: rest });
                        props.onAnswer(index, outcome);
                      }}
                    />
                  </div>
                );
              })
              )}
              {groups.length > COMPACT_MAX_GROUPS && (
                <button type="button" onClick={() => setExpanded(true)} className="mt-1.5 w-full text-center text-[11px] font-semibold text-white/60 hover:text-white">
                  + {groups.length - COMPACT_MAX_GROUPS} autre{groups.length - COMPACT_MAX_GROUPS > 1 ? "s" : ""} boîte{groups.length - COMPACT_MAX_GROUPS > 1 ? "s" : ""} — agrandir
                </button>
              )}
              {allAnswered(state, count) && (
                <button type="button" onClick={props.onFinish} className="isl-pop mt-1.5 inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-bold transition-[filter] hover:brightness-110" style={{ background: C.accent, color: "#04261A" }}>
                  <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> {props.finishLabel ?? T.finish}
                </button>
              )}
            </div>
          );
          break;
        }
        body = (
          <div className="px-2 pt-2 pb-2">
            <Row
              robot={robot(24)}
              title={title}
              sub={allAnswered(state, count) ? T.allDone : `${T.forDrug}${props.drug}`}
              compact
              trailing={
                props.compactAdvice ? (
                  <button type="button" onClick={() => { setExpanded(false); setUnfolded(null); }} aria-label="Réduire la bannière" title="Réduire la bannière" className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/[0.1] hover:text-white">
                    <Minimize2 className="size-3.5" aria-hidden="true" />
                  </button>
                ) : undefined
              }
            />
            <AdviceList maxHeight={props.listMaxHeight ?? ADVICE_LIST_MAX_HEIGHT} count={count} unfolded={openName}>
              {items.map((item, index) => [
                // Plusieurs boîtes scannées : un intitulé « Pour : … » avant les conseils de chaque boîte.
                groupByDrug(items).length > 1 && item.drug && items.findIndex((other) => (other.drug?.trim() || "") === (item.drug?.trim() || "")) === index ? (
                  <li key={`boite-${item.drug}`} data-advice-group="" className="truncate px-1 pt-1 text-[10.5px] font-semibold text-white/55">
                    {T.forDrug}
                    {item.drug}
                  </li>
                ) : null,
                <AdviceCard
                  key={item.name}
                  item={item}
                  outcome={state.outcomes[index] ?? null}
                  readOnly={props.readOnly}
                  outside={props.adviceLinksOutside}
                  open={openName === item.name}
                  onToggle={() => setUnfolded(toggleAdvice(unfolded, items, item.name))}
                  onOpen={() => props.onOpenAdvice?.(index)}
                  auto={props.autoOutcome}
                  onAnswer={(outcome) => props.onAnswer(index, outcome)}
                />,
              ])}
            </AdviceList>
            <div className="mt-1.5 flex items-center gap-1.5">
              {props.emailEnabled !== false && <button type="button" onClick={props.onAddEmail} className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/[0.08] text-[11.5px] font-semibold text-white/90 transition-colors hover:bg-white/[0.14] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#36E8C8]">
                <Mail className="size-3.5" aria-hidden="true" /> {T.emailAdd}
              </button>}
              <button type="button" onClick={props.onFinish} className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-bold transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#36E8C8]" style={{ background: C.accent, color: "#04261A" }}>
                <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> {props.finishLabel ?? T.finish}
              </button>
            </div>
          </div>
        );
        break;
      case "email":
        if (props.compactEnd) {
          // Fin 3 (fondateur, 29 oct. 2026) : une ligne — l'adresse, Envoyer, Passer —, le compte à rebours dessous.
          const skip = props.onFinishWithoutEmail ?? props.onCloseEmail;
          body = (
            <LightPanel>
            <div className="px-3 py-2.5" data-ile-fin="compacte">
              <div className="flex items-center gap-2">
                <Mail className="size-4 shrink-0 text-[#0E8A7B]" aria-hidden="true" />
                <p className="flex-1 text-[12.5px] font-bold text-[#0F2B26]">Bilan par e-mail</p>
                {props.emailCountdown && <span className="text-[11px] text-[#5B6B66] tabular-nums">{props.emailCountdown.seconds} s</span>}
              </div>
              <form
                className="mt-1.5 flex items-center gap-1.5"
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
                  placeholder="e-mail du patient"
                  className="h-8 min-w-0 flex-1 rounded-full border border-[#D5E3DD] bg-[#F6F9F8] px-3 text-[12.5px] text-[#0F2B26] placeholder:text-[#8FA39C] focus:border-[#0E8A7B] focus:outline-none"
                />
                <button type="submit" aria-label="Envoyer" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#0E8A7B] text-white">
                  <Send className="size-3.5" aria-hidden="true" />
                </button>
                {skip && (
                  <button type="button" onClick={skip} data-ile-sans-email="" className="h-8 shrink-0 rounded-full px-2.5 text-[11.5px] font-semibold text-[#5B6B66] hover:text-[#0F2B26]">
                    Passer
                  </button>
                )}
              </form>
              {props.emailCountdown && (
                <span className="mt-2 block h-1 overflow-hidden rounded-full bg-[#E3EBE8]">
                  <span className="block h-full rounded-full bg-[#0E8A7B]" style={{ width: `${Math.round(props.emailCountdown.ratio * 100)}%`, transition: "width 250ms linear" }} />
                </span>
              )}
            </div>
            </LightPanel>
          );
          break;
        }
        // Compacte (fondateur, 26 oct. 2026) : une ligne de titre, le champ, « Terminer sans e-mail » en petit — LGPI reste visible.
        body = (
          <div className="px-2.5 pt-2 pb-2">
            <div className="flex items-center gap-2">
              {robot(22)}
              <p className="min-w-0 flex-1 truncate text-[12.5px] leading-[16px] font-bold text-white" title="Le patient reçoit ses conseils, vos coordonnées et, pour une cure, un rappel avant la fin.">
                {props.onFinishWithoutEmail ? "Le bilan au patient ?" : "Bilan conseil par e-mail"}
              </p>
            </div>
            <form
              className="mt-1.5 flex items-center gap-1.5"
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
                placeholder="e-mail du patient"
                className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.06] px-2.5 text-[12.5px] text-white placeholder:text-white/35 focus:border-[#36E8C8] focus:outline-none"
              />
              <button type="submit" aria-label={props.onFinishWithoutEmail ? "Envoyer et terminer" : "Envoyer"} className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-bold" style={{ background: C.accent, color: "#04261A" }}>
                <Send className="size-3.5" aria-hidden="true" /> Envoyer
              </button>
              {props.onCloseEmail && (
                <button type="button" onClick={props.onCloseEmail} aria-label="Annuler l'e-mail" title="Annuler" className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-white/80 hover:bg-white/[0.14] hover:text-white">
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              )}
            </form>
            {props.onFinishWithoutEmail && (
              <button type="button" onClick={props.onFinishWithoutEmail} data-ile-sans-email="" className="mt-1.5 inline-flex h-6 w-full items-center justify-center gap-1 rounded-md text-[11.5px] font-semibold text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white">
                <Check className="size-3" strokeWidth={3} aria-hidden="true" /> Terminer sans e-mail
              </button>
            )}
          </div>
        );
        break;
      case "emailSent":
        body = <Row robot={robot(30)} title="E-mail envoyé" sub={state.email || "Le bilan est parti."} trailing={<span className="isl-pop flex size-7 items-center justify-center rounded-full" style={{ background: C.accent }}><Check className="size-4 text-[#04261A]" strokeWidth={3} aria-hidden="true" /></span>} />;
        break;
      case "done": {
        const sold = items.filter((_, i) => state.outcomes[i] === "SOLD");
        if (props.compactEnd && sold.length) {
          // Fin 3 (fondateur, 29 oct. 2026) : le Bravo et la marge gagnée, puis « Qui a servi ce patient ? » dans la même capsule.
          const gained = possibleMargin(sold);
          const served = props.served;
          body = (
            <LightPanel>
            <div className="px-3 py-2.5" data-ile-fete="" data-ile-fin="compacte">
              <div className="flex items-center gap-2.5">
                <span className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#0E8A7B]">
                  <Trophy className="size-5 text-white" aria-hidden="true" />
                  <span className="isl-burst" aria-hidden="true">
                    {BURST_PIECES.map((piece, index) => (
                      <i key={`${cheer}-${index}`} style={{ "--a": `${piece.angle}deg`, "--d": `${piece.distance}px`, "--c": piece.color, animationDelay: `${piece.delay}ms` } as CSSProperties} />
                    ))}
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="isl-pop text-[16px] leading-5 font-bold text-[#0F2B26]" aria-live="polite">
                    Bravo !{gained > 0 && <span className="text-[#0E8A7B]"> +{eurosOf(gained)}</span>}
                  </p>
                  <p className="text-[11.5px] text-[#5B6B66]">
                    {served?.done ? `Vente comptée pour ${served.team.find((member) => member.id === served.chosen)?.name ?? "le comptoir"}` : served?.team.length ? "Qui a servi ce patient ?" : T.doneTitle}
                  </p>
                </div>
              </div>
              {served && served.team.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5" data-ile-servi="" data-ile-sans-deploiement="">
                  {served.team.map((member) => {
                    const chosen = served.chosen === member.id;
                    return (
                      <button
                        key={member.id}
                        type="button"
                        data-ile-servi-personne={member.id}
                        aria-pressed={chosen}
                        onClick={() => served.onPick(member.id)}
                        className={`inline-flex h-7 items-center gap-1 rounded-full px-3 text-[12px] font-semibold ${chosen ? "bg-[#0E8A7B] text-white" : "border border-[#D5E3DD] text-[#0F2B26] hover:border-[#0E8A7B]"}`}
                      >
                        {chosen && <Check className="size-3" strokeWidth={3} aria-hidden="true" />}
                        {member.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            </LightPanel>
          );
          break;
        }
        const soldLine = `${sold.length} conseil${sold.length > 1 ? "s" : ""} vendu${sold.length > 1 ? "s" : ""}${sold[0]?.price ? ` · ${sold.map((item) => item.price).filter(Boolean).join(" + ")}` : ""}`;
        body = sold.length ? (
          // Au moins un conseil vendu : le robot en blouse, plus grand, saute et lance ses confettis — « Bravo ! ».
          <div className="flex items-center gap-3 px-3 py-2" data-ile-fete="">
            <span className="isl-cheer relative shrink-0">
              {robot(60)}
              <span className="isl-burst" aria-hidden="true">
                {BURST_PIECES.map((piece, index) => (
                  <i key={`${cheer}-${index}`} style={{ "--a": `${piece.angle}deg`, "--d": `${piece.distance}px`, "--c": piece.color, animationDelay: `${piece.delay}ms` } as CSSProperties} />
                ))}
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="isl-pop text-[17px] leading-[22px] font-bold" style={{ color: C.challengeIcon }} aria-live="polite">Bravo !</p>
              <p className="truncate text-[12.5px] leading-[18px] text-white/80">{soldLine}</p>
              <p className="text-[11.5px] leading-4 text-white/55">{T.doneTitle}</p>
            </div>
            <PartyPopper className="isl-pop size-6 shrink-0" style={{ color: C.challengeIcon }} aria-hidden="true" />
          </div>
        ) : (
          <Row robot={robot(32)} title={T.doneTitle} sub="Merci, à la prochaine vente." />
        );
        break;
      }
      case "alert": {
        const parts = (props.alertItems?.length ? props.alertItems : alert?.text ? [alert.text] : []).map(splitAlert);
        body = (
          <div className="px-3 pt-2.5 pb-3">
            {/* Plus de « À lire avant de conseiller » (fondateur, 29 oct. 2026) : la mise en garde elle-même reste, sous « Pendant la vente ». */}
            <Row robot={robot(30)} title={T.duringSale} sub={parts.length > 1 ? `${parts.length} points` : ""} compact icon={<TriangleAlert className="size-4 text-white/60" aria-hidden="true" />} />
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
      data-isl=""
      className={columnsBlock ? "flex flex-col items-center gap-2" : undefined}
      onClick={(event) => {
        // Appuyer sur une carte de conseil la déploie : ce n'est pas taquiner le robot.
        if (!(event.target as Element).closest("button, input, form, a, [data-advice-card]")) {
          if (props.peekOnClick && resting) setClicked((open) => !open);
          onTap();
        }
      }}
    >
      <IslandShell
        width={whiteLook && resting && !peek && !grumpy ? (hover ? 330 : WHITE_PILL_WIDTH) : whiteLook && scanCapsule ? (state.stage === "ready" ? whiteFoundWidth(whiteFound) : WHITE_PILL_WIDTH) : scanCapsule ? 340 : width}
        tone={tone}
        className={whiteLook && ((resting && !peek && !grumpy) || scanCapsule) ? "crd-white" : scanCapsule ? "crd-glass crd-cap-in" : props.compactEnd && (state.stage === "email" || (state.stage === "done" && state.outcomes.some((outcome) => outcome === "SOLD"))) ? "crd-light" : undefined}
        contentKey={whiteLook && resting && !peek && !grumpy ? "attente-blanche" : scanCapsule ? "scan-capsule" : grumpy ? "grumpy" : peek ? "peek" : collapsed ? `${state.stage}-replie` : sleeping ? "advice-capsule" : compact ? "advice-compact" : state.stage}
        label="Bannière PharmaBoost du comptoir"
        onPointerEnter={() => {
          if (leaveTimer.current) clearTimeout(leaveTimer.current);
          setHover(true);
        }}
        onPointerLeave={() => {
          leaveTimer.current = setTimeout(() => {
            setHover(false);
            setClicked(false);
          }, 350);
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
      {columnsBlock}
    </div>
  );
}

/**
 * LE MENU DÉROULANT DU CONSEIL (18 oct. 2026, d'après Kontoir) : au survol d'un conseil, sans cliquer — le nom du produit, puis
 * Prix / Marge / Stock en trois cases, deux questions à poser au patient et le conseil en deux phrases. Le pharmacien garde son
 * déroulé à lui : ce sont des appuis, pas un script. Sans questions ni conseil (pas encore rédigés), seulement les chiffres.
 */
export function PitchPanel({ item }: { item: IslandAdvice }) {
  const stock = item.stock ? STOCK[item.stock] : null;
  const ask = item.sheet?.ask ?? [];
  const pitch = item.sheet?.pitch;
  const answers = item.sheet?.answers ?? [];
  const [picked, setPicked] = useState<Record<number, number>>({});
  const cells: { label: string; value: string; color?: string }[] = [
    { label: "Prix", value: item.price && item.stock !== "UNKNOWN" ? item.price : "—" },
    { label: "Marge HT", value: item.margin ?? "—" },
    { label: "Stock", value: !stock || item.stock === "UNKNOWN" ? "—" : item.stock === "OUT_OF_STOCK" ? "Rupture" : item.quantity !== undefined ? String(item.quantity) : stock.label, color: item.stock === "OUT_OF_STOCK" ? C.outFg : item.stock === "LOW_STOCK" ? C.lowFg : undefined },
  ];
  return (
    <div data-pitch-panel="" className="isl-pop mt-1.5 space-y-2 border-t pt-2 text-[11.5px] leading-4" style={{ borderColor: C.line, color: C.ink }}>
      <p className="text-[12px] leading-4 font-bold break-words">{item.sheet?.name || item.name}</p>
      <div className="grid grid-cols-3 gap-1">
        {cells.map((cell) => (
          <div key={cell.label} className="rounded-md px-1.5 py-1 text-center" style={{ background: C.cell }}>
            <p className="text-[9.5px] font-bold tracking-[0.04em] uppercase" style={{ color: C.inkSoft }}>{cell.label}</p>
            <p className="truncate text-[12.5px] leading-4 font-bold tabular-nums" style={{ color: cell.color ?? C.ink }}>{cell.value}</p>
          </div>
        ))}
      </div>
      {(item.challenge || item.shortDate) && (
        <div className="flex flex-wrap gap-1">
          {item.challenge && <Chip bg={C.challengeBg} fg={C.challengeFg}>★ {T.challenge}</Chip>}
          {item.shortDate && <Chip bg={C.dateBg} fg={C.dateFg}>{T.shortDate} {item.shortDate}</Chip>}
        </div>
      )}
      {ask.length > 0 && (
        <div>
          <p className="text-[9.5px] font-bold tracking-[0.04em] uppercase" style={{ color: C.inkSoft }}>À demander{answers.length > 0 ? " · touchez la réponse du patient" : ""}</p>
          <ol className="mt-0.5 space-y-1">
            {ask.map((question, index) => {
              const choices = answers.filter((answer) => answer.ask === index);
              const chosen = picked[index] !== undefined ? choices[picked[index]] : undefined;
              return (
                <li key={question} data-pitch-question="" className="break-words">
                  <span className="flex gap-1.5">
                    <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[9.5px] font-bold" style={{ background: C.number, color: C.numberFg }}>{index + 1}</span>
                    <span className="font-semibold">{question}</span>
                  </span>
                  {choices.length > 0 && (
                    <span className="mt-1 ml-5.5 flex flex-wrap gap-1">
                      {choices.map((choice, at) => (
                        <button
                          key={choice.label}
                          type="button"
                          data-pitch-answer=""
                          aria-pressed={picked[index] === at}
                          onClick={() => setPicked((current) => {
                            const next = { ...current };
                            if (next[index] === at) delete next[index];
                            else next[index] = at;
                            return next;
                          })}
                          className="h-6 rounded-full border px-2 text-[11px] font-semibold transition-colors"
                          style={picked[index] === at ? { background: C.pick, borderColor: C.pick, color: "#FFFFFF" } : { background: "#FFFFFF", borderColor: C.pickLine, color: C.ink }}
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
        </div>
      )}
      {pitch && (
        <div>
          <p className="text-[9.5px] font-bold tracking-[0.04em] uppercase" style={{ color: C.inkSoft }}>Le conseil</p>
          <p className="mt-0.5 break-words">{pitch}</p>
        </div>
      )}
    </div>
  );
}

/** Le produit plus précis d'une réponse : son nom, puis prix, marge et stock de la pharmacie (le prix seulement avec un stock fiable). */
export function AnswerProduct({ product }: { product: NonNullable<NonNullable<CounterSheet["answers"]>[number]["product"]> }) {
  const stock = product.stock && product.stock in STOCK ? STOCK[product.stock as keyof typeof STOCK] : null;
  return (
    <span data-pitch-product="" className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md bg-white px-1.5 py-1">
      <span className="w-full text-[10px] font-bold tracking-[0.04em] uppercase" style={{ color: C.numberFg }}>Proposer plutôt</span>
      <span className="min-w-0 flex-1 truncate font-bold">{product.name}</span>
      {product.price && <span className="shrink-0 font-bold tabular-nums">{product.price}</span>}
      <span className="flex w-full flex-wrap gap-x-2 text-[10.5px] font-semibold">
        {product.margin && <span style={{ color: "#4B5F6C" }}>Marge {product.margin} HT</span>}
        {stock && <span style={{ color: product.stock === "IN_STOCK" ? C.numberFg : stock.fg }}>{stock.label}{product.quantity !== undefined && product.stock !== "OUT_OF_STOCK" ? ` · ${product.quantity}` : ""}</span>}
      </span>
    </span>
  );
}

/** Le survol d'un conseil, avec un court délai : passer la souris d'un bord à l'autre de l'île n'ouvre rien. */
function useHoverOpen(delay = 180, initial = false): [boolean, { onMouseEnter: () => void; onMouseLeave: () => void }] {
  const [open, setOpen] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return [
    open,
    {
      onMouseEnter: () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setOpen(true), delay);
      },
      onMouseLeave: () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setOpen(false), 250);
      },
    },
  ];
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

/**
 * Le conseil en mode compact : une ligne — photo studio, nom, prix, et dessous marge et stock en petit — et les deux
 * boutons ✓ / ✕. Un appui sur la carte agrandit la bannière, ce conseil déployé.
 */
function CompactCard({ item, outcome, readOnly, auto, onOpen, onAnswer }: { item: IslandAdvice; outcome: IslandOutcome; readOnly?: boolean; auto?: boolean; onOpen: () => void; onAnswer: (outcome: IslandOutcome) => void }) {
  const stock = item.stock ? STOCK[item.stock] : null;
  const details = [
    item.margin ? `Marge ${item.margin} HT` : null,
    stock ? `${stock.label}${item.quantity !== undefined && item.stock !== "OUT_OF_STOCK" ? ` · ${item.quantity}` : ""}` : null,
    item.challenge ? `★ ${T.challenge}` : null,
    item.shortDate ? `${T.shortDate} ${item.shortDate.replace(/\/\d{4}$/, "")}` : null,
  ].filter(Boolean);
  const [hovered, hoverProps] = useHoverOpen(180, item.pitchOpen === true);
  return (
    <div data-advice-card="" className="isl-line mt-0.5 rounded-lg px-2 py-1.5" style={{ background: C.panel, color: C.ink }} {...hoverProps}>
    <div className="flex items-center gap-2">
      <button type="button" onClick={onOpen} title={UNFOLD} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {item.image && (
          // eslint-disable-next-line @next/next/no-img-element -- vignette locale déjà à la bonne taille
          <img src={item.image} alt="" width={28} height={28} draggable={false} className="size-7 shrink-0 rounded-md bg-white object-contain" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[12px] leading-4 font-bold">{item.name}</span>
            {item.price && stock && item.stock !== "UNKNOWN" && <span className="shrink-0 text-[11.5px] leading-4 font-bold tabular-nums">{item.price}</span>}
          </span>
          {details.length > 0 && (
            <span className="block">
              <AdviceMeta item={{ ...item, price: undefined }} small />
            </span>
          )}
        </span>
      </button>
      {auto ? (
        <AutoStatus outcome={outcome} />
      ) : readOnly && !outcome ? null : outcome ? (
        <button type="button" onClick={() => !readOnly && onAnswer(null)} title={readOnly ? undefined : T.change} className="isl-pop inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-bold" style={outcome === "SOLD" ? { background: C.soldBg, color: C.soldFg } : { background: C.notSoldBg, color: C.notSoldFg }}>
          {outcome === "SOLD" && <Check className="size-3" strokeWidth={3} aria-hidden="true" />}
          {outcome === "SOLD" ? T.sold : T.notSold}
        </button>
      ) : (
        <span className="flex shrink-0 gap-1">
          <button type="button" onClick={() => onAnswer("SOLD")} aria-label={T.sold} title={T.sold} className="inline-flex h-6 w-8 items-center justify-center rounded-md transition-[filter] hover:brightness-105" style={{ background: C.soldBg, color: C.soldFg }}>
            <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => onAnswer("NOT_SOLD")} aria-label={T.notSold} title={T.notSold} className="inline-flex h-6 w-8 items-center justify-center rounded-md border bg-white transition-colors hover:bg-[#F1F5F7]" style={{ borderColor: "#C9D5DC", color: C.notSoldFg }}>
            <X className="size-3.5" strokeWidth={3} aria-hidden="true" />
          </button>
        </span>
      )}
    </div>
      {hovered && <PitchPanel item={item} />}
    </div>
  );
}

/**
 * Un conseil dans une colonne (plusieurs boîtes côte à côte) : le nom sur deux lignes, prix et stock en petit, puis ✓ / ✕
 * sur toute la largeur. Au survol, le menu du conseil se déroule dans la carte.
 */
function ColumnCard({ item, outcome, readOnly, auto, onAnswer }: { item: IslandAdvice; outcome: IslandOutcome; readOnly?: boolean; auto?: boolean; onAnswer: (outcome: IslandOutcome) => void }) {
  const stock = item.stock ? STOCK[item.stock] : null;
  const details = [
    item.price && stock && item.stock !== "UNKNOWN" ? item.price : null,
    item.margin ? `Marge ${item.margin}` : null,
    stock ? `${stock.label}${item.quantity !== undefined && item.stock !== "OUT_OF_STOCK" ? ` · ${item.quantity}` : ""}` : null,
    item.challenge ? `★ ${T.challenge}` : null,
  ].filter(Boolean);
  // Le menu déroulant (prix, marge, stock, questions, conseil) au survol, DANS la carte, comme une seule boîte : la bannière
  // ne change jamais de forme sous la souris (POSTE de Docteur Nicolas, 19 oct. 2026 : un appui basculait vers une autre vue,
  // qui se repliait aussitôt). Un appui garde le menu ouvert, un second le referme.
  const [hovered, hoverProps] = useHoverOpen(180, item.pitchOpen === true);
  const [pinned, setPinned] = useState(false);
  return (
    <div data-advice-card="" className="isl-line rounded-lg px-1.5 py-1.5" style={{ background: C.panel, color: C.ink }} {...hoverProps}>
      <button type="button" onClick={() => setPinned((value) => !value)} aria-expanded={hovered || pinned} title={UNFOLD} className="flex w-full min-w-0 items-start gap-1.5 text-left">
        {item.image && (
          // eslint-disable-next-line @next/next/no-img-element -- vignette locale déjà à la bonne taille
          <img src={item.image} alt="" width={26} height={26} draggable={false} className="size-[26px] shrink-0 rounded-md bg-white object-contain" />
        )}
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[11.5px] leading-[14px] font-bold break-words">{item.name}</span>
          {details.length > 0 && <span className="mt-0.5 block"><AdviceMeta item={item} small /></span>}
        </span>
      </button>
      <div className="mt-1 flex gap-1">
        {auto ? (
          <AutoStatus outcome={outcome} wide />
        ) : readOnly && !outcome ? null : outcome ? (
          <button type="button" onClick={() => !readOnly && onAnswer(null)} title={readOnly ? undefined : T.change} className="isl-pop inline-flex h-6 flex-1 items-center justify-center gap-1 rounded-md text-[11px] font-bold" style={outcome === "SOLD" ? { background: C.soldBg, color: C.soldFg } : { background: C.notSoldBg, color: C.notSoldFg }}>
            {outcome === "SOLD" && <Check className="size-3" strokeWidth={3} aria-hidden="true" />}
            {outcome === "SOLD" ? T.sold : T.notSold}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => onAnswer("SOLD")} aria-label={T.sold} title={T.sold} className="inline-flex h-6 flex-1 items-center justify-center gap-1 rounded-md text-[11px] font-bold transition-[filter] hover:brightness-105" style={{ background: C.soldBg, color: C.soldFg }}>
              <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
              {T.sold}
            </button>
            <button type="button" onClick={() => onAnswer("NOT_SOLD")} aria-label={T.notSold} title={T.notSold} className="inline-flex h-6 flex-1 items-center justify-center gap-1 rounded-md border bg-white text-[11px] font-bold transition-colors hover:bg-[#F1F5F7]" style={{ borderColor: "#C9D5DC", color: C.notSoldFg }}>
              <X className="size-3.5" strokeWidth={3} aria-hidden="true" />
              {T.notSold}
            </button>
          </>
        )}
      </div>
      {(hovered || pinned) && <PitchPanel item={item} />}
    </div>
  );
}

/** L'état d'un conseil au poste, sans bouton : « À proposer » tant qu'il n'est pas bipé, puis « ✓ Vendu » (ou « Non vendu »). */
function AutoStatus({ outcome, wide = false }: { outcome: IslandOutcome; wide?: boolean }) {
  const base = cn("inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-md px-2 text-[11px] font-bold", wide && "flex-1");
  if (outcome === "SOLD") {
    return (
      <span data-auto-status="SOLD" className={cn(base, "isl-pop")} style={{ background: C.soldBg, color: C.soldFg }}>
        <Check className="size-3" strokeWidth={3} aria-hidden="true" />
        {T.sold}
      </span>
    );
  }
  if (outcome === "NOT_SOLD") return <span data-auto-status="NOT_SOLD" className={base} style={{ background: C.notSoldBg, color: C.notSoldFg }}>{T.notSold}</span>;
  return (
    <span data-auto-status="NONE" title="Bipez-le : il passe en vendu tout seul" className={cn(base, "font-semibold")} style={{ background: C.line, color: C.inkSoft }}>
      À proposer
    </span>
  );
}

/** Ce que disent la carte repliée et la carte déployée (survol, lecteur d'écran). */
const UNFOLD = "Appuyer pour déployer le conseil : contre-indications, conseils d'utilisation";
const FOLD = "Appuyer pour replier le conseil";
/** La carte déployée sans fiche (serveur plus ancien) : le détail se lit dans la fiche complète. */
const IN_FULL_SHEET = "À lire dans la fiche complète.";

export function AdviceCard({ item, outcome, onAnswer, readOnly, auto, outside, open, onToggle, onOpen }: { item: IslandAdvice; outcome: IslandOutcome; onAnswer: (outcome: IslandOutcome) => void; readOnly?: boolean; auto?: boolean; outside?: boolean; open: boolean; onToggle: () => void; onOpen?: () => void }) {
  const stock = item.stock ? STOCK[item.stock] : null;
  const press = useRef<{ x: number; y: number } | null>(null);
  const detailsId = useId();
  const [hovered, hoverProps] = useHoverOpen(180, item.pitchOpen === true);
  // Repliée, la carte est COMPACTE (retour des pharmacies, 13 oct. 2026 : la bannière prenait trop de place pendant une
  // délivrance) : le nom et la raison sur UNE ligne chacun, puis les étiquettes et Vendu / Non vendu sur la même ligne.
  // Déployée, le nom COMPLET et la raison entière passent dans le détail.
  const name = (open && item.sheet?.name) || item.name;
  const summary = (
    <>
      {/* Seulement une photo studio (fond uni, la même pour tous) ; sans elle, rien : ni carré vide, ni photo d'amateur. */}
      {item.image && (
        // eslint-disable-next-line @next/next/no-img-element -- vignette locale déjà à la bonne taille
        <img src={item.image} alt="" width={34} height={34} draggable={false} className="size-[34px] shrink-0 rounded-md bg-white object-contain" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-[12.5px] leading-4 font-bold break-words", !open && "truncate")}>{name}</p>
          <span className="flex shrink-0 items-center gap-1">
            {item.price && stock && item.stock !== "UNKNOWN" && <span className="text-[12px] leading-4 font-bold tabular-nums">{item.price}</span>}
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} style={{ color: C.inkSoft }} aria-hidden="true" />
          </span>
        </div>
        {item.reason && !open && <p className="truncate text-[11px] leading-[15px]" style={{ color: C.inkSoft }}>{item.reason}</p>}
      </div>
    </>
  );
  const chips = (
    <>
      {item.challenge && <Chip bg={C.challengeBg} fg={C.challengeFg}>★ {T.challenge}</Chip>}
      {/* La date sans l'année : la carte compacte garde ses étiquettes sur la ligne des boutons. */}
      {item.shortDate && <Chip bg={C.dateBg} fg={C.dateFg}>{T.shortDate} {item.shortDate.replace(/\/\d{4}$/, "")}</Chip>}
      {item.margin && <Chip bg={C.then} fg={C.numberFg}>Marge {item.margin} HT</Chip>}
      {stock && <Chip bg={stock.bg} fg={stock.fg}>{stock.label}{item.quantity !== undefined && item.stock !== "OUT_OF_STOCK" ? ` · ${item.quantity}` : ""}</Chip>}
    </>
  );
  return (
    <li data-advice-card="" data-open={open ? "" : undefined} className="isl-line snap-start rounded-xl px-2 py-1.5" style={{ background: C.panel, color: C.ink }} {...hoverProps}>
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
      <div className="mt-1 flex items-end gap-1">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">{chips}</div>
        {auto ? (
          <AutoStatus outcome={outcome} />
        ) : readOnly && !outcome ? (
          <span className="inline-flex h-6 items-center rounded-md px-2 text-[11px] font-medium" style={{ background: C.line, color: C.inkSoft }}>
            À proposer · le pharmacien valide
          </span>
        ) : outcome ? (
          <>
            <span className="isl-pop inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-bold" style={outcome === "SOLD" ? { background: C.soldBg, color: C.soldFg } : { background: C.notSoldBg, color: C.notSoldFg }}>
              {outcome === "SOLD" && <Check className="size-3" strokeWidth={3} aria-hidden="true" />}
              {outcome === "SOLD" ? T.sold : T.notSold}
            </span>
            {!readOnly && (
              <button type="button" onClick={() => onAnswer(null)} className="h-6 rounded-md px-1.5 text-[11px] font-semibold hover:bg-black/5" style={{ color: C.inkSoft }}>
                {T.change}
              </button>
            )}
          </>
        ) : (
          <>
            {/* Deux petits boutons ✓ / ✕ (vert : vendu ; gris : non vendu) : la carte tient sur deux lignes. */}
            <button type="button" onClick={() => onAnswer("SOLD")} aria-label={T.sold} title={T.sold} className="inline-flex h-6 w-8 items-center justify-center rounded-md transition-[filter] hover:brightness-105" style={{ background: C.soldBg, color: C.soldFg }}>
              <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onAnswer("NOT_SOLD")} aria-label={T.notSold} title={T.notSold} className="inline-flex h-6 w-8 items-center justify-center rounded-md border bg-white transition-colors hover:bg-[#F1F5F7]" style={{ borderColor: "#C9D5DC", color: C.notSoldFg }}>
              <X className="size-3.5" strokeWidth={3} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      {/* La correction, seulement dans la carte déployée : un produit vendu sans être bipé (tapé à la main, sans code-barres),
          ou un « Vendu » à retirer (le client a reposé la boîte). */}
      {auto && open && !readOnly && (
        <div data-auto-fix="" className="mt-1.5 flex items-center justify-end gap-1 border-t pt-1.5" style={{ borderColor: C.line }}>
          <span className="mr-auto text-[10.5px]" style={{ color: C.inkSoft }}>{outcome === "SOLD" ? "Compté vendu." : "Bipé, il passe en vendu tout seul."}</span>
          {outcome !== "SOLD" && (
            <button type="button" onClick={() => onAnswer("SOLD")} className="h-6 rounded-md px-2 text-[11px] font-bold hover:brightness-105" style={{ background: C.soldBg, color: C.soldFg }}>
              Vendu sans scan
            </button>
          )}
          {outcome && (
            <button type="button" onClick={() => onAnswer(null)} className="h-6 rounded-md px-2 text-[11px] font-semibold hover:bg-black/5" style={{ color: C.inkSoft }}>
              Annuler
            </button>
          )}
        </div>
      )}
      {!open && hovered && <PitchPanel item={item} />}
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
      {(sheet?.ask?.length || sheet?.pitch) && <PitchPanel item={item} />}
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
    <div>
      <p className="text-[10.5px] font-bold tracking-[0.04em] uppercase" style={{ color: C.inkSoft }}>{title}</p>
      <div className="mt-0.5 space-y-1">{children}</div>
    </div>
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
