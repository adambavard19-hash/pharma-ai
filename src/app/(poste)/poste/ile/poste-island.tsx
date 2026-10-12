"use client";

import { useCallback, useEffect, useReducer, useRef, type ComponentProps } from "react";
import { BANNER } from "../../../../../agent/src/banner-design";
import type { HostEntry } from "../../../../../agent/src/notice-center";
import { CounterIsland, type IslandAdvice } from "@/components/island/counter-island";
import { IslandShell, ISLAND_CSS } from "@/components/island/island-shell";
import { Robot } from "@/components/robot";
import {
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
import { ESSAI_LENGTH_MS, ESSAI_SEQUENCE } from "@/core/poste/island-fixtures";

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

type Outgoing = { type: "ready" } | { type: "word"; word: string } | { type: "region"; rects: RegionRect[] } | { type: "keyboard"; on: boolean };

type WebViewBridge = { postMessage: (message: unknown) => void; addEventListener: (type: "message", listener: (event: { data: unknown }) => void) => void; removeEventListener: (type: "message", listener: (event: { data: unknown }) => void) => void };

const C = BANNER.colors;
const T = BANNER.text;

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
  }));

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
      <div ref={root} data-ile-root="" className="flex w-full flex-col items-center gap-2 pt-[5px] select-none">
        {!questionsOnly && <CounterIsland {...islandProps} />}

        {showQuestions && entry && (
          <IslandShell width={BANNER.sizes.widthExpanded + 40} contentKey={`q-${entry.signature}`} label={T.questionTitle}>
            <div className="px-3.5 pt-3 pb-3.5">
              <div className="flex items-center gap-3">
                {questionsOnly && <Robot size={34} mood="curious" look={view.look} label="Le robot PharmaBoost" />}
                <div className="min-w-0">
                  <p className="text-[14.5px] leading-5 font-semibold">{T.questionTitle}</p>
                  <p className="truncate text-[12.5px] leading-[18px] text-white/60">{T.questionSub}</p>
                </div>
              </div>
              <div className="mt-2.5 space-y-2.5">
                {questions.map((question) => (
                  <div key={question.node} className="rounded-2xl bg-white/[0.06] px-3 py-2.5">
                    <p className="text-[13px] leading-5 text-white/90">{question.text}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {question.choices.map((choice) => (
                        <button
                          key={choice.key}
                          type="button"
                          onClick={() => word(questionWord(entry.id, question.node, choice.key))}
                          className="h-8 rounded-full px-3 text-[12.5px] font-semibold transition-colors"
                          style={choice.selected ? { background: C.accent, color: "#04261A" } : { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.9)" }}
                        >
                          {choice.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {entry.guidance.map((line) => (
                  <p key={line} className="rounded-2xl px-3 py-2 text-[12.5px] leading-[18px]" style={{ background: "rgba(54,232,200,0.10)", color: "#BFF7EA" }}>{line}</p>
                ))}
              </div>
              {questionsOnly && (
                <button type="button" onClick={() => word(finishWord(entry.id))} className="mt-2.5 h-9 w-full rounded-xl text-[12.5px] font-bold" style={{ background: C.accent, color: "#04261A" }}>
                  {T.finish}
                </button>
              )}
            </div>
          </IslandShell>
        )}

        {island.stage === "email" && entry?.emailError && (
          <IslandShell width={460} tone="warning" contentKey={`err-${entry.emailError}`} label="Adresse refusée">
            <p className="px-4 py-2.5 text-[12.5px] leading-[18px] text-[#FFE2B0]">{entry.emailError}</p>
          </IslandShell>
        )}

        {island.stage === "done" && view.done && (view.done.lines.length > 0 || view.done.badge) && (
          <IslandShell width={BANNER.sizes.widthDone} tone={view.done.warning ? "warning" : "success"} contentKey={`done-${view.done.id}`} label="Résultat de la vente">
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
