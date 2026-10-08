"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCheck, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { markSupportThreadReadAction, replySupportThreadAction, setSupportThreadClosedAction } from "@/server/actions/support";
import { SUPPORT_BODY_MAX, SUPPORT_PRIVACY_NOTICE } from "@/core/support/rules";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ConversationMessage = { id: string; author: "PHARMACY" | "SUPPORT"; authorName: string; body: string; createdAt: string };

/**
 * La conversation : les messages de l'officine à droite, ceux de l'équipe PharmaBoost à gauche, le champ de réponse en bas.
 * Ouvrir la discussion la marque lue (le point du menu et la notification de la cloche disparaissent).
 */
export function SupportConversation({ threadId, messages, closed, unread, disabledReason }: { threadId: string; messages: ConversationMessage[]; closed: boolean; unread: boolean; disabledReason: string | null }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { push } = useToast();

  useEffect(() => {
    if (unread) void markSupportThreadReadAction({ threadId });
  }, [unread, threadId, messages.length]);

  const send = () => {
    setError(null);
    start(async () => {
      const result = await replySupportThreadAction({ threadId, body });
      if (!result.ok) return setError(result.error);
      setBody("");
      push({ tone: "success", title: closed ? "Discussion rouverte, message envoyé." : (result.message ?? "Message envoyé.") });
    });
  };

  const toggleClosed = () =>
    start(async () => {
      const result = await setSupportThreadClosedAction({ threadId, closed: !closed });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Fait") : result.error });
    });

  return (
    <div className="space-y-5">
      <ol className="space-y-4" aria-label="Messages de la discussion">
        {messages.map((message) => {
          const mine = message.author === "PHARMACY";
          return (
            <li key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-2xl px-4 py-3", mine ? "rounded-br-md bg-brand-50 dark:bg-brand-950/50" : "rounded-bl-md border border-border-subtle bg-surface-card shadow-card")}>
                <p className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-text-secondary">
                  <span className="font-semibold text-text-primary">{mine ? message.authorName : message.authorName || "Équipe PharmaBoost"}</span>
                  <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
                </p>
                <p className="mt-1 text-[14.5px] leading-6 whitespace-pre-wrap text-text-primary">{message.body}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="space-y-3 rounded-2xl border border-border-subtle bg-surface-card p-4 shadow-card">
        {closed && <Alert tone="info">Cette discussion est terminée. Écrire de nouveau la rouvre.</Alert>}
        {disabledReason && <Alert tone="info">{disabledReason}</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}
        <label className="block">
          <span className="sr-only">Votre réponse</span>
          <Textarea rows={4} value={body} maxLength={SUPPORT_BODY_MAX} onChange={(e) => setBody(e.target.value)} placeholder="Votre réponse…" />
        </label>
        <p className="flex items-start gap-2 text-[12.5px] leading-5 text-text-secondary">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" />
          {SUPPORT_PRIVACY_NOTICE}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={toggleClosed} disabled={pending} leadingIcon={closed ? <RotateCcw className="size-4" /> : <CheckCheck className="size-4" />}>
            {closed ? "Rouvrir la discussion" : "C'est réglé, terminer"}
          </Button>
          <Button onClick={send} loading={pending} disabled={body.trim().length < 3 || Boolean(disabledReason)} leadingIcon={<Send className="size-4" />}>
            Envoyer
          </Button>
        </div>
      </div>
    </div>
  );
}
