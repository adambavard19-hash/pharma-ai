"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Send } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { previewTemplateEmailAction, sendManualEmailAction } from "@/server/actions/admin-email";

export type ContactTemplateOption = { key: string; label: string; category: string; audience: string; text: { subject: string; title: string; body: string } };

/**
 * « Contacter » : un modèle, ajustable, avec l'aperçu exact de ce qui partira
 * (valeurs réelles du destinataire), puis l'envoi tracé dans l'historique.
 */
export function ContactDialog({
  pharmacyId,
  prospectId,
  templates,
  defaultTemplateKey,
  label = "Contacter",
  variant = "secondary",
  size = "sm",
  audience,
}: {
  pharmacyId?: string;
  prospectId?: string;
  templates: ContactTemplateOption[];
  defaultTemplateKey?: string;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  /** Ne propose que les modèles de ce public (« Titulaire », « Prospect »). */
  audience?: string;
}) {
  const options = useMemo(() => (audience ? templates.filter((t) => t.audience === audience || t.key === "generic.message") : templates), [templates, audience]);
  const initial = options.find((t) => t.key === defaultTemplateKey) ?? options[0];
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(initial?.key ?? "");
  const [text, setText] = useState(initial?.text ?? { subject: "", title: "", body: "" });
  const [preview, setPreview] = useState<{ subject: string; html: string; recipient: string | null } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  const choose = (nextKey: string) => {
    const t = options.find((o) => o.key === nextKey);
    if (!t) return;
    setKey(t.key);
    setText(t.text);
    setErrors({});
  };

  useEffect(() => {
    if (!open || !key) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await previewTemplateEmailAction({ templateKey: key, pharmacyId, prospectId, text });
      if (!cancelled && result.ok) setPreview(result.data);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, key, text, pharmacyId, prospectId]);

  const send = () => {
    start(async () => {
      const result = await sendManualEmailAction({ templateKey: key, pharmacyId, prospectId, text });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        push({ tone: "error", title: result.error });
        return;
      }
      push({ tone: result.data.status === "SENT" ? "success" : "warning", title: result.message ?? "E-mail traité." });
      setOpen(false);
      router.refresh();
    });
  };

  if (!initial) return null;

  return (
    <>
      <Button type="button" variant={variant} size={size} leadingIcon={<Mail className="size-4" />} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        size="xl"
        title="Écrire un e-mail"
        description={preview?.recipient ? `Destinataire : ${preview.recipient}` : "Le destinataire est le titulaire de l'officine, ou le contact du dossier."}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] text-text-tertiary">L&apos;envoi est tracé dans l&apos;historique des communications et le journal d&apos;audit.</p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Annuler
              </Button>
              <Button type="button" onClick={send} loading={pending} leadingIcon={<Send className="size-4" />} disabled={!preview?.recipient}>
                Envoyer
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-[13px] font-medium text-text-primary">Modèle</span>
              <select value={key} onChange={(e) => choose(e.target.value)} className="h-10 w-full rounded-lg border border-border-default bg-surface-card px-3 text-[13.5px] text-text-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none">
                {options.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.category} — {t.label}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Objet" error={errors.subject}>
              <input value={text.subject} onChange={(e) => setText({ ...text, subject: e.target.value })} className="h-10 w-full rounded-lg border border-border-default bg-surface-card px-3 text-[13.5px] text-text-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none" />
            </Field>
            <Field label="Titre" error={errors.title}>
              <input value={text.title} onChange={(e) => setText({ ...text, title: e.target.value })} className="h-10 w-full rounded-lg border border-border-default bg-surface-card px-3 text-[13.5px] text-text-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none" />
            </Field>
            <Field label="Texte" error={errors.body} hint="Paragraphes séparés par une ligne vide. Variables entre doubles accolades : {{prenom}}, {{officine}}…">
              <textarea value={text.body} onChange={(e) => setText({ ...text, body: e.target.value })} rows={12} className="w-full rounded-lg border border-border-default bg-surface-card px-3 py-2 font-mono text-[12.5px] leading-5 text-text-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none" />
            </Field>
          </div>
          <div className="min-w-0">
            <p className="mb-1.5 text-[13px] font-medium text-text-primary">Aperçu</p>
            {preview ? (
              <div className="overflow-hidden rounded-xl border border-border-subtle">
                <p className="truncate border-b border-border-subtle bg-surface-sunken px-3 py-2 text-[12.5px] text-text-secondary">
                  <span className="text-text-tertiary">Objet :</span> {preview.subject}
                </p>
                <iframe title="Aperçu de l'e-mail" srcDoc={preview.html} sandbox="" className="h-[440px] w-full bg-white" />
              </div>
            ) : (
              <p className="flex h-[440px] items-center justify-center rounded-xl bg-surface-sunken text-[13px] text-text-tertiary">Préparation de l&apos;aperçu…</p>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-text-primary">{label}</span>
      {children}
      {error ? <span className="block text-[12px] text-danger-600">{error}</span> : hint ? <span className="block text-[12px] text-text-tertiary">{hint}</span> : null}
    </label>
  );
}
