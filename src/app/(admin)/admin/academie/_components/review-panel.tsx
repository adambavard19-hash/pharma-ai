"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, CalendarClock, CheckCircle2, EyeOff, RotateCcw, Send, ShieldAlert, XCircle } from "lucide-react";
import { publishAcademyContentAction, publishAcademyModuleAction, reviewAcademyContentAction, reviewAcademyModuleAction } from "@/server/actions/platform-academy";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/server/actions/types";

type ReviewPayload = { type: "SUBMIT" } | { type: "APPROVE"; reviewerName: string; reviewerIsPharmacist: boolean } | { type: "REJECT"; note: string } | { type: "ARCHIVE" } | { type: "RESTORE" };

/**
 * La relecture et la publication, pas à pas : BROUILLON → EN RELECTURE → APPROUVÉ (nom du relecteur, case
 * « Relu par un pharmacien ») ou REFUSÉ (motif) → mise en ligne (date, fin de validité). Les règles sont vérifiées
 * par le serveur ; la console n'affiche que les gestes possibles dans l'état courant.
 */
export function ReviewPanel({
  target,
  id,
  status,
  medicine = false,
  published,
  validUntil,
  reviewNote,
}: {
  target: "content" | "module";
  id: string;
  status: string;
  medicine?: boolean;
  published: boolean;
  validUntil?: string | null;
  reviewNote?: string | null;
}) {
  const [reviewer, setReviewer] = useState("");
  const [pharmacist, setPharmacist] = useState(false);
  const [note, setNote] = useState("");
  const [publishOn, setPublishOn] = useState("");
  const [until, setUntil] = useState(validUntil ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  const run = (work: () => Promise<ActionResult<null>>) =>
    start(async () => {
      const result = await work();
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Fait.") : result.error });
      if (result.ok) router.refresh();
    });

  const review = (action: ReviewPayload) => run(() => (target === "content" ? reviewAcademyContentAction({ contentId: id, action }) : reviewAcademyModuleAction({ moduleId: id, action })));
  const publish = (on: boolean) => run(() => (target === "content" ? publishAcademyContentAction({ contentId: id, publish: on, publishOn, validUntil: until }) : publishAcademyModuleAction({ moduleId: id, publish: on })));

  return (
    <div className="space-y-4">
      {status === "REJECTED" && reviewNote && (
        <p className="rounded-xl bg-danger-50 px-4 py-3 text-[13px] leading-5 text-danger-800">
          <strong className="font-semibold">Motif du refus :</strong> {reviewNote}
        </p>
      )}

      {(status === "DRAFT" || status === "REJECTED") && (
        <div className="space-y-2">
          <p className="text-[13px] text-text-secondary">{status === "REJECTED" ? "Corrigez, puis renvoyez en relecture." : "Quand le contenu est prêt (vidéo ou texte, quiz), envoyez-le en relecture."}</p>
          <Button type="button" loading={pending} onClick={() => review({ type: "SUBMIT" })} leadingIcon={<Send className="size-4" aria-hidden="true" />}>
            Envoyer en relecture
          </Button>
        </div>
      )}

      {status === "IN_REVIEW" && (
        <div className="space-y-4">
          {medicine && (
            <p className="flex gap-2 rounded-xl bg-warning-50 px-4 py-3 text-[13px] leading-5 text-warning-800">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Contenu sur le médicament : il ne peut être approuvé que par un pharmacien.
            </p>
          )}
          <div className="space-y-3 rounded-xl border border-success-200 bg-success-50/40 p-4">
            <Field label="Relecteur (nom et qualité)" htmlFor={`${id}-reviewer`} required>
              <Input id={`${id}-reviewer`} value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="Dr Donna Martin, pharmacienne" maxLength={120} />
            </Field>
            {target === "content" && <Checkbox id={`${id}-pharmacist`} checked={pharmacist} onChange={(e) => setPharmacist(e.target.checked)} label="Relu par un pharmacien" description="Le relecteur nommé ci-dessus est pharmacien et a relu le contenu en cette qualité." />}
            <Button type="button" variant="success" loading={pending} onClick={() => review({ type: "APPROVE", reviewerName: reviewer, reviewerIsPharmacist: pharmacist })} leadingIcon={<CheckCircle2 className="size-4" aria-hidden="true" />}>
              Approuver
            </Button>
          </div>
          {target === "content" && (
            <div className="space-y-3 rounded-xl border border-danger-200 bg-danger-50/40 p-4">
              <Field label="Motif du refus" htmlFor={`${id}-note`}>
                <Textarea id={`${id}-note`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={600} placeholder="Ce qu'il faut corriger…" />
              </Field>
              <Button type="button" variant="danger" size="sm" loading={pending} onClick={() => review({ type: "REJECT", note })} leadingIcon={<XCircle className="size-4" aria-hidden="true" />}>
                Refuser
              </Button>
            </div>
          )}
        </div>
      )}

      {status === "APPROVED" && (
        <div className="space-y-3">
          {target === "content" && !published && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Mise en ligne le" htmlFor={`${id}-publish`} hint="Vide : tout de suite.">
                <Input id={`${id}-publish`} type="date" value={publishOn} onChange={(e) => setPublishOn(e.target.value)} />
              </Field>
              <Field label="Valable jusqu'au" htmlFor={`${id}-until`} hint="Facultatif : retiré de l'application après.">
                <Input id={`${id}-until`} type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
              </Field>
            </div>
          )}
          {published ? (
            <Button type="button" variant="secondary" loading={pending} onClick={() => publish(false)} leadingIcon={<EyeOff className="size-4" aria-hidden="true" />}>
              Retirer de l&apos;application
            </Button>
          ) : (
            <Button type="button" loading={pending} onClick={() => publish(true)} leadingIcon={<CalendarClock className="size-4" aria-hidden="true" />}>
              Publier dans l&apos;application
            </Button>
          )}
        </div>
      )}

      <div className="border-t border-border-subtle pt-3">
        {status === "ARCHIVED" ? (
          <Button type="button" variant="ghost" size="sm" loading={pending} onClick={() => review({ type: "RESTORE" })} leadingIcon={<RotateCcw className="size-4" aria-hidden="true" />}>
            Restaurer en brouillon
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="sm" loading={pending} onClick={() => review({ type: "ARCHIVE" })} leadingIcon={<Archive className="size-4" aria-hidden="true" />}>
            Archiver
          </Button>
        )}
      </div>
    </div>
  );
}
