"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Robot, RobotSoundToggle } from "@/components/robot";
import { cn } from "@/lib/utils";
import type { RobotMood } from "@/core/robot/mascot";
import {
  DEMO_CLICK_LINE,
  isDemoLink,
  parseCompanionMemory,
  SITE_COMPANION_KEY,
  SITE_SECTION_IDS,
  siteCompanionAllowed,
  siteSectionReaction,
  type CompanionMemory,
} from "@/core/robot/companion";

/**
 * Le robot compagnon du site : il flotte en bas à droite et suit la lecture. Chaque section qui passe au milieu de
 * l'écran change son humeur (curieux devant la bannière, pensif devant les questions, sérieux mais calme devant la
 * sécurité, content devant le tarif) et, la première fois seulement, lui fait dire une phrase courte. Il fait la fête
 * quand on clique « Réserver une démo ».
 *
 * Il ne gêne jamais : caché tant que le grand robot de l'accueil est à l'écran (il « descend » de l'accueil quand on
 * défile), caché sur téléphone dans les pages à formulaire et pendant une saisie ; une bulle à la fois, qu'on ferme ;
 * réductible. Ce qu'il a déjà dit et son état réduit valent pour la visite (session du navigateur).
 */

const NARROW_QUERY = "(max-width: 767px)";
function subscribeNarrow(onChange: () => void) {
  const list = window.matchMedia(NARROW_QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

const BUBBLE_MS = 6500;

function readMemory(): CompanionMemory {
  try {
    return parseCompanionMemory(window.sessionStorage.getItem(SITE_COMPANION_KEY));
  } catch {
    return { minimised: false, said: [] };
  }
}
function writeMemory(memory: CompanionMemory) {
  try {
    window.sessionStorage.setItem(SITE_COMPANION_KEY, JSON.stringify(memory));
  } catch {
    // Stockage indisponible : il se souviendra le temps de la page.
  }
}

export function SiteRobotCompanion() {
  const pathname = usePathname() ?? "/decouvrir";
  const narrow = useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW_QUERY).matches, () => false);
  const allowed = siteCompanionAllowed(pathname, narrow);

  const [ready, setReady] = useState(false);
  // Ce que les observateurs ont vu, et sur quelle page (une page sans grand robot ni section repart de zéro).
  const [hero, setHero] = useState({ path: "", visible: false });
  const heroVisible = hero.path === pathname && hero.visible;
  const [typing, setTyping] = useState(false);
  const [minimised, setMinimised] = useState(false);
  const [seenMood, setSeenMood] = useState<{ path: string; mood: RobotMood }>({ path: "", mood: "idle" });
  const mood: RobotMood = seenMood.path === pathname ? seenMood.mood : "idle";
  const [cheer, setCheer] = useState(0);
  const [bubble, setBubble] = useState<{ text: string; at: number } | null>(null);
  const memory = useRef<CompanionMemory>({ minimised: false, said: [] });
  const rootRef = useRef<HTMLDivElement>(null);
  const [dodging, setDodging] = useState(false);

  // La mémoire de la visite, lue après le premier rendu (rendu serveur identique : le compagnon arrive ensuite).
  useEffect(() => {
    memory.current = readMemory();
    setMinimised(memory.current.minimised);
    const id = setTimeout(() => setReady(true), 600);
    return () => clearTimeout(id);
  }, []);

  // Le grand robot de l'accueil est à l'écran : le compagnon lui laisse la place.
  useEffect(() => {
    const target = document.querySelector("[data-robot-hero]");
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setHero({ path: pathname, visible: entry.isIntersecting }), { threshold: 0.15 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [pathname]);

  // La section au milieu de l'écran donne l'humeur ; la première fois, une phrase.
  useEffect(() => {
    const sections = SITE_SECTION_IDS.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const reaction = siteSectionReaction(entry.target.id);
          if (!reaction) continue;
          setSeenMood({ path: pathname, mood: reaction.mood });
          if (reaction.line && !memory.current.said.includes(entry.target.id)) {
            memory.current = { ...memory.current, said: [...memory.current.said, entry.target.id] };
            writeMemory(memory.current);
            if (!memory.current.minimised) setBubble({ text: reaction.line, at: Date.now() });
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [pathname]);

  // « Réserver une démo » : la fête, et un mot.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a");
      if (!link || !isDemoLink(link.getAttribute("href"))) return;
      setSeenMood({ path: window.location.pathname, mood: "celebrate" });
      setCheer((value) => value + 1);
      if (!memory.current.minimised) setBubble({ text: DEMO_CLICK_LINE, at: Date.now() });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  // Une saisie en cours (sur téléphone) : il s'efface pour ne rien couvrir.
  useEffect(() => {
    const isField = (el: EventTarget | null) => el instanceof HTMLElement && el.matches("input, textarea, select, [contenteditable]");
    const onIn = (event: FocusEvent) => setTyping(isField(event.target));
    const onOut = () => setTyping(false);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);

  // La bulle s'en va d'elle-même.
  useEffect(() => {
    if (!bubble) return;
    const id = setTimeout(() => setBubble(null), BUBBLE_MS);
    return () => clearTimeout(id);
  }, [bubble]);

  const minimise = (value: boolean) => {
    memory.current = { ...memory.current, minimised: value };
    writeMemory(memory.current);
    setMinimised(value);
    if (value) setBubble(null);
  };

  const shown = ready && allowed && !heroVisible && !(narrow && typing);

  // Jamais sur un bouton ni un lien : quand la page fait passer un élément cliquable sous lui (un appel, un bouton
  // « Voir le calcul »), il s'efface le temps qu'il soit passé.
  useEffect(() => {
    if (!shown) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const root = rootRef.current;
      const body = root?.querySelector("[data-companion-body]");
      if (!root || !body) return;
      const box = body.getBoundingClientRect();
      let covered = false;
      for (const fx of [0.1, 0.5, 0.9]) {
        for (const fy of [0.15, 0.5, 0.9]) {
          const under = document.elementsFromPoint(box.left + box.width * fx, box.top + box.height * fy).find((el) => !root.contains(el));
          if (under?.closest("a, button, input, select, textarea, label, [role=button]")) covered = true;
        }
      }
      setDodging(covered);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [shown, minimised]);

  if (!shown) return null;

  return (
    <div
      ref={rootRef}
      className={cn(
        "pointer-events-none fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex flex-col items-end gap-1.5 transition-opacity duration-200",
        dodging && "opacity-0 [&_*]:!pointer-events-none",
      )}
    >
      {bubble && !minimised && (
        <div key={bubble.at} role="status" className="rbt-bubble pointer-events-auto relative max-w-[15rem] origin-bottom-right rounded-2xl rounded-br-md border border-border-subtle bg-surface-card py-2 pr-8 pl-3.5 text-[14px] leading-5 font-medium text-text-primary shadow-lg">
          {bubble.text}
          <button
            type="button"
            onClick={() => setBubble(null)}
            className="absolute top-1/2 right-1 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-text-tertiary hover:bg-surface-sunken hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            aria-label="Fermer la bulle du robot"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
      {minimised ? (
        <button
          type="button"
          onClick={() => minimise(false)}
          data-companion-body=""
          className="rbt-arrive pointer-events-auto flex size-11 items-center justify-center rounded-full border border-border-subtle bg-surface-card shadow-md focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          aria-label="Afficher le robot PharmaBoost"
          title="Afficher le robot"
        >
          <Robot mood={mood} size={30} />
        </button>
      ) : (
        <div data-companion-body="" className="rbt-arrive pointer-events-auto relative flex items-end">
          <div className="mr-0.5 mb-1 flex flex-col gap-0.5 rounded-full border border-border-subtle bg-surface-card/90 p-0.5 shadow-sm backdrop-blur-sm">
            <RobotSoundToggle where="site" className="size-7" />
            <button
              type="button"
              onClick={() => minimise(true)}
              className="inline-flex size-7 items-center justify-center rounded-full text-text-tertiary hover:bg-surface-sunken hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
              aria-label="Réduire le robot"
              title="Réduire le robot"
            >
              <span aria-hidden="true" className="block h-0.5 w-3 rounded-full bg-current" />
            </button>
          </div>
          <Robot
            mood={mood}
            cheerKey={cheer}
            floating
            track
            interactive
            sound="site"
            className="h-[72px] w-[59px] drop-shadow-[0_10px_16px_rgba(15,60,70,0.22)] md:h-[88px] md:w-[72px]"
          />
        </div>
      )}
    </div>
  );
}
