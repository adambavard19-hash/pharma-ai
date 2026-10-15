"use client";

import { useCallback, useEffect, useReducer, useRef, useState, type ComponentProps, type CSSProperties } from "react";
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
/** L'île repliée : le robot et « N conseils trouvés », rien d'autre. */
const FOLDED_WIDTH = 270;
/** La souris sortie de l'île, elle se replie après ce délai (un aller-retour rapide ne la fait pas clignoter). */
const FOLD_DELAY_MS = 600;

/** « 3 conseils trouvés », « 1 conseil trouvé », « Aucun conseil ». */
export function foldedLabel(count: number): string {
  if (count <= 0) return "Aucun conseil";
  return count === 1 ? "1 conseil trouvé" : `${count} conseils trouvés`;
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
  // pendant la vente, seuls le robot et « N conseils trouvés » restent à l'écran ; les conseils se déploient quand la souris
  // passe sur l'île (ou d'un appui, sur un écran tactile) et se replient quand elle en sort.
  const [hovered, setHovered] = useState(false);
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

  // Le bonjour ne se montre qu'au repos (le reducer l'efface déjà à chaque scan ou vente).
  const greeting = island.stage === "idle" && !entry ? view.greeting : null;
  const items = entry ? toAdvice(entry) : [];
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
          // Sur l'île (une de ses capsules) : déployée ; à côté (le reste de la fenêtre, transparent) : repliée bientôt.
          // Le bouton « Client suivant » et la question « C'est un autre client ? » ne déploient rien : la bannière ne bouge pas
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
        ) : folded && entry ? (
          <IslandShell width={FOLDED_WIDTH} tone="accent" contentKey="replie" label="Conseils de la vente (survolez pour les voir)">
            <div className="flex w-full items-center gap-2 py-1.5 pr-1.5 pl-2">
              <button type="button" data-ile-replie="" onClick={openIsland} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                <Robot size={34} mood={items.length > 0 ? "happy" : "idle"} look={view.look} label="Le robot PharmaBoost" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] leading-[18px] font-bold" style={{ color: items.length > 0 ? C.accent : "#FFFFFF" }}>{foldedLabel(items.length)}</span>
                  <span className="block truncate text-[11.5px] leading-[15px] text-white/55">Passez la souris pour voir</span>
                </span>
              </button>
              {/* Le client est parti : la vente se termine d'un clic, sans la question de l'e-mail, et le prochain scan est un nouveau client. */}
              <button
                type="button"
                data-ile-client-suivant=""
                data-ile-sans-deploiement=""
                onClick={() => word(finishWord(entry.id))}
                className="h-8 shrink-0 rounded-xl px-2.5 text-[12px] font-bold transition-[filter] hover:brightness-110"
                style={{ background: C.accent, color: "#04261A" }}
              >
                Client suivant
              </button>
            </div>
          </IslandShell>
        ) : (
          !questionsOnly && <CounterIsland {...islandProps} />
        )}

        {askOtherClient && entry && lateBox && (
          <IslandShell width={FOLDED_WIDTH + 30} tone="warning" contentKey={`autre-${lateBox.id}`} label="C'est un autre client ?">
            <div data-ile-autre-client="" data-ile-sans-deploiement="" className="px-3.5 py-2.5 text-left">
              <p className="truncate text-[12px] leading-[16px] text-white/70">« {lateBox.name} » ajouté à cette vente</p>
              <p className="mt-0.5 text-[14px] leading-[18px] font-bold text-[#FFE2B0]">C&apos;est un autre client ?</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  data-ile-autre-client-oui=""
                  onClick={() => word(splitBoxWord(entry.id, lateBox.id))}
                  className="h-8 flex-1 rounded-xl text-[12.5px] font-bold transition-[filter] hover:brightness-110"
                  style={{ background: C.accent, color: "#04261A" }}
                >
                  Oui, nouveau client
                </button>
                <button type="button" onClick={() => setKeptBox(lateBox.id)} className="h-8 rounded-xl bg-white/10 px-3 text-[12.5px] font-semibold text-white hover:bg-white/15">
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
