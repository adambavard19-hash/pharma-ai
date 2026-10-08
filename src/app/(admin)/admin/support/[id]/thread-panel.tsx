"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCheck, RotateCcw, Send } from "lucide-react";
import { markSupportThreadReadBySupportAction, replyAsSupportAction, setSupportThreadClosedBySupportAction } from "@/server/actions/admin-support";
import { SUPPORT_BODY_MAX } from "@/core/support/rules";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PanelMessage = { id: string; author: "PHARMACY" | "SUPPORT"; authorName: string; body: string; createdAt: string };

/**
 * La conversation côté console : les messages de l'officine à gauche, ceux de l'équipe à droite, la réponse en bas.
 * Ouvrir la discussion la marque lue ; répondre prévient l'officine (la fenêtre dit comment).
 */
export function SupportThreadPanel({ threadId, messages, closed, unread, pharmacyName }: { threadId: string; messages: PanelMessage[]; closed: boolean; unread: boolean; pharmacyName: string }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { push } = useToast();

  useEffect(() => {
    if (unread) void markSupportThreadReadBySupportAction({ threadId });
  }, [unread, threadId, messages.length]);

  const send = () => {
    setError(null);
    start(async () => {
      const result = await replyAsSupportAction({ threadId, body });
      if (!result.ok) return setError(result.error);
      setBody("");
      push({ tone: "success", title: result.message ?? "Réponse envoyée." });
    });
  };

  const toggle = () =>
    start(async () => {
      const result = await setSupportThreadClosedBySupportAction({ threadId, closed: !closed });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Fait") : result.error });
    });

  return (
    <div className="space-y-5">
      <ol className="space-y-4" aria-label="Messages de la discussion">
        {messages.map((message) => {
          const fromSupport = message.author === "SUPPORT";
          return (
            <li key={message.id} className={cn("flex", fromSupport ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-2xl px-4 py-3", fromSupport ? "rounded-br-md bg-brand-50 dark:bg-brand-950/50" : "rounded-bl-md border border-border-subtle bg-surface-card shadow-card")}>
                <p className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-text-secondary">
                  <span className="font-semibold text-text-primary">{fromSupport ? message.authorName : `${message.authorName} · ${pharmacyName}`}</span>
                  <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
                </p>
                <p className="mt-1 text-[14.5px] leading-6 whitespace-pre-wrap text-text-primary">{message.body}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="space-y-3 rounded-2xl border border-border-subtle bg-surface-card p-4 shadow-card">
        {closed && <Alert tone="info">Cette discussion est fermée. Répondre la rouvre et prévient l&apos;officine.</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}
        <label className="block">
          <span className="sr-only">Votre réponse</span>
          <Textarea rows={5} value={body} maxLength={SUPPORT_BODY_MAX} onChange={(e) => setBody(e.target.value)} placeholder={`Votre réponse à ${pharmacyName}…`} />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={toggle} disabled={pending} leadingIcon={closed ? <RotateCcw className="size-4" /> : <CheckCheck className="size-4" />}>
            {closed ? "Rouvrir" : "Fermer la discussion"}
          </Button>
          <Button onClick={send} loading={pending} disabled={body.trim().length < 3} leadingIcon={<Send className="size-4" />}>
            Répondre
          </Button>
        </div>
        <p className="text-[12px] leading-4 text-text-tertiary">L&apos;officine reçoit votre réponse dans PharmaBoost (cloche et menu « Contact support ») et par e-mail.</p>
      </div>
    </div>
  );
}
