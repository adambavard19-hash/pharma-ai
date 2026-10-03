"use client";

import { useOptimistic, useState, useTransition, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, CalendarClock, Check, Clock, Lock } from "lucide-react";
import { buildBoard, dropDecision, isOverdue, moveTargets, type BoardColumnView, type DropDecision } from "@/core/sales/board";
import { PROSPECT_STATUS_LABELS, type ProspectStatusCode } from "@/core/sales/pipeline";
import { formatEuros } from "@/core/billing/subscription";
import { moveProspectAction } from "@/server/actions/admin-commercial";
import type { BoardCardData } from "@/server/services/admin/commercial";
import type { ActionResult } from "@/server/actions/types";
import { Button } from "@/components/ui/button";
import { Badge, Dot } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { ContractStatusBadge, TrialBadge } from "@/components/sales/status-badge";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DemoDialog } from "../demonstrations/demo-dialog";

/** Au-delà, une colonne renvoie vers la liste filtrée plutôt que d'afficher des centaines de cartes. */
const COLUMN_LIMIT = 40;

type Move = { id: string; status: ProspectStatusCode };
type Pending = { card: BoardCardData; to: "LOST" | "DEMO_SCHEDULED" } | null;

/**
 * Le pipeline en colonnes. On glisse une carte vers une étape manuelle ; les
 * étapes automatiques (contrat, signature, activation) refusent le dépôt et
 * disent pourquoi. Au clavier et au doigt, le bouton « Déplacer vers… » de
 * chaque carte fait la même chose. Le serveur revérifie chaque déplacement.
 */
export function PipelineBoard({ cards, nowIso, defaultDemoAt }: { cards: BoardCardData[]; nowIso: string; defaultDemoAt: string }) {
  const [moves, applyMove] = useOptimistic<Record<string, ProspectStatusCode>, Move>({}, (state, move) => ({ ...state, [move.id]: move.status }));
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState<BoardCardData | null>(null);
  const [over, setOver] = useState<ProspectStatusCode | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [menuFor, setMenuFor] = useState<BoardCardData | null>(null);
  const router = useRouter();
  const { push } = useToast();

  const shown = cards.map((card) => (moves[card.id] ? { ...card, status: moves[card.id] } : card));
  const columns = buildBoard(shown, nowIso);

  /** Enregistre le déplacement (affiché tout de suite, confirmé par le serveur). */
  const commit = (card: BoardCardData, to: ProspectStatusCode, extra: { reason?: string; demoAt?: string; note?: string | null } = {}) =>
    new Promise<ActionResult<unknown>>((resolve) => {
      startTransition(async () => {
        applyMove({ id: card.id, status: to });
        const result = await moveProspectAction({ prospectId: card.id, to, ...extra });
        if (result.ok) {
          push({ tone: "success", title: result.message ?? "Dossier déplacé.", description: card.name });
          router.refresh();
        } else {
          push({ tone: "error", title: result.error, description: card.name });
        }
        resolve(result);
      });
    });

  /** Un dépôt ou un choix de menu : refusé avec sa raison, ou complété par un motif, une date, ou enregistré. */
  const request = (card: BoardCardData, to: ProspectStatusCode) => {
    const decision = dropDecision(card, to);
    if (!decision.ok) {
      if (!decision.silent) push({ tone: "warning", title: decision.reason, description: card.name });
      return;
    }
    if (decision.needs === "reason") return setPending({ card, to: "LOST" });
    if (decision.needs === "demo") return setPending({ card, to: "DEMO_SCHEDULED" });
    void commit(card, to);
  };

  const decisionFor = (status: ProspectStatusCode): DropDecision | null => (dragging ? dropDecision(dragging, status) : null);

  const onDrop = (event: DragEvent<HTMLElement>, status: ProspectStatusCode) => {
    event.preventDefault();
    const card = dragging ?? cards.find((c) => c.id === event.dataTransfer.getData("text/plain")) ?? null;
    setOver(null);
    setDragging(null);
    if (card) request(shown.find((c) => c.id === card.id) ?? card, status);
  };

  return (
    <>
      <div className="-mx-6 snap-x snap-proximity scroll-px-6 overflow-x-auto px-6 pb-4" role="region" aria-label="Pipeline commercial, une colonne par étape">
        <div className="flex min-w-max gap-3">
          {columns.map((column) => (
            <BoardColumnSection
              key={column.status}
              column={column}
              nowIso={nowIso}
              decision={decisionFor(column.status)}
              isOver={over === column.status}
              draggingId={dragging?.id ?? null}
              pendingIds={moves}
              onDragEnter={() => dragging && setOver(column.status)}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver((current) => (current === column.status ? null : current));
              }}
              onDragOver={(event) => {
                if (!dragging) return;
                const decision = dropDecision(dragging, column.status);
                // Survol toujours pris en main : la colonne refusée affiche sa raison, le curseur passe en « interdit ».
                event.preventDefault();
                event.dataTransfer.dropEffect = decision.ok ? "move" : "none";
                if (over !== column.status) setOver(column.status);
              }}
              onDrop={(event) => onDrop(event, column.status)}
              onCardDragStart={(card, event) => {
                event.dataTransfer.setData("text/plain", card.id);
                event.dataTransfer.effectAllowed = "move";
                setDragging(card);
              }}
              onCardDragEnd={(event) => {
                // Dépôt refusé (curseur « interdit ») : on dit pourquoi.
                if (dragging && over && event.dataTransfer.dropEffect === "none") {
                  const decision = dropDecision(dragging, over);
                  if (!decision.ok && !decision.silent) push({ tone: "warning", title: decision.reason, description: dragging.name });
                }
                setDragging(null);
                setOver(null);
              }}
              onOpenMenu={setMenuFor}
            />
          ))}
        </div>
      </div>

      {menuFor && <MoveMenu card={menuFor} onClose={() => setMenuFor(null)} onChoose={(to) => { const card = menuFor; setMenuFor(null); request(card, to); }} />}

      {pending?.to === "LOST" && <LostDialog card={pending.card} onClose={() => setPending(null)} onConfirm={(reason) => commit(pending.card, "LOST", { reason })} />}

      {pending?.to === "DEMO_SCHEDULED" && (
        <DemoDialog
          fixedProspect={{ id: pending.card.id, name: pending.card.name }}
          initialAt={defaultDemoAt}
          title="Démo programmée : quand ?"
          submitLabel="Programmer et déplacer"
          onClose={() => setPending(null)}
          onSubmit={(values) => commit(pending.card, "DEMO_SCHEDULED", { demoAt: values.at, note: values.note })}
        />
      )}
    </>
  );
}

function BoardColumnSection({
  column,
  nowIso,
  decision,
  isOver,
  draggingId,
  pendingIds,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
  onOpenMenu,
}: {
  column: BoardColumnView<BoardCardData>;
  nowIso: string;
  decision: DropDecision | null;
  isOver: boolean;
  draggingId: string | null;
  pendingIds: Record<string, ProspectStatusCode>;
  onDragEnter: () => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onCardDragStart: (card: BoardCardData, event: DragEvent<HTMLElement>) => void;
  onCardDragEnd: (event: DragEvent<HTMLElement>) => void;
  onOpenMenu: (card: BoardCardData) => void;
}) {
  const refused = decision && !decision.ok && !decision.silent ? decision.reason : null;
  const accepting = Boolean(decision?.ok);
  const visible = column.cards.slice(0, COLUMN_LIMIT);
  return (
    <section
      aria-label={`${column.label} : ${column.count} dossier${column.count > 1 ? "s" : ""}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "flex w-[268px] shrink-0 snap-start flex-col rounded-2xl border bg-surface-sunken/50 transition-colors",
        column.kind === "system" ? "border-dashed border-border-default" : "border-border-subtle",
        draggingId && accepting && "border-brand-300 bg-brand-50/40 dark:border-brand-800 dark:bg-brand-950/20",
        isOver && accepting && "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20 dark:bg-brand-950/40",
        isOver && refused && "border-danger-300 bg-danger-50/60 dark:border-danger-700/60 dark:bg-danger-700/10",
      )}
    >
      <header className="space-y-1 px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <Dot tone={column.tone} className="size-2" />
          <h2 className="min-w-0 truncate text-[13px] font-semibold text-text-primary">{column.label}</h2>
          <span className="rounded-full bg-surface-card px-1.5 text-[11.5px] font-medium text-text-secondary tabular-nums ring-1 ring-border-subtle">{column.count}</span>
          {column.kind === "system" && <Lock className="size-3.5 shrink-0 text-text-tertiary" aria-label="Étape automatique" />}
          {column.overdue > 0 && <span className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-medium text-warning-700 dark:text-warning-500"><Clock className="size-3" aria-hidden="true" />{column.overdue}</span>}
        </div>
        <p className="text-[11.5px] leading-4 text-text-tertiary">{column.kind === "system" ? "Automatique · " : ""}{column.hint}</p>
      </header>

      <div className="flex min-h-28 flex-1 flex-col gap-2 px-2 pb-2">
        {isOver && refused && (
          <p role="status" className="flex items-start gap-1.5 rounded-lg bg-danger-50 px-2.5 py-2 text-[12px] leading-4 text-danger-700 dark:bg-danger-700/20 dark:text-danger-500">
            <Lock className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {refused}
          </p>
        )}
        {visible.map((card) => (
          <BoardCard key={card.id} card={card} nowIso={nowIso} moving={Boolean(pendingIds[card.id])} dragged={draggingId === card.id} onDragStart={(event) => onCardDragStart(card, event)} onDragEnd={onCardDragEnd} onOpenMenu={() => onOpenMenu(card)} />
        ))}
        {column.count > COLUMN_LIMIT && (
          <Link href={`/admin/prospects?statut=${column.status}`} className="rounded-lg px-2 py-1.5 text-center text-[12px] font-medium text-brand-700 hover:bg-surface-card dark:text-brand-400">
            Voir les {column.count - COLUMN_LIMIT} autres dans la liste
          </Link>
        )}
        {column.count === 0 && !isOver && <p className="rounded-lg border border-dashed border-border-subtle px-3 py-5 text-center text-[12px] text-text-tertiary">{column.kind === "system" ? "Aucun dossier à cette étape." : "Aucun dossier. Glissez une carte ici."}</p>}
      </div>
    </section>
  );
}

function BoardCard({ card, nowIso, moving, dragged, onDragStart, onDragEnd, onOpenMenu }: { card: BoardCardData; nowIso: string; moving: boolean; dragged: boolean; onDragStart: (event: DragEvent<HTMLElement>) => void; onDragEnd: (event: DragEvent<HTMLElement>) => void; onOpenMenu: () => void }) {
  const late = isOverdue(card.nextActionAt, nowIso);
  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      aria-busy={moving || undefined}
      className={cn(
        "group cursor-grab rounded-xl border border-border-subtle bg-surface-card p-3 shadow-xs transition-[box-shadow,border-color,opacity,transform] hover:border-border-default hover:shadow-sm active:cursor-grabbing",
        dragged && "opacity-40",
        moving && "animate-pulse",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link href={`/admin/dossiers/${card.id}`} draggable={false} className="block truncate text-[13.5px] leading-5 font-semibold text-text-primary hover:text-brand-700 dark:hover:text-brand-400">
            {card.name}
          </Link>
          <p className="truncate text-[12px] text-text-tertiary">
            {card.city ?? "Ville non renseignée"} · <span className={card.salesRepName ? "text-text-secondary" : undefined}>{card.salesRepName ?? "Console"}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenMenu}
          className="-mt-0.5 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-text-primary focus-visible:outline-2 focus-visible:outline-brand-500"
          aria-label={`Déplacer ${card.name} vers…`}
          title="Déplacer vers…"
        >
          <ArrowRightLeft className="size-4" aria-hidden="true" />
        </button>
      </div>

      {(card.contractStatus || card.trialDaysLeft !== null || card.blocked) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.contractStatus && <ContractStatusBadge status={card.contractStatus} />}
          <TrialBadge daysLeft={card.trialDaysLeft} />
          {card.blocked && <Badge tone="danger">Suspendu</Badge>}
        </div>
      )}

      <div className="mt-2 space-y-1 text-[12px] leading-4">
        {card.nextActionAt && (
          <p className={cn("flex items-center gap-1.5", late ? "font-medium text-warning-700 dark:text-warning-500" : "text-text-secondary")}>
            <Clock className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{card.nextActionLabel ?? "Relancer"} · {formatDate(card.nextActionAt)}{late ? " · en retard" : ""}</span>
          </p>
        )}
        {card.demoAt && (
          <p className={cn("flex items-center gap-1.5", card.demoDoneAt ? "text-success-700 dark:text-success-500" : "text-text-secondary")}>
            {card.demoDoneAt ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />}
            <span className="truncate">{card.demoDoneAt ? `Démo réalisée le ${formatDate(card.demoDoneAt)}` : `Démo le ${formatDateTime(card.demoAt)}`}</span>
          </p>
        )}
        {card.monthlyPriceCents !== null && card.monthlyPriceCents > 0 && <p className="text-text-tertiary tabular-nums">Proposé : {formatEuros(card.monthlyPriceCents)} HT/mois</p>}
      </div>
    </article>
  );
}

/** « Déplacer vers… » : l'alternative au glisser-déposer, au clavier comme au doigt. */
function MoveMenu({ card, onClose, onChoose }: { card: BoardCardData; onClose: () => void; onChoose: (to: ProspectStatusCode) => void }) {
  const targets = moveTargets(card);
  return (
    <Modal open onClose={onClose} title="Déplacer vers…" description={`${card.name} · actuellement « ${PROSPECT_STATUS_LABELS[card.status]} »`} size="sm">
      <ul className="space-y-1">
        {targets.map((target) => (
          <li key={target.status}>
            {target.decision.ok ? (
              <button type="button" onClick={() => onChoose(target.status)} className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-[13.5px] font-medium text-text-primary transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-brand-500">
                {target.label}
                {target.decision.needs === "reason" && <span className="text-[11.5px] font-normal text-text-tertiary">motif demandé</span>}
                {target.decision.needs === "demo" && <span className="text-[11.5px] font-normal text-text-tertiary">date demandée</span>}
              </button>
            ) : (
              <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-[13.5px] text-text-tertiary" aria-disabled="true">
                <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {target.label}
                  <span className="block text-[11.5px] leading-4">{target.decision.reason}</span>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/** « Perdu » exige un motif : il reste au dossier et alerte l'équipe. */
function LostDialog({ card, onClose, onConfirm }: { card: BoardCardData; onClose: () => void; onConfirm: (reason: string) => Promise<ActionResult<unknown>> }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = reason.trim().length >= 5;
  const confirm = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    const result = await onConfirm(reason.trim());
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onClose();
  };
  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title="Déclarer le dossier perdu"
      description={card.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Annuler</Button>
          <Button variant="danger" onClick={confirm} loading={busy} disabled={!valid}>Déclarer perdu</Button>
        </>
      }
    >
      <div className="space-y-4">
        <ul className="space-y-1.5 rounded-xl bg-surface-sunken px-4 py-3 text-[13.5px] leading-5 text-text-primary">
          <li>Le dossier passe en « Perdu » ; le motif reste dans son historique.</li>
          <li>L&apos;équipe est prévenue par une notification.</li>
        </ul>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Motif" htmlFor="lost-reason" required hint="Au moins 5 caractères : prix, timing, concurrent, sans réponse…">
          <Textarea id="lost-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
