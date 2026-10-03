"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MousePointerClick, RotateCcw, Save, Send, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { unknownVariables, validateTemplateText, variablesIn, type EmailTemplateDefinition, type TemplateText } from "@/core/admin/email-templates";
import { previewTemplateEmailAction, sendTestEmailAction } from "@/server/actions/admin-email";
import { resetTemplateAction, saveTemplateAction } from "@/server/actions/admin-communication";
import { cn } from "@/lib/utils";

type FieldKey = keyof TemplateText;

const CONTROL = "w-full rounded-lg border border-border-default bg-surface-card px-3 text-[13.5px] text-text-primary shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none aria-[invalid=true]:border-danger-500";

const sameText = (a: TemplateText, b: TemplateText) => a.subject === b.subject && a.title === b.title && a.body === b.body;

/**
 * L'éditeur d'un modèle : objet, titre, texte, variables insérables d'un
 * clic, aperçu exact dans le gabarit PharmaBoost (valeurs d'exemple), test à
 * soi-même. Le serveur revalide tout à l'enregistrement.
 */
export function TemplateEditor({ definition, initialText, customized, adminEmail }: { definition: EmailTemplateDefinition; initialText: TemplateText; customized: boolean; adminEmail: string }) {
  const [text, setText] = useState<TemplateText>(initialText);
  const [saved, setSaved] = useState<TemplateText>(initialText);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  const subjectRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [lastField, setLastField] = useState<FieldKey>("body");

  const dirty = !sameText(text, saved);
  const unknown = useMemo(() => unknownVariables(definition, text), [definition, text]);
  const local = useMemo(() => validateTemplateText(definition, text), [definition, text]);
  const errors: Record<string, string> = { ...(local.ok ? {} : local.errors), ...serverErrors };
  const used = useMemo(() => new Set(variablesIn(`${text.subject}\n${text.title}\n${text.body}`)), [text]);

  // L'aperçu suit la saisie, avec un léger délai : valeurs d'exemple, jamais celles d'une officine.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await previewTemplateEmailAction({ templateKey: definition.key, text });
      if (cancelled) return;
      if (result.ok) {
        setPreview({ subject: result.data.subject, html: result.data.html });
        setPreviewError(null);
      } else setPreviewError(result.error);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [definition.key, text]);

  // Quitter la page avec des modifications non enregistrées demande confirmation au navigateur.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (key: FieldKey, value: string) => {
    setText((current) => ({ ...current, [key]: value }));
    if (serverErrors[key])
      setServerErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
  };

  /** Insère « {{variable}} » à la position du curseur, dans le dernier champ utilisé. */
  const insertVariable = (variable: string) => {
    const key = lastField;
    const element = key === "subject" ? subjectRef.current : key === "title" ? titleRef.current : bodyRef.current;
    const token = `{{${variable}}}`;
    const value = text[key];
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    update(key, value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      if (!element) return;
      element.focus();
      element.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = () =>
    startSave(async () => {
      const result = await saveTemplateAction({ key: definition.key, text });
      if (!result.ok) {
        setServerErrors(result.fieldErrors ?? {});
        push({ tone: "error", title: result.error });
        return;
      }
      setServerErrors({});
      setSaved(text);
      push({ tone: "success", title: result.message ?? "Modèle enregistré." });
      router.refresh();
    });

  const sendTest = () =>
    startTest(async () => {
      const result = await sendTestEmailAction({ templateKey: definition.key, text });
      if (!result.ok) {
        setServerErrors(result.fieldErrors ?? {});
        push({ tone: "error", title: result.error });
        return;
      }
      push({ tone: result.data.status === "SENT" ? "success" : "warning", title: result.message ?? "Test traité." });
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <section className="space-y-4 rounded-2xl border border-border-subtle bg-surface-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-text-primary">Texte du message</h2>
            {dirty ? <Badge tone="warning">Modifications non enregistrées</Badge> : <Badge tone={customized ? "brand" : "neutral"}>{customized ? "Personnalisé" : "Texte par défaut"}</Badge>}
          </div>

          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-text-primary">Objet</span>
            <input ref={subjectRef} value={text.subject} onChange={(e) => update("subject", e.target.value)} onFocus={() => setLastField("subject")} maxLength={160} aria-invalid={Boolean(errors.subject)} className={cn(CONTROL, "h-10")} />
            {errors.subject ? <span className="block text-[12px] text-danger-600">{errors.subject}</span> : <span className="block text-[12px] text-text-tertiary">Ce que le destinataire voit dans sa boîte de réception.</span>}
          </label>

          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-text-primary">Titre</span>
            <input ref={titleRef} value={text.title} onChange={(e) => update("title", e.target.value)} onFocus={() => setLastField("title")} maxLength={120} aria-invalid={Boolean(errors.title)} className={cn(CONTROL, "h-10")} />
            {errors.title ? <span className="block text-[12px] text-danger-600">{errors.title}</span> : <span className="block text-[12px] text-text-tertiary">Le grand titre en haut de l&apos;e-mail.</span>}
          </label>

          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-text-primary">Texte</span>
            <textarea ref={bodyRef} value={text.body} onChange={(e) => update("body", e.target.value)} onFocus={() => setLastField("body")} rows={14} maxLength={5000} aria-invalid={Boolean(errors.body)} className={cn(CONTROL, "py-2 font-mono text-[12.5px] leading-5")} />
            {errors.body ? <span className="block text-[12px] text-danger-600">{errors.body}</span> : <span className="block text-[12px] text-text-tertiary">Paragraphes séparés par une ligne vide. {text.body.length.toLocaleString("fr-FR")} / 5 000 caractères.</span>}
          </label>

          {unknown.length > 0 && (
            <Alert tone="danger" title="Variable inconnue pour ce modèle">
              {unknown.map((k) => `{{${k}}}`).join(", ")} : elle serait remplacée par un vide. Corrigez-la ou choisissez une variable dans la liste.
            </Alert>
          )}

          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
              <MousePointerClick className="size-4 text-text-tertiary" aria-hidden="true" />
              Variables disponibles
            </p>
            <p className="text-[12px] text-text-tertiary">Un clic insère la variable à l&apos;endroit du curseur, dans le dernier champ utilisé. Une variable sans valeur connue reste vide, jamais inventée.</p>
            <ul className="flex flex-wrap gap-1.5">
              {definition.variables.map((variable) => (
                <li key={variable.key}>
                  <button
                    type="button"
                    onClick={() => insertVariable(variable.key)}
                    title={`Exemple : ${variable.sample}`}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-[12px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
                      used.has(variable.key) ? "border-brand-300 bg-brand-50 text-brand-800 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-200" : "border-border-default bg-surface-card text-text-secondary hover:border-brand-300 hover:text-text-primary",
                    )}
                  >
                    <code className="font-mono text-[11.5px]">{`{{${variable.key}}}`}</code>
                    <span>{variable.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl bg-surface-sunken px-4 py-3 text-[12.5px] leading-5 text-text-secondary">
            {definition.button ? (
              <>
                <span className="font-medium text-text-primary">Bouton imposé par le modèle :</span> « {definition.button.label} », ajouté en fin de message. Son adresse vient du système ({definition.variables.find((v) => v.key === definition.button?.urlVariable)?.label.toLowerCase() ?? definition.button.urlVariable}) et ne se modifie pas.
              </>
            ) : (
              "Ce modèle n'a pas de bouton d'action : le message se termine par votre texte, puis le pied de page légal."
            )}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" leadingIcon={<Save className="size-4" />} loading={saving} disabled={!dirty || !local.ok} onClick={save}>
            Enregistrer
          </Button>
          {dirty && (
            <Button type="button" variant="ghost" leadingIcon={<Undo2 className="size-4" />} onClick={() => { setText(saved); setServerErrors({}); }}>
              Annuler les modifications
            </Button>
          )}
          <Button type="button" variant="outline" leadingIcon={<Send className="size-4" />} loading={testing} disabled={!local.ok} onClick={sendTest}>
            M&apos;envoyer un test
          </Button>
          <ConfirmAction
            label="Revenir au texte par défaut"
            icon={<RotateCcw className="size-4" />}
            variant="ghost"
            tone="danger"
            disabled={!customized}
            title="Revenir au texte par défaut ?"
            consequences={["Le texte par défaut, écrit par PharmaBoost, part dès le prochain envoi.", "Le texte personnalisé actuel reste consultable dans le journal d'audit.", "Les modifications non enregistrées sont perdues."]}
            confirmLabel="Rétablir le texte par défaut"
            onConfirm={async () => {
              const result = await resetTemplateAction({ key: definition.key });
              if (result.ok) {
                setText(definition.defaults);
                setSaved(definition.defaults);
                setServerErrors({});
              }
              return result;
            }}
          />
        </div>
        <p className="text-[12px] text-text-tertiary">Le test part à {adminEmail}, avec le texte en cours (même non enregistré) et des valeurs d&apos;exemple. Son objet commence par « [Test] ».</p>
      </div>

      <div className="min-w-0 lg:sticky lg:top-36 lg:self-start">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-text-primary">Aperçu</p>
          <Badge tone="info">Valeurs d&apos;exemple</Badge>
        </div>
        {previewError ? (
          <p className="flex h-[560px] items-center justify-center rounded-2xl bg-danger-50 px-6 text-center text-[13px] text-danger-700 dark:bg-danger-700/15 dark:text-danger-500" role="alert">
            {previewError}
          </p>
        ) : preview ? (
          <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-card">
            <p className="truncate border-b border-border-subtle bg-surface-sunken px-4 py-2.5 text-[12.5px] text-text-secondary">
              <span className="text-text-tertiary">Objet :</span> <span className="font-medium text-text-primary">{preview.subject}</span>
            </p>
            <iframe title="Aperçu de l'e-mail" srcDoc={preview.html} sandbox="" className="h-[560px] w-full bg-white" />
          </div>
        ) : (
          <div className="h-[600px] animate-pulse rounded-2xl bg-surface-sunken motion-reduce:animate-none" aria-busy="true" aria-label="Préparation de l'aperçu" />
        )}
      </div>
    </div>
  );
}
