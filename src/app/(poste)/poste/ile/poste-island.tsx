"use client";

import { useCallback, useEffect, useReducer, useRef, type ComponentProps } from "react";
import { BANNER } from "../../../../../agent/src/banner-design";
import type { HostEntry } from "../../../../../agent/src/notice-center";
import { CounterIsland, type IslandAdvice } from "@/components/island/counter-island";
import { STAGE_WIDTH } from "@/core/island/banner-flow";
import { IslandShell, ISLAND_CSS } from "@/components/island/island-shell";
import { IslandQuestions } from "@/components/island/island-questions";
import { Robot } from "@/components/robot";
import {
  adviceLink,
  answerWord,
  emailWord,
  finishWord,
  INITIAL_POSTE,
  parseCommand,
  posteReducer,
  questionWord,
  regionRects,
  sameRegion,
  SCAN_TIMEOUT_MS,
  stageDelay,
  type HostCommand,
  type RegionRect,
} from "@/core/poste/island-bridge";
import { ESSAI_LENGTH_MS, ESSAI_SEQUENCE, isEssaiSale } from "@/core/poste/island-fixtures";
import { readCounterSheet } from "../../../../../agent/src/counter-sheet";
import { GREETING_SHOW_MS } from "../../../../../agent/src/greeting-text";

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
const GREETING_WIDTH = 380;

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

export function PosteIsland() {
  const [view, dispatch] = useReducer(posteReducer, INITIAL_POSTE);
  const { send } = useBridge(useCallback((command: HostCommand) => dispatch({ type: "host", command, now: Date.now() }), []));
  const word = useCallback((text: string | null) => { if (text) send({ type: "word", word: text }); }, [send]);
  const { island, entry } = view;

  // Le temps qui passe : scan → analyse, lignes cochées, pause « N conseils », fin de « Rien à ajouter » et de « Vente terminée ».
  useEffect(() => {
    const delay = stageDelay(island.stage);
    if (delay === null) return;
    const id = setTimeout(() => {
      if (island.stage === "scan" || island.stage === "analyzing") dispatch({ type: "tick" });
      else if (island.stage === "ready") dispatch({ type: "expand" });
      else dispatch({ type: "settle" });
    }, delay);
    return () => clearTimeout(id);
  }, [island.stage, island.stepsDone, entry]);

  // Le bonjour du robot reste une dizaine de secondes, puis l'île revient au repos (un clic le ferme avant).
  useEffect(() => {
    if (!view.greeting) return;
    const id = setTimeout(() => dispatch({ type: "dismissGreeting" }), GREETING_SHOW_MS);
    return () => clearTimeout(id);
  }, [view.greeting]);

  // Une analyse sans réponse ne reste pas affichée indéfiniment (même délai que la bannière).
  useEffect(() => {
    if (!view.scanAt) return;
    const id = setTimeout(() => dispatch({ type: "timeout" }), SCAN_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [view.scanAt]);

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
      const sections = root.current ? [...root.current.querySelectorAll("section")] : [];
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

  // Le bonjour ne se montre qu'au repos (le reducer l'efface déjà à chaque scan ou vente).
  const greeting = island.stage === "idle" && !entry ? view.greeting : null;
  const items = entry ? toAdvice(entry) : [];
  const questions = entry?.questions ?? [];
  const questionsOnly = Boolean(entry) && items.length === 0 && questions.length > 0 && island.stage === "advice";
  const showQuestions = Boolean(entry) && questions.length > 0 && (island.stage === "advice" || island.stage === "email");
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
    pills: [{ key: "poste", label: view.postLabel || "Comptoir", value: "Connecté", dot: C.accent }],
    look: view.look,
    onAnswer: (index, outcome) => {
      dispatch({ type: "answer", index, outcome });
      if (entry?.items[index]) word(answerWord(entry.id, entry.items[index], outcome));
    },
    onEmail: (value) => dispatch({ type: "typeEmail", value }),
    onSendEmail: () => {
      if (!entry) return;
      word(emailWord(entry.id, island.email));
      dispatch({ type: "sendEmail" });
    },
    onAddEmail: () => dispatch({ type: "openEmail" }),
    onFinish: () => { if (entry) word(finishWord(entry.id)); },
    onDismissAlert: () => dispatch({ type: "readAlert" }),
  };

  return (
    <>
      <style>{`${ISLAND_CSS}\nhtml,body{background:transparent!important;overflow:hidden;}`}</style>
      <div
        ref={root}
        data-ile-root=""
        title="Glissez pour déplacer la bannière"
        className="flex w-full cursor-grab flex-col items-center gap-2 pt-[5px] select-none active:cursor-grabbing [&_button]:cursor-pointer [&_input]:cursor-text"
        onPointerDown={(event) => {
          // Saisir l'île (hors bouton, champ ou liste qui défile) : la fenêtre Windows suit la souris tant que le bouton est tenu.
          if (event.button !== 0 || !isDragHandle(event.target)) return;
          drag.current = { x: event.screenX, y: event.screenY, moved: false };
          send({ type: "drag" });
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (start && !start.moved && Math.hypot(event.screenX - start.x, event.screenY - start.y) > 4) start.moved = true;
        }}
        onPointerUp={(event) => {
          const start = drag.current;
          if (start && !start.moved && Math.hypot(event.screenX - start.x, event.screenY - start.y) > 4) start.moved = true;
        }}
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
          <IslandShell width={GREETING_WIDTH} tone="accent" contentKey="bonjour" label="Bonjour du robot PharmaBoost">
            {/* Un bouton : un clic ferme le message. Jamais de champ, jamais de focus demandé : le clavier reste au logiciel de gestion. */}
            <button
              type="button"
              data-ile-bonjour=""
              onClick={() => dispatch({ type: "dismissGreeting" })}
              title="Fermer le message"
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
            >
              <span className="isl-pop shrink-0">
                <Robot size={40} mood="happy" look={view.look} label="Le robot PharmaBoost" />
              </span>
              <span className="min-w-0 text-[13px] leading-[18px] text-white/90">{greeting}</span>
            </button>
          </IslandShell>
        ) : (
          !questionsOnly && <CounterIsland {...islandProps} />
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
                <button type="button" onClick={() => word(finishWord(entry.id))} className="mt-2 h-8 w-full rounded-xl text-[12.5px] font-bold" style={{ background: C.accent, color: "#04261A" }}>
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
