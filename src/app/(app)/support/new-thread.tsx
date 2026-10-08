"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, ShieldCheck } from "lucide-react";
import { createSupportThreadAction } from "@/server/actions/support";
import { SUPPORT_BODY_MAX, SUPPORT_PRIVACY_NOTICE, SUPPORT_SUBJECT_MAX, SUPPORT_TOPICS, type SupportTopicCode } from "@/core/support/rules";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** « Nouvelle question » : le type, un sujet facultatif, le message — et le rappel de ne jamais citer un patient. */
export function NewSupportThread({ disabledReason }: { disabledReason: string | null }) {
  const [topic, setTopic] = useState<SupportTopicCode>("QUESTION");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  const submit = () => {
    setError(null);
    start(async () => {
      const result = await createSupportThreadAction({ topic, subject: subject.trim() || undefined, body });
      if (!result.ok) return setError(result.error);
      push({ tone: "success", title: result.message ?? "Message envoyé" });
      setBody("");
      setSubject("");
      router.push(`/support/${result.data.threadId}`);
    });
  };

  return (
    <div className="space-y-4">
      {disabledReason && <Alert tone="info">{disabledReason}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}

      <div role="radiogroup" aria-label="Type de message" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {SUPPORT_TOPICS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={topic === option.value}
            onClick={() => setTopic(option.value)}
            className={cn("rounded-xl border px-3.5 py-3 text-left transition-colors", topic === option.value ? "border-brand-500 bg-brand-50 dark:bg-brand-950/50" : "border-border-default hover:bg-surface-sunken")}
          >
            <span className="block text-[13.5px] font-semibold text-text-primary">{option.label}</span>
            <span className="block text-[12px] leading-4 text-text-secondary">{option.hint}</span>
          </button>
        ))}
      </div>

      <Field label="Sujet" htmlFor="support-subject" hint="Facultatif : à défaut, nous reprenons les premiers mots de votre message.">
        <Input id="support-subject" value={subject} maxLength={SUPPORT_SUBJECT_MAX} onChange={(e) => setSubject(e.target.value)} placeholder="Ex. : mon stock ne se met pas à jour" />
      </Field>

      <Field label="Votre message" htmlFor="support-body" required>
        <Textarea id="support-body" rows={5} value={body} maxLength={SUPPORT_BODY_MAX} onChange={(e) => setBody(e.target.value)} placeholder="Décrivez ce que vous voyez, ce que vous attendiez, et depuis quand." />
      </Field>

      <p className="flex items-start gap-2 text-[12.5px] leading-5 text-text-secondary">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" />
        {SUPPORT_PRIVACY_NOTICE}
      </p>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-text-tertiary tabular">{body.length.toLocaleString("fr-FR")} / {SUPPORT_BODY_MAX.toLocaleString("fr-FR")}</span>
        <Button onClick={submit} loading={pending} disabled={body.trim().length < 3 || Boolean(disabledReason)} leadingIcon={<Send className="size-4" />}>
          Envoyer à l&apos;équipe PharmaBoost
        </Button>
      </div>
    </div>
  );
}
