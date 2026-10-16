"use client";

import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore, type ComponentProps, type CSSProperties } from "react";
import { BANNER } from "../../../../../agent/src/banner-design";
import type { HostEntry } from "../../../../../agent/src/notice-center";
import { BURST_PIECES, CounterIsland, type IslandAdvice } from "@/components/island/counter-island";
import { STAGE_WIDTH } from "@/core/island/banner-flow";
import { IslandShell, ISLAND_CSS } from "@/components/island/island-shell";
import { IslandQuestions } from "@/components/island/island-questions";
import { Robot } from "@/components/robot";
import {
  adviceLink,
  answerWord,
  emailWord,
  finishWord,
  removeBoxWord,
  splitBoxWord,
  INITIAL_POSTE,
  parseCommand,
  posteReducer,
  questionWord,
  regionRects,
  sameRegion,
  SCAN_TIMEOUT_MS,
  stageDelay,
  type HostCommand,
  type IslandSide,
  type RegionRect,
} from "@/core/poste/island-bridge";
import { ESSAI_LENGTH_MS, ESSAI_SEQUENCE, isEssaiSale } from "@/core/poste/island-fixtures";
import { readCounterSheet } from "../../../../../agent/src/counter-sheet";

/**
 * L'île du poste de caisse : la bannière validée (`CounterIsland`, les mêmes composants que l'aperçu), pilotée par
 * l'agent Windows au travers de WebView2. Elle reçoit les commandes de la bannière, renvoie les mêmes mots, et dit à la
 * fenêtre Windows quelle forme elle occupe (pour que le reste de l'écran laisse passer les clics).
 *
 * Trois façons d'être branchée :
 *  - dans WebView2 (le poste) : `window.chrome.webview` ;
 *  - dans un cadre (l'aperçu de développement `/robot-apercu/poste`) : messages avec la page parente, même origine ;
 *  - seule dans un navigateur : rien n'arrive, sauf `?essai=1` qui joue une vente d'exemple.
 */

type Outgoing = { type: "ready" } | { type: "word"; word: string } | { type: "region"; rects: RegionRect[] } | { type: "keyboard"; on: boolean } | { type: "drag" } | { type: "dragEnd" };

type WebViewBridge = { postMessage: (message: unknown) => void; addEventListener: (type: "message", listener: (event: { data: unknown }) => void) => void; removeEventListener: (type: "message", listener: (event: { data: unknown }) => void) => void };

const C = BANNER.colors;
const T = BANNER.text;
/** La largeur de l'île pendant le bonjour : assez pour trois lignes lisibles, sans masquer le logiciel de gestion. */
const GREETING_WIDTH = 420;
/** L'île repliée : le robot et « N conseils suggérés », rien d'autre. */
const FOLDED_WIDTH = 370;
/** L'île repliée debout, contre le bord gauche ou droit de l'écran : le robot, le nombre et le bouton, l'un sous l'autre. */
const SIDE_FOLDED_WIDTH = 132;
/** Où l'île se range dans la fenêtre Windows (600 × 760), selon la place choisie au poste : collée au bord de l'écran. */
const ROOT_LAYOUT: Record<IslandSide, string> = {
  haut: "w-full flex-col items-center pt-[5px]",
  // En bas, l'île touche le bas de l'écran et ce qui s'y ajoute (questions, « autre client ? ») se pose au-dessus.
  bas: "h-dvh w-full flex-col-reverse items-center pb-[5px]",
  gauche: "h-dvh w-full flex-col items-start justify-center pl-[5px]",
  droite: "h-dvh w-full flex-col items-end justify-center pr-[5px]",
};

/**
 * Le style « Aurore » de la bannière du poste (fondateur, 15 oct. 2026 : « plus minimaliste, moderne, futuriste, aux
 * couleurs du site ») : verre vert très profond, liseré d'un pixel en dégradé teal → vert → citron (le dégradé de marque du
 * site) qui s'éclaire lentement, moins de texte, boutons fins. Seulement sur le poste : l'île du site garde son habit.
 * `?style=actuel` remet l'ancien (comparaison dans l'aperçu).
 */
const AURORE_CSS = `
[data-ile-style=aurore] section{background:linear-gradient(180deg,#072A25 0%,#03171A 100%)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 14px 34px -14px rgba(0,0,0,.65)!important;isolation:isolate}
[data-ile-style=aurore] section::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;z-index:2;
  background:linear-gradient(110deg,rgba(95,165,148,.55),rgba(116,214,160,.35) 35%,rgba(232,255,156,.85) 50%,rgba(116,214,160,.35) 65%,rgba(95,165,148,.55));background-size:250% 100%;
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:aur-sweep 6s linear infinite}
[data-ile-style=aurore] section[data-tone=warning]::before{background:linear-gradient(110deg,rgba(245,166,35,.55),rgba(255,214,140,.9) 50%,rgba(245,166,35,.55));background-size:250% 100%}
[data-ile-style=aurore] section[data-tone=danger]::before{background:linear-gradient(110deg,rgba(255,92,92,.6),rgba(255,180,170,.95) 50%,rgba(255,92,92,.6));background-size:250% 100%}
[data-ile-style=aurore] section[data-tone=success]::before{background:linear-gradient(110deg,rgba(116,214,160,.6),rgba(232,255,156,.95) 50%,rgba(116,214,160,.6));background-size:250% 100%}
@keyframes aur-sweep{from{background-position:100% 0}to{background-position:-150% 0}}
@keyframes aur-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}
.aur-dot{width:6px;height:6px;border-radius:999px;background:#E8FF9C;box-shadow:0 0 8px rgba(232,255,156,.9);animation:aur-pulse 2.4s ease-in-out infinite}
.aur-btn{border:1px solid rgba(159,203,187,.45);background:rgba(255,255,255,.04);color:#DDF7EA;transition:background .2s,border-color .2s,color .2s}
.aur-btn:hover{background:rgba(232,255,156,.12);border-color:rgba(232,255,156,.7);color:#F4FFD6}
@media (prefers-reduced-motion:reduce){[data-ile-style=aurore] section::before,.aur-dot{animation:none}}
`;

const noSubscribe = () => () => {};

/** La souris sortie de l'île, elle se replie après ce délai (un aller-retour rapide ne la fait pas clignoter). */
const FOLD_DELAY_MS = 600;

/** « 3 conseils suggérés », « 1 conseil suggéré », « Aucun conseil ». */
export function foldedLabel(count: number): string {
  if (count <= 0) return "Aucun conseil";
  return count === 1 ? "1 conseil suggéré" : `${count} conseils suggérés`;
}

/** « 1 vendu », « 2 vendus ». */
export function soldLabel(count: number): string {
  return count > 1 ? `${count} vendus` : "1 vendu";
}

/** « 2026-03-31 » → « 31/03/2026 ». */
export function frenchDay(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

/** « Bonjour Léa, comment vas-tu ? … » → le titre doré « Bonjour Léa ! » et le reste en dessous (« Comment vas-tu ? … »). */
export function greetingParts(text: string): { title: string; body: string } {
  const match = /^(Bonjour[^,!?]*)[,!]\s*(.*)$/s.exec(text.trim());
  if (!match) return { title: text.trim(), body: "" };
  const body = match[2].trim();
  return { title: `${match[1].trim()} !`, body: body ? body.charAt(0).toUpperCase() + body.slice(1) : "" };
}

function webview(): WebViewBridge | null {
  const chrome = (window as unknown as { chrome?: { webview?: WebViewBridge } }).chrome;
  return chrome?.webview ?? null;
}

/** Le canal avec l'agent (ou avec l'aperçu) : recevoir ses commandes, lui envoyer nos messages. */
function useBridge(onCommand: (command: HostCommand) => void): { send: (message: Outgoing) => void } {
  const handler = useRef(onCommand);
  useEffect(() => {
    handler.current = onCommand;
  });
  const sendRef = useRef<(message: Outgoing) => void>(() => {});

  useEffect(() => {
    const wv = webview();
    const receive = (raw: unknown) => {
      const command = parseCommand(raw);
      if (command) handler.current(command);
    };
    if (wv) {
      const listener = (event: { data: unknown }) => receive(event.data);
      wv.addEventListener("message", listener);
      sendRef.current = (message) => wv.postMessage(message);
      sendRef.current({ type: "ready" });
      return () => wv.removeEventListener("message", listener);
    }
    if (window.parent !== window) {
      const listener = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data as { pbIsland?: unknown } | null;
        if (data && "pbIsland" in data) receive(data.pbIsland);
      };
      window.addEventListener("message", listener);
      sendRef.current = (message) => window.parent.postMessage({ pbIslandOut: message }, window.location.origin);
      sendRef.current({ type: "ready" });
      return () => window.removeEventListener("message", listener);
    }
    // Seule dans un navigateur : la vente d'exemple, en boucle, si on la demande.
    if (!new URLSearchParams(window.location.search).has("essai")) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const play = () => {
      for (const step of ESSAI_SEQUENCE) timers.push(setTimeout(() => receive(step.command), step.at));
      timers.push(setTimeout(play, ESSAI_LENGTH_MS));
    };
    play();
    return () => timers.forEach(clearTimeout);
  }, []);

  return { send: useCallback((message: Outgoing) => sendRef.current(message), []) };
}

/**
 * Les conseils de la vente, tels que l'île les dessine. Chaque carte mène à la page PharmaBoost de la vente, ouverte sur
 * ce conseil (agent/src/sale-link.ts) : un lien relatif, donc toujours vers le serveur qui sert cette page. Au poste,
 * l'hôte Windows l'envoie au navigateur par défaut du PC ; ailleurs, c'est un lien normal (nouvel onglet).
 */
const toAdvice = (entry: HostEntry): IslandAdvice[] =>
  entry.items.map((item) => ({
    name: item.name,
    price: item.price || undefined,
    margin: item.margin || undefined,
    drug: item.drug || undefined,
    reason: item.reason || undefined,
    challenge: Boolean(item.challenge),
    shortDate: item.shortDate || undefined,
    stock: item.availability as IslandAdvice["stock"],
    quantity: item.quantity !== "" && Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : undefined,
    image: item.image || undefined,
    href: isEssaiSale(entry.id) ? undefined : adviceLink(entry.id, item),
    // La carte déployée : relue une dernière fois (forme, bornes) — une commande d'une autre version ne casse pas l'île.
    sheet: readCounterSheet(item.sheet) ?? undefined,
  }));

/** Ce qu'on peut saisir pour déplacer l'île : tout, sauf les boutons, les champs, les liens et les listes qui défilent. */
function isDragHandle(target: EventTarget | null): boolean {
  // Une carte de conseil se déploie d'un appui : jamais une prise (elle est aussi dans la liste qui défile).
  return target instanceof Element && !target.closest("button, input, textarea, a, select, .isl-scroll, [data-advice-card]");
}

/** La version de cette page, fixée au build (publication) ; absente en développement. */
const PAGE_RELEASE = process.env.NEXT_PUBLIC_PB_RELEASE || null;
/** Toutes les 2 minutes, la bannière regarde si une nouvelle version est en ligne. */
const RELEASE_CHECK_MS = 2 * 60 * 1000;

export function PosteIsland() {
  const [view, dispatch] = useReducer(posteReducer, INITIAL_POSTE);
  const { send } = useBridge(useCallback((command: HostCommand) => dispatch({ type: "host", command, now: Date.now() }), []));
  const word = useCallback((text: string | null) => { if (text) send({ type: "word", word: text }); }, [send]);
  const { island, entry } = view;

  // La bannière du poste est une page chargée une fois, au démarrage de PharmaBoost Connect : sans cela, elle gardait
  // l'ancienne version jusqu'au redémarrage du poste (13 oct. 2026). Une nouvelle version en ligne la recharge — seulement
  // au repos, jamais pendant une vente.
  const resting = island.stage === "idle" && !entry;
  const newRelease = useRef(false);
  useEffect(() => {
    if (!PAGE_RELEASE) return;
    const check = async () => {
      try {
        const response = await fetch("/api/sante", { cache: "no-store" });
        const body = (await response.json()) as { version?: string | null };
        if (body.version && body.version !== PAGE_RELEASE) newRelease.current = true;
      } catch {
        // Réseau coupé : on réessaiera au prochain tour.
      }
    };
    const id = setInterval(check, RELEASE_CHECK_MS);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!resting) return;
    const id = setInterval(() => {
      if (newRelease.current) window.location.reload();
    }, 5000);
    return () => clearInterval(id);
  }, [resting]);

  // Le temps qui passe : scan → analyse, lignes cochées, pause « N conseils », fin de « Rien à ajouter » et de « Vente terminée ».
  useEffect(() => {
    const delay = stageDelay(island.stage, Boolean(entry));
    if (delay === null) return;
    const id = setTimeout(() => {
      if (island.stage === "scan" || island.stage === "analyzing") dispatch({ type: "tick" });
      else if (island.stage === "ready") dispatch({ type: "expand" });
      else dispatch({ type: "settle" });
    }, delay);
    return () => clearTimeout(id);
  }, [island.stage, island.stepsDone, entry]);

  // Le bonjour du robot reste jusqu'à « OK » (fondateur, 15 oct. 2026) ; un scan le remplace (le reducer l'efface), il ne bloque jamais une vente.

  // Une analyse sans réponse ne reste pas affichée indéfiniment (même délai que la bannière).
  useEffect(() => {
    if (!view.scanAt) return;
    const id = setTimeout(() => dispatch({ type: "timeout" }), SCAN_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [view.scanAt]);

  // « Vente terminée » demande d'abord l'e-mail du bilan (s'il n'est pas déjà enregistré) ; envoyé, la vente se termine seule.
  const [finishAfterEmail, setFinishAfterEmail] = useState(false);
  const finish = () => {
    if (!entry) return;
    if (!entry.emailSaved && !finishAfterEmail) {
      setFinishAfterEmail(true);
      dispatch({ type: "openEmail" });
      return;
    }
    setFinishAfterEmail(false);
    word(finishWord(entry.id));
  };
  useEffect(() => {
    if (!finishAfterEmail || !entry?.emailSaved) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- l'adresse est enregistrée : la vente se termine, une fois
    setFinishAfterEmail(false);
    word(finishWord(entry.id));
  }, [finishAfterEmail, entry?.emailSaved, entry?.id, word]);
  useEffect(() => {
    // Une autre vente (nouveau bip) : la demande de fin de la précédente est oubliée.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- suit la vente affichée
    setFinishAfterEmail(false);
  }, [entry?.id]);

  // Le clavier n'est demandé que pour l'e-mail du patient ; il est rendu au logiciel de gestion dès qu'on en sort.
  const emailOpen = island.stage === "email";
  useEffect(() => {
    send({ type: "keyboard", on: emailOpen });
    if (!emailOpen) return;
    const id = setTimeout(() => document.getElementById("ile-email")?.focus(), 80);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") dispatch({ type: "closeEmail" }); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(id); window.removeEventListener("keydown", onKey); };
  }, [emailOpen, send]);

  // La forme de l'île, envoyée à la fenêtre Windows à chaque changement (pendant les animations comprises).
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  useEffect(() => {
    let last: RegionRect[] = [];
    let frame = 0;
    let lastSent = 0;
    const measure = (time: number) => {
      frame = requestAnimationFrame(measure);
      if (time - lastSent < 33) return;
      // Seulement les blocs de premier niveau : Windows découpe la fenêtre en alternant (deux formes qui se chevauchent
      // s'annulent). Une rubrique <section> de la carte dépliée, comptée en plus de l'île qui la contient, trouait la
      // bannière à cet endroit — le logiciel de gestion apparaissait au travers (poste du 13 oct. 2026).
      const sections = root.current ? [...root.current.querySelectorAll("section")].filter((section) => !section.parentElement?.closest("section")) : [];
      const rects = regionRects(sections.map((section) => {
        const box = section.getBoundingClientRect();
        return { x: box.left, y: box.top, width: box.width, height: box.height, radius: parseFloat(getComputedStyle(section).borderTopLeftRadius) || 0 };
      }));
      if (sameRegion(rects, last)) return;
      last = rects;
      lastSent = time;
      send({ type: "region", rects });
    };
    frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [send]);

  // L'île repliée (fondateur, 15 oct. 2026 : « la bannière prend beaucoup trop de place quand il y a beaucoup de scans ») :
  // pendant la vente, seuls le robot et « N conseils suggérés » restent à l'écran ; les conseils se déploient quand la souris
  // passe sur l'île (ou d'un appui, sur un écran tactile) et se replient quand elle en sort.
  const [hovered, setHovered] = useState(false);
  // Le nouveau style par défaut ; l'ancien reste joignable pour comparer (aperçu).
  const aurore = useSyncExternalStore(noSubscribe, () => new URLSearchParams(window.location.search).get("style") !== "actuel", () => true);
  const foldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openIsland = useCallback(() => {
    if (foldTimer.current) clearTimeout(foldTimer.current);
    foldTimer.current = null;
    setHovered(true);
  }, []);
  const foldSoon = useCallback(() => {
    if (foldTimer.current) return;
    foldTimer.current = setTimeout(() => {
      foldTimer.current = null;
      setHovered(false);
    }, FOLD_DELAY_MS);
  }, []);
  useEffect(() => () => { if (foldTimer.current) clearTimeout(foldTimer.current); }, []);
  const folded = Boolean(entry) && island.stage === "advice" && !hovered && !finishAfterEmail;

  // « C'est un autre client ? » : la dernière boîte est arrivée plus de 30 secondes après la précédente (le serveur la marque).
  // « Non » range la question pour cette boîte ; « Oui » la sépare : elle ouvre une nouvelle vente, la précédente se termine.
  const [keptBox, setKeptBox] = useState<string | null>(null);
  const lateBox = entry && island.stage === "advice" ? (entry.boxes ?? []).find((box) => box.late) ?? null : null;
  const askOtherClient = lateBox !== null && lateBox.id !== keptBox && (entry?.boxes ?? []).length > 1;

  // La péremption lue dans le Datamatrix de la boîte bipée : une boîte périmée (à ne pas donner) ou qui périme dans le mois.
  // « Compris » range l'avertissement pour cette boîte.
  const [seenExpiry, setSeenExpiry] = useState<string[]>([]);
  const expiryBox = entry && island.stage !== "idle" && island.stage !== "done" ? ((entry.boxes ?? []).filter((box) => box.expiry && !seenExpiry.includes(`${box.id}:${box.expiry.on}`)).sort((a, b) => Number(b.expiry?.state === "expired") - Number(a.expiry?.state === "expired"))[0] ?? null) : null;

  // Le bonjour ne se montre qu'au repos (le reducer l'efface déjà à chaque scan ou vente).
  const greeting = island.stage === "idle" && !entry ? view.greeting : null;
  const items = entry ? toAdvice(entry) : [];
  // Les conseils déjà vendus (bipés, ou marqués « Vendu ») : la bannière repliée le montre d'elle-même.
  const soldCount = entry ? entry.items.filter((item) => item.outcome === "SOLD").length : 0;
  const questions = entry?.questions ?? [];
  const questionsOnly = Boolean(entry) && items.length === 0 && questions.length > 0 && island.stage === "advice";
  const showQuestions = !folded && Boolean(entry) && questions.length > 0 && (island.stage === "advice" || island.stage === "email");
  // Avant la réponse du serveur, la boîte est « en cours de lecture » : jamais un nom deviné.
  const drug = entry ? entry.items[0]?.drug || entry.subject : "lecture en cours…";
  const alert = entry && entry.alerts.length > 0 ? { title: T.readFirst, text: entry.alerts.join(" ") } : null;
  const islandProps: ComponentProps<typeof CounterIsland> & { look?: number | null } = {
    state: island,
    items,
    drug,
    alert,
    alertItems: entry?.alerts ?? [],
    movable: true,
    adviceLinksOutside: true,
    // Au poste, les conseils arrivent en mode compact (un à la fois) : la bannière ne masque pas le logiciel de gestion.
    compactAdvice: true,
    pills: [{ key: "poste", label: view.postLabel || "Comptoir", value: "Connecté", dot: C.accent }],
    look: view.look,
    onAnswer: (index, outcome) => {
      dispatch({ type: "answer", index, outcome });
      if (entry?.items[index]) word(answerWord(entry.id, entry.items[index], outcome));
    },
    onEmail: (value) => dispatch({ type: "typeEmail", value }),
    onCloseEmail: () => {
      setFinishAfterEmail(false);
      dispatch({ type: "closeEmail" });
    },
    onFinishWithoutEmail: finishAfterEmail
      ? () => {
          setFinishAfterEmail(false);
          dispatch({ type: "closeEmail" });
          if (entry) word(finishWord(entry.id));
        }
      : undefined,
    onSendEmail: () => {
      if (!entry) return;
      word(emailWord(entry.id, island.email));
      dispatch({ type: "sendEmail" });
    },
    onAddEmail: () => dispatch({ type: "openEmail" }),
    onFinish: finish,
    // Les boîtes de la vente (agent récent seulement) : le patient en repose une, elle quitte la vente et la bannière.
    boxes: entry?.boxes ?? [],
    onRemoveBox: (lineId) => { if (entry) word(removeBoxWord(entry.id, lineId)); },
    onDismissAlert: () => dispatch({ type: "readAlert" }),
  };

  return (
    <>
      <style>{`${ISLAND_CSS}\n${aurore ? AURORE_CSS : ""}\nhtml,body{background:transparent!important;overflow:hidden;}`}</style>
      <div
        ref={root}
        data-ile-root=""
        title="Glissez pour déplacer la bannière"
        data-ile-place={view.side}
        data-ile-style={aurore ? "aurore" : "actuel"}
        className={`flex ${ROOT_LAYOUT[view.side]} cursor-grab gap-2 select-none active:cursor-grabbing [&_button]:cursor-pointer [&_input]:cursor-text`}
        onPointerDown={(event) => {
          // Saisir l'île (hors bouton, champ ou liste qui défile) : la fenêtre Windows suit la souris tant que le bouton est tenu.
          if (event.button !== 0 || !isDragHandle(event.target)) return;
          drag.current = { x: event.screenX, y: event.screenY, moved: false };
          send({ type: "drag" });
        }}
        onPointerMove={(event) => {
          // Sur l'île (une de ses capsules) : déployée ; à côté (le reste de la fenêtre, transparent) : repliée bientôt.
          // Le bouton « Terminer la vente » et la question « C'est un autre client ? » ne déploient rien : la bannière ne bouge pas
          // sous la souris au moment de cliquer.
          const target = event.target instanceof Element ? event.target : null;
          if (target?.closest("[data-ile-sans-deploiement]")) {
            if (foldTimer.current) clearTimeout(foldTimer.current);
            foldTimer.current = null;
          } else if (target?.closest("section")) openIsland();
          else foldSoon();
          const start = drag.current;
          if (start && !start.moved && Math.hypot(event.screenX - start.x, event.screenY - start.y) > 4) start.moved = true;
        }}
        onPointerUp={(event) => {
          const start = drag.current;
          if (start && !start.moved && Math.hypot(event.screenX - start.x, event.screenY - start.y) > 4) start.moved = true;
        }}
        onPointerLeave={foldSoon}
        onClickCapture={(event) => {
          // Un déplacement n'est pas un clic : le robot ne rit pas, aucune carte ne s'ouvre.
          if (drag.current?.moved) {
            event.stopPropagation();
            event.preventDefault();
          }
          drag.current = null;
        }}
      >
        {greeting ? (
          <IslandShell width={GREETING_WIDTH} tone="success" contentKey="bonjour" label="Bonjour du robot PharmaBoost">
            {/* Le même habit que « Bravo ! » en fin de vente : le robot en blouse qui saute, le titre doré, le texte bien lisible.
                Seul « OK » ferme le message. Jamais de champ, jamais de focus demandé : le clavier reste au logiciel de gestion. */}
            <div data-ile-bonjour="" className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
              <span className="isl-cheer relative shrink-0">
                <Robot size={60} mood="happy" look={view.look} label="Le robot PharmaBoost" />
                <span className="isl-burst" aria-hidden="true">
                  {BURST_PIECES.map((piece, index) => (
                    <i key={index} style={{ "--a": `${piece.angle}deg`, "--d": `${piece.distance}px`, "--c": piece.color, animationDelay: `${piece.delay}ms` } as CSSProperties} />
                  ))}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="isl-pop block text-[17px] leading-[22px] font-bold" style={{ color: C.challengeIcon }}>{greetingParts(greeting).title}</span>
                {greetingParts(greeting).body && <span className="mt-0.5 block text-[13.5px] leading-[19px] text-white">{greetingParts(greeting).body}</span>}
              </span>
              <button
                type="button"
                data-ile-bonjour-ok=""
                onClick={() => dispatch({ type: "dismissGreeting" })}
                className="h-9 shrink-0 self-center rounded-xl px-4 text-[13.5px] font-bold transition-[filter] hover:brightness-110"
                style={{ background: C.accent, color: "#04261A" }}
              >
                OK
              </button>
            </div>
          </IslandShell>
        ) : folded && entry && (view.side === "gauche" || view.side === "droite") ? (
          <IslandShell width={SIDE_FOLDED_WIDTH} tone="accent" contentKey="replie-cote" label="Conseils de la vente (survolez pour les voir)">
            {/* Debout contre le bord de l'écran : tout est empilé, rien n'est coupé. */}
            <div className="flex w-full flex-col items-center gap-1.5 px-2 pt-2.5 pb-2 text-center">
              <button type="button" data-ile-replie="" onClick={openIsland} className="flex flex-col items-center gap-1">
                <Robot size={aurore ? 36 : 40} mood={items.length > 0 ? "happy" : "idle"} look={view.look} label="Le robot PharmaBoost" />
                {aurore && items.length > 0 && <span className="aur-dot" aria-hidden="true" />}
                <span className={aurore ? "block text-[13.5px] leading-[17px] font-semibold text-[#ECFFF6]" : "block text-[14px] leading-[17px] font-bold"} style={aurore ? undefined : { color: items.length > 0 ? C.accent : "#FFFFFF" }}>{foldedLabel(items.length)}</span>
                {soldCount > 0 ? (
                  <span data-ile-vendus="" className="block text-[11.5px] leading-[14px] font-bold" style={{ color: aurore ? "#E8FF9C" : C.accent }}>✓ {soldLabel(soldCount)}</span>
                ) : (
                  <span className={aurore ? "block text-[9.5px] leading-[13px] font-semibold tracking-[0.14em] text-[#9FCBBB]/70 uppercase" : "block text-[11px] leading-[14px] text-white/55"}>Survolez pour voir</span>
                )}
              </button>
              <button
                type="button"
                data-ile-client-suivant=""
                data-ile-sans-deploiement=""
                onClick={finish}
                className={aurore ? "aur-btn mt-0.5 h-8 w-full rounded-full text-[12px] font-semibold" : "mt-0.5 h-8 w-full rounded-xl text-[12px] font-bold transition-[filter] hover:brightness-110"}
                style={aurore ? undefined : { background: C.accent, color: "#04261A" }}
              >
                Terminer la vente
              </button>
            </div>
          </IslandShell>
        ) : folded && entry ? (
          <IslandShell width={FOLDED_WIDTH} tone="accent" contentKey="replie" label="Conseils de la vente (survolez pour les voir)">
            <div className="flex w-full items-center gap-2 py-1.5 pr-1.5 pl-2">
              <button type="button" data-ile-replie="" onClick={openIsland} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                <Robot size={aurore ? 30 : 34} mood={items.length > 0 ? "happy" : "idle"} look={view.look} label="Le robot PharmaBoost" />
                {aurore ? (
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 whitespace-nowrap text-[13.5px] leading-[18px] font-semibold tracking-[-0.01em] text-[#ECFFF6]">
                      {items.length > 0 && <span className="aur-dot shrink-0" aria-hidden="true" />}
                      {foldedLabel(items.length)}
                    </span>
                    {soldCount > 0 ? (
                      <span data-ile-vendus="" className="block whitespace-nowrap text-[11.5px] leading-[14px] font-bold text-[#E8FF9C]">✓ {soldLabel(soldCount)} · survolez pour voir</span>
                    ) : (
                      <span className="block whitespace-nowrap text-[9.5px] leading-[14px] font-semibold tracking-[0.16em] text-[#9FCBBB]/70 uppercase">Survolez pour voir</span>
                    )}
                  </span>
                ) : (
                  <span className="min-w-0 flex-1">
                    <span className="block whitespace-nowrap text-[14px] leading-[18px] font-bold" style={{ color: items.length > 0 ? C.accent : "#FFFFFF" }}>{foldedLabel(items.length)}</span>
                    <span className="block whitespace-nowrap text-[11.5px] leading-[15px] text-white/55">{soldCount > 0 ? `✓ ${soldLabel(soldCount)} · passez la souris` : "Passez la souris pour voir"}</span>
                  </span>
                )}
              </button>
              {/* « Terminer la vente » (fondateur, 16 oct. 2026) : l'e-mail du bilan est proposé (facultatif), puis le client suivant. Les
                  conseils non bipés y passent en « Non vendu ». */}
              <button
                type="button"
                data-ile-client-suivant=""
                data-ile-sans-deploiement=""
                onClick={finish}
                className={aurore ? "aur-btn h-8 shrink-0 rounded-full px-3 text-[12px] font-semibold" : "h-8 shrink-0 rounded-xl px-2.5 text-[12px] font-bold transition-[filter] hover:brightness-110"}
                style={aurore ? undefined : { background: C.accent, color: "#04261A" }}
              >
                {aurore ? "Terminer la vente →" : "Terminer la vente"}
              </button>
            </div>
          </IslandShell>
        ) : (
          !questionsOnly && <CounterIsland {...islandProps} />
        )}

        {expiryBox?.expiry && (
          <IslandShell width={view.side === "gauche" || view.side === "droite" ? 240 : FOLDED_WIDTH + 30} tone={expiryBox.expiry.state === "expired" ? "danger" : "warning"} contentKey={`peremption-${expiryBox.id}-${expiryBox.expiry.on}`} label={expiryBox.expiry.state === "expired" ? "Boîte périmée" : "Boîte qui périme bientôt"}>
            <div data-ile-peremption={expiryBox.expiry.state} data-ile-sans-deploiement="" className="flex items-center gap-3 px-3.5 py-2.5 text-left">
              <span className="min-w-0 flex-1">
                <span className={`block text-[14px] leading-[18px] font-bold ${expiryBox.expiry.state === "expired" ? "text-[#FF8A80]" : "text-[#FFE2B0]"}`}>
                  {expiryBox.expiry.state === "expired" ? "Boîte périmée" : `Périme le ${frenchDay(expiryBox.expiry.on)}`}
                </span>
                <span className="mt-0.5 block truncate text-[12px] leading-[16px] text-white/75">
                  « {expiryBox.name} »{expiryBox.expiry.state === "expired" ? ` · depuis le ${frenchDay(expiryBox.expiry.on)}` : ""}
                </span>
                <span className="block text-[12px] leading-[16px] text-white/55">{expiryBox.expiry.state === "expired" ? "Prenez-en une autre en rayon." : "Vérifiez qu'elle couvre le traitement."}</span>
              </span>
              <button
                type="button"
                onClick={() => setSeenExpiry((list) => [...list, `${expiryBox.id}:${expiryBox.expiry?.on}`])}
                className={aurore ? "aur-btn h-8 shrink-0 rounded-full px-3 text-[12px] font-semibold" : "h-8 shrink-0 rounded-xl bg-white/10 px-3 text-[12px] font-semibold text-white hover:bg-white/15"}
              >
                Compris
              </button>
            </div>
          </IslandShell>
        )}

        {askOtherClient && entry && lateBox && (
          <IslandShell width={view.side === "gauche" || view.side === "droite" ? 240 : FOLDED_WIDTH + 30} tone="warning" contentKey={`autre-${lateBox.id}`} label="C'est un autre client ?">
            <div data-ile-autre-client="" data-ile-sans-deploiement="" className="px-3.5 py-2.5 text-left">
              <p className="truncate text-[12px] leading-[16px] text-white/70">« {lateBox.name} » ajouté à cette vente</p>
              <p className="mt-0.5 text-[14px] leading-[18px] font-bold text-[#FFE2B0]">C&apos;est un autre client ?</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  data-ile-autre-client-oui=""
                  onClick={() => word(splitBoxWord(entry.id, lateBox.id))}
                  className={aurore ? "aur-btn h-8 flex-1 rounded-full text-[12.5px] font-semibold" : "h-8 flex-1 rounded-xl text-[12.5px] font-bold transition-[filter] hover:brightness-110"}
                  style={aurore ? undefined : { background: C.accent, color: "#04261A" }}
                >
                  Oui, nouveau client
                </button>
                <button type="button" onClick={() => setKeptBox(lateBox.id)} className={aurore ? "h-8 rounded-full px-3 text-[12.5px] font-semibold text-white/70 hover:text-white" : "h-8 rounded-xl bg-white/10 px-3 text-[12.5px] font-semibold text-white hover:bg-white/15"}>
                  Non
                </button>
              </div>
            </div>
          </IslandShell>
        )}

        {showQuestions && entry && (
          <IslandQuestions
            questions={questions}
            contentKey={`q-${entry.signature}`}
            robot={questionsOnly ? <Robot size={30} mood="curious" look={view.look} label="Le robot PharmaBoost" /> : undefined}
            guidance={entry.guidance}
            onChoose={(node, choice) => word(questionWord(entry.id, node, choice))}
            footer={
              questionsOnly ? (
                <button type="button" onClick={finish} className="mt-2 h-8 w-full rounded-xl text-[12.5px] font-bold" style={{ background: C.accent, color: "#04261A" }}>
                  {T.finish}
                </button>
              ) : undefined
            }
          />
        )}

        {island.stage === "email" && entry?.emailError && (
          <IslandShell width={STAGE_WIDTH.email} tone="warning" contentKey={`err-${entry.emailError}`} label="Adresse refusée">
            <p className="px-4 py-2.5 text-[12.5px] leading-[18px] text-[#FFE2B0]">{entry.emailError}</p>
          </IslandShell>
        )}

        {island.stage === "done" && view.done && (view.done.lines.length > 0 || view.done.badge) && (
          <IslandShell width={STAGE_WIDTH.done} tone={view.done.warning ? "warning" : "success"} contentKey={`done-${view.done.id}`} label="Résultat de la vente">
            <div className="space-y-0.5 px-4 py-2.5 text-[12.5px] leading-[18px] text-white/80">
              {view.done.lines.map((line) => <p key={line}>{line}</p>)}
              {view.done.badge && <p className="font-semibold" style={{ color: C.challengeIcon }}>★ {view.done.badge}</p>}
            </div>
          </IslandShell>
        )}
      </div>
    </>
  );
}
