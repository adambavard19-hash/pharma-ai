"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CornerDownLeft, PencilLine, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

/**
 * Un parcours « une question à la fois » : une seule question à l'écran, de
 * grandes réponses cliquables, Entrée pour continuer, retour sans perte, un
 * brouillon gardé dans le navigateur et un récapitulatif modifiable avant
 * l'envoi. Les règles restent celles du serveur : le parcours ne fait que les
 * appliquer question par question, et l'action serveur reste seule juge.
 */
export type FlowErrors = Record<string, string | undefined>;

export type StepApi<V> = {
  values: V;
  errors: FlowErrors;
  set: <K extends keyof V>(key: K, value: V[K]) => void;
  patch: (partial: Partial<V>) => void;
  /** Une réponse fermée : enregistrée, puis la question suivante s'affiche. */
  choose: <K extends keyof V>(key: K, value: V[K]) => void;
  next: () => void;
};

export type FlowStep<V> = {
  id: string;
  /** La rubrique, au-dessus de la question (« L'officine »). */
  section: string;
  question: ReactNode | ((values: V) => ReactNode);
  help?: ReactNode | ((values: V) => ReactNode);
  /** Les champs que remplit cette question : une erreur du serveur ramène à la bonne question. */
  fields: readonly string[];
  /** Facultative : « Passer » remplace « Continuer » tant qu'elle est vide. */
  optional?: boolean;
  isEmpty?: (values: V) => boolean;
  /** Une question qui ne se pose que dans certains cas. */
  when?: (values: V) => boolean;
  validate?: (values: V) => FlowErrors;
  /** Temps de réponse estimé, pour « 1 min » dans la barre de progression. */
  seconds?: number;
  render: (api: StepApi<V>) => ReactNode;
  recap?: { label: string; value: (values: V) => ReactNode | null };
};

export type FlowResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type FinalApi<V> = { values: V; errors: FlowErrors; set: <K extends keyof V>(key: K, value: V[K]) => void };

type Position = { kind: "step"; id: string } | { kind: "recap" };

const DRAFT_PREFIX = "pharmaboost:parcours:";
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RECAP_SECONDS = 15;

export function Flow<V extends Record<string, unknown>>({
  name,
  steps,
  initialValues,
  pinned = [],
  ephemeral = [],
  honeypot,
  aside,
  recapTitle = "Tout est prêt. Un dernier coup d'œil ?",
  recapHelp = "Touchez une ligne pour la modifier : vous revenez ici ensuite.",
  final,
  submitLabel,
  submitHint,
  canSubmit,
  onSubmit,
  autoFocus = false,
}: {
  /** Clé du brouillon dans le navigateur. */
  name: string;
  steps: FlowStep<V>[];
  initialValues: V;
  /** Valeurs venues du serveur (code de parrainage, invitation) qu'un brouillon ne remplace pas. */
  pinned?: (keyof V & string)[];
  /** Valeurs jamais gardées en brouillon (consentement, confirmation). */
  ephemeral?: (keyof V & string)[];
  /** Le champ caché qu'un robot remplit et qu'une personne ne voit pas. */
  honeypot?: keyof V & string;
  aside?: (values: V) => ReactNode;
  recapTitle?: ReactNode;
  recapHelp?: ReactNode;
  final?: (api: FinalApi<V>) => ReactNode;
  submitLabel: string;
  submitHint?: ReactNode;
  canSubmit?: (values: V) => boolean;
  onSubmit: (values: V) => Promise<FlowResult>;
  /** Place le curseur dans la première question dès l'arrivée (pages dédiées, souris uniquement). */
  autoFocus?: boolean;
}) {
  const [values, setValues] = useState<V>(initialValues);
  const [position, setPosition] = useState<Position>(() => (steps[0] ? { kind: "step", id: steps[0].id } : { kind: "recap" }));
  const [errors, setErrors] = useState<FlowErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [editing, setEditing] = useState(false);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const valuesRef = useRef(values);
  const touched = useRef(false);
  const interacted = useRef(false);
  const stageRef = useRef<HTMLFormElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const advanceTimer = useRef<number | null>(null);
  useLayoutEffect(() => {
    valuesRef.current = values;
  });

  const visible = useMemo(() => steps.filter((step) => !step.when || step.when(values)), [steps, values]);
  const index = position.kind === "recap" ? visible.length : Math.max(0, visible.findIndex((s) => s.id === position.id));
  const step = position.kind === "step" ? visible[index] : undefined;
  const total = visible.length + 1;
  const positionKey = position.kind === "recap" ? "recap" : position.id;

  // ---- Brouillon ----------------------------------------------------------
  const storageKey = DRAFT_PREFIX + name;
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as { v: number; values: Partial<V>; at: number; position: string };
      if (draft.v !== 1 || Date.now() - draft.at > DRAFT_TTL_MS) {
        window.localStorage.removeItem(storageKey);
        return;
      }
      const restored = { ...initialValues };
      for (const key of Object.keys(initialValues) as (keyof V & string)[]) {
        if (ephemeral.includes(key) || key === honeypot || !(key in draft.values)) continue;
        if (pinned.includes(key) && initialValues[key]) continue;
        const value = draft.values[key];
        if (typeof value === typeof initialValues[key]) restored[key] = value as V[typeof key];
      }
      valuesRef.current = restored;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- le brouillon n'existe que dans le navigateur, lu une fois après l'hydratation
      setValues(restored);
      const target = draft.position === "recap" ? { kind: "recap" as const } : steps.some((s) => s.id === draft.position) ? { kind: "step" as const, id: draft.position } : null;
      if (target) setPosition(target);
      setRestoredAt(draft.at);
      touched.current = true;
    } catch {
      // Stockage indisponible (navigation privée, réglages) : on part d'une page blanche.
    }
    // Lecture unique, à l'arrivée sur la page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!touched.current) return;
    const timer = window.setTimeout(() => {
      // Envoyé entre-temps : le brouillon a été effacé, il ne revient pas.
      if (!touched.current) return;
      try {
        const kept: Partial<V> = {};
        for (const key of Object.keys(values) as (keyof V & string)[]) {
          if (!ephemeral.includes(key) && key !== honeypot) kept[key] = values[key];
        }
        window.localStorage.setItem(storageKey, JSON.stringify({ v: 1, values: kept, at: Date.now(), position: positionKey }));
      } catch {
        // Pas de brouillon possible : le parcours fonctionne quand même.
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [values, positionKey, storageKey, ephemeral, honeypot]);

  const clearDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // rien à effacer
    }
  }, [storageKey]);

  const restart = () => {
    clearDraft();
    touched.current = false;
    valuesRef.current = initialValues;
    setValues(initialValues);
    setErrors({});
    setGlobalError(null);
    setEditing(false);
    setRestoredAt(null);
    setDirection(-1);
    setPosition(steps[0] ? { kind: "step", id: steps[0].id } : { kind: "recap" });
  };

  // ---- Valeurs ------------------------------------------------------------
  const clearErrors = (keys: string[]) => setErrors((prev) => (keys.some((k) => prev[k]) ? Object.fromEntries(Object.entries(prev).filter(([k]) => !keys.includes(k))) : prev));
  const commit = (nextValues: V, keys: string[]) => {
    touched.current = true;
    interacted.current = true;
    valuesRef.current = nextValues;
    setValues(nextValues);
    clearErrors(keys);
  };
  const set = <K extends keyof V>(key: K, value: V[K]) => commit({ ...valuesRef.current, [key]: value }, [key as string]);
  const patch = (partial: Partial<V>) => commit({ ...valuesRef.current, ...partial }, Object.keys(partial));

  // ---- Navigation ---------------------------------------------------------
  const goTo = (target: Position, dir: 1 | -1) => {
    interacted.current = true;
    setDirection(dir);
    setPosition(target);
  };

  const advance = (current: V) => {
    if (!step) return;
    const found = Object.fromEntries(Object.entries(step.validate?.(current) ?? {}).filter(([, message]) => message)) as FlowErrors;
    if (Object.keys(found).length) {
      setErrors(found);
      requestAnimationFrame(() => contentRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setErrors({});
    setGlobalError(null);
    if (editing) {
      setEditing(false);
      goTo({ kind: "recap" }, 1);
      return;
    }
    const list = steps.filter((s) => !s.when || s.when(current));
    const at = list.findIndex((s) => s.id === step.id);
    const following = list[at + 1];
    goTo(following ? { kind: "step", id: following.id } : { kind: "recap" }, 1);
  };

  const next = () => advance(valuesRef.current);

  const choose = <K extends keyof V>(key: K, value: V[K]) => {
    set(key, value);
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    // Le temps de voir la réponse cochée, puis la question suivante.
    advanceTimer.current = window.setTimeout(() => advance(valuesRef.current), 260);
  };
  useEffect(() => () => {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
  }, []);

  const back = () => {
    setErrors({});
    setGlobalError(null);
    if (editing) {
      setEditing(false);
      goTo({ kind: "recap" }, 1);
      return;
    }
    const previous = visible[index - 1];
    if (previous) goTo({ kind: "step", id: previous.id }, -1);
  };

  const edit = (id: string) => {
    setEditing(true);
    goTo({ kind: "step", id }, -1);
  };

  // ---- Envoi --------------------------------------------------------------
  const submit = () => {
    if (pending) return;
    // Chaque question est revérifiée : un brouillon ancien ou une question passée ne part pas tel quel.
    const current = valuesRef.current;
    for (const s of visible) {
      const found = Object.fromEntries(Object.entries(s.validate?.(current) ?? {}).filter(([, m]) => m)) as FlowErrors;
      if (Object.keys(found).length) {
        setErrors(found);
        setEditing(true);
        goTo({ kind: "step", id: s.id }, -1);
        return;
      }
    }
    setGlobalError(null);
    start(async () => {
      const result = await onSubmit(current);
      if (result.ok) {
        clearDraft();
        touched.current = false;
        return;
      }
      const fieldErrors = result.fieldErrors ?? {};
      const target = visible.find((s) => s.fields.some((f) => fieldErrors[f]));
      setGlobalError(result.error);
      setErrors(fieldErrors);
      if (target) {
        setEditing(true);
        goTo({ kind: "step", id: target.id }, -1);
      }
    });
  };

  const onFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (position.kind === "recap") submit();
    else next();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Enter" && !event.defaultPrevented && event.target === contentRef.current) {
      event.preventDefault();
      if (position.kind === "recap") submit();
      else next();
      return;
    }
    // Dans un texte long, Entrée va à la ligne ; ⌘ ou Ctrl + Entrée continue.
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && event.target instanceof HTMLTextAreaElement) {
      event.preventDefault();
      if (position.kind === "recap") submit();
      else next();
    }
  };

  // ---- Focus : la question qui arrive reçoit le curseur -------------------
  useEffect(() => {
    if (!interacted.current && !(autoFocus && window.matchMedia("(pointer: fine)").matches)) return;
    const frame = requestAnimationFrame(() => {
      const root = contentRef.current;
      if (!root) return;
      const stage = stageRef.current;
      if (interacted.current && stage) {
        // La question et son bouton tiennent dans l'écran : on ne fait défiler que s'ils en sortent.
        const rect = stage.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) stage.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
      // Un champ à remplir reçoit le curseur ; une question à cartes, elle, garde le focus sur elle-même :
      // Entrée y passe à la suite (ou « Passer »), sans choisir d'office la première carte.
      const target =
        root.querySelector<HTMLElement>("[data-autofocus]") ??
        root.querySelector<HTMLElement>('[aria-invalid="true"]') ??
        root.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ??
        root.querySelector<HTMLElement>('input:not([type="hidden"]):not([tabindex="-1"]), textarea') ??
        root;
      target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [positionKey, autoFocus]);

  // ---- Affichage ----------------------------------------------------------
  const remaining = visible.slice(index).reduce((sum, s) => sum + (s.seconds ?? 10), 0) + RECAP_SECONDS;
  const remainingLabel = position.kind === "recap" ? "dernière étape" : remaining < 50 ? "moins d'une minute" : `${Math.max(1, Math.round(remaining / 60))} min`;
  const progress = Math.min(1, (index + (position.kind === "recap" ? 1 : 0.35)) / total);
  const api: StepApi<V> = { values, errors, set, patch, choose, next };
  const empty = step ? (step.isEmpty ? step.isEmpty(values) : step.fields.every((f) => !values[f as keyof V] || (Array.isArray(values[f as keyof V]) && (values[f as keyof V] as unknown[]).length === 0))) : false;
  const allowed = canSubmit ? canSubmit(values) : true;

  return (
    <div className={cn("grid grid-cols-1 gap-6", aside && "lg:grid-cols-[minmax(0,1fr)_19.5rem] lg:gap-8")}>
      <form
        ref={stageRef}
        onSubmit={onFormSubmit}
        onKeyDown={onKeyDown}
        noValidate
        data-flow-stage=""
        className="relative flex min-h-[24rem] scroll-mt-24 flex-col rounded-[28px] border border-border-subtle bg-surface-card shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)] sm:min-h-[36rem]"
        aria-label="Formulaire"
      >
        {/* Progression */}
        <div className="px-5 pt-5 sm:px-10 sm:pt-8">
          <div className="flex items-center justify-between gap-3 text-[12.5px] font-medium text-text-tertiary">
            <span aria-live="polite">
              {position.kind === "recap" ? `Récapitulatif · étape ${total} sur ${total}` : `Étape ${index + 1} sur ${total}`}
              <span className="text-text-tertiary/80"> · {remainingLabel}</span>
            </span>
            {restoredAt && (
              <button type="button" onClick={restart} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] text-text-tertiary hover:bg-surface-sunken hover:text-text-primary">
                <RotateCcw className="size-3.5" aria-hidden="true" /> Recommencer
              </button>
            )}
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index + 1} aria-label="Progression">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-[#0796b4] transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${Math.max(4, progress * 100)}%` }} />
          </div>
          {restoredAt && index === 0 && position.kind === "step" && (
            <p className="mt-3 text-[12.5px] text-text-tertiary">Votre saisie du {new Date(restoredAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} a été gardée sur cet appareil.</p>
          )}
        </div>

        {/* Question */}
        <div ref={contentRef} key={positionKey} tabIndex={-1} style={{ outline: "none" }} className={cn("flex flex-1 flex-col px-5 pt-8 pb-6 sm:px-10 sm:pt-12", direction === 1 ? "motion-safe:animate-slide-up" : "motion-safe:animate-fade-in")}>
          {step ? (
            <>
              <p className="font-mono text-[11.5px] tracking-[0.14em] text-brand-700 uppercase">{step.section}</p>
              <h2 className="mt-3 max-w-2xl text-[25px] leading-[1.15] font-semibold tracking-[-0.025em] text-text-primary text-balance sm:text-[32px]">{typeof step.question === "function" ? step.question(values) : step.question}</h2>
              {step.help && <p className="mt-3 max-w-xl text-[15px] leading-6 text-text-secondary">{typeof step.help === "function" ? step.help(values) : step.help}</p>}
              {globalError && <div className="mt-5 max-w-xl"><Alert tone="danger">{globalError}</Alert></div>}
              <div className="@container mt-7 max-w-2xl"><RenderProp render={step.render} api={api} /></div>
            </>
          ) : (
            <>
              <p className="font-mono text-[11.5px] tracking-[0.14em] text-brand-700 uppercase">Récapitulatif</p>
              <h2 className="mt-3 max-w-2xl text-[25px] leading-[1.15] font-semibold tracking-[-0.025em] text-text-primary text-balance sm:text-[32px]">{recapTitle}</h2>
              <p className="mt-3 max-w-xl text-[15px] leading-6 text-text-secondary">{recapHelp}</p>
              <Recap steps={visible} values={values} onEdit={edit} />
              {final && <div className="mt-6 max-w-2xl"><RenderProp render={final} api={{ values, errors, set }} /></div>}
              {globalError && <div className="mt-5 max-w-2xl"><Alert tone="danger">{globalError}</Alert></div>}
            </>
          )}
        </div>

        {honeypot && (
          <div className="absolute -left-[9999px] top-auto" aria-hidden="true">
            <label htmlFor={`${name}-${honeypot}`}>Site web</label>
            <input id={`${name}-${honeypot}`} tabIndex={-1} autoComplete="off" value={String(values[honeypot] ?? "")} onChange={(e) => setValues((prev) => ({ ...prev, [honeypot]: e.target.value }))} />
          </div>
        )}

        {/* Navigation */}
        <div className="flex flex-col-reverse gap-3 border-t border-border-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-10 sm:py-5">
          {index > 0 || editing ? (
            <Button type="button" variant="ghost" onClick={back} leadingIcon={<ArrowLeft className="size-4" />} className="self-start">
              {editing ? "Récapitulatif" : "Retour"}
            </Button>
          ) : (
            <span className="hidden text-[12.5px] text-text-tertiary sm:block">Aucune donnée patient n&apos;est demandée.</span>
          )}
          <div className="flex items-center gap-3 sm:ml-auto">
            {position.kind === "step" && (
              <span className="hidden items-center gap-1.5 text-[12px] text-text-tertiary md:inline-flex">
                ou <kbd className="inline-flex items-center gap-1 rounded-md border border-border-default bg-surface-sunken px-1.5 py-0.5 font-sans text-[11px] font-semibold text-text-secondary">Entrée <CornerDownLeft className="size-3" aria-hidden="true" /></kbd>
              </span>
            )}
            {position.kind === "step" ? (
              <Button type="submit" size="xl" className="w-full sm:w-auto" trailingIcon={<ArrowRight className="size-4" />}>
                {editing ? "Valider" : step?.optional && empty ? "Passer" : "Continuer"}
              </Button>
            ) : (
              <Button type="submit" size="xl" className="w-full sm:w-auto" loading={pending} disabled={!allowed}>
                {pending ? "Envoi en cours…" : submitLabel}
              </Button>
            )}
          </div>
        </div>
        {position.kind === "recap" && submitHint && <p className="-mt-2 px-5 pb-5 text-[12.5px] text-text-tertiary sm:px-10 sm:text-right">{submitHint}</p>}
      </form>

      {aside && <aside className="hidden lg:block">{aside(values)}</aside>}
    </div>
  );
}

/** Une question rendue comme un composant : ses gestionnaires ne s'exécutent qu'aux interactions, jamais au rendu. */
function RenderProp<A>({ render, api }: { render: (api: A) => ReactNode; api: A }) {
  return <>{render(api)}</>;
}

function Recap<V extends Record<string, unknown>>({ steps, values, onEdit }: { steps: FlowStep<V>[]; values: V; onEdit: (id: string) => void }) {
  const sections: { title: string; rows: { id: string; label: string; value: ReactNode | null }[] }[] = [];
  for (const step of steps) {
    if (!step.recap) continue;
    const row = { id: step.id, label: step.recap.label, value: step.recap.value(values) };
    // Une rubrique rassemble ses réponses, même posées à des moments différents du parcours.
    const section = sections.find((s) => s.title === step.section);
    if (section) section.rows.push(row);
    else sections.push({ title: step.section, rows: [row] });
  }
  return (
    <div className="mt-7 max-w-2xl space-y-5">
      {sections.map((section) => (
        <section key={section.title}>
          <h3 className="font-mono text-[11px] tracking-[0.14em] text-text-tertiary uppercase">{section.title}</h3>
          <ul className="mt-2 divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle">
            {section.rows.map((row) => (
              <li key={row.id}>
                <button type="button" onClick={() => onEdit(row.id)} className="group flex w-full items-start gap-4 px-4 py-3 text-left transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none">
                  <span className="min-w-0 flex-1 sm:flex sm:gap-4">
                    <span className="block text-[12.5px] text-text-tertiary sm:w-40 sm:shrink-0 sm:pt-0.5 sm:text-[13px]">{row.label}</span>
                    <span className={cn("mt-0.5 block min-w-0 text-[15px] leading-6 break-words sm:mt-0 sm:flex-1", row.value ? "text-text-primary" : "text-text-tertiary italic")}>{row.value || "Non renseigné"}</span>
                  </span>
                  <PencilLine className="mt-1 size-4 shrink-0 text-text-tertiary opacity-60 transition-opacity group-hover:opacity-100" aria-label="Modifier" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
