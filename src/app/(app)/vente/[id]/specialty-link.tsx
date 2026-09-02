"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookMarked, Check, Search, X } from "lucide-react";
import {
  attachSpecialtyAction,
  detachSpecialtyAction,
  searchSpecialtiesAction,
} from "@/server/actions/drug-identification";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { stockTone } from "@/config/counter-tone";
import type { SpecialtyCandidate } from "@/core/reference";
import type { ActionResult } from "@/server/actions/types";
import type { OfficialLineFacts, SaleLineDraft, SpecialtyProposal } from "./types";

/**
 * Ce que l'officine détient du médicament prescrit, dit en trois mots.
 *
 * Le libellé vit ici, la couleur vient de la règle du comptoir : deux tables
 * qui décident chacune d'une couleur finissent par diverger, et c'est
 * exactement le genre de divergence qu'un pharmacien paie.
 */
const AVAILABILITY_LABELS: Record<string, string> = {
  IN_STOCK: "En stock",
  REFERENCED_EMPTY: "Épuisé",
  NOT_REFERENCED: "Hors stock",
  UNKNOWN: "Stock inconnu",
};

/**
 * Le rattachement d'une ligne d'ordonnance au catalogue national.
 *
 * Deux états, et un seul geste pour passer de l'un à l'autre.
 *
 *   • Rattachée : les faits officiels s'affichent — composition, forme,
 *     conditions de délivrance — avec la mention de leur source. Ils ne
 *     remplacent pas le libellé de l'ordonnance, ils le complètent.
 *   • Non rattachée : l'écran dit ce qui manque et propose des candidats.
 *     Il ne choisit pas à la place du pharmacien.
 */
export function SpecialtyLink({
  lineId,
  official,
  availability,
  identifiedBy,
  candidates,
  refusal,
  attribution,
  canEdit,
}: {
  lineId: string;
  official: OfficialLineFacts | null;
  availability: SaleLineDraft["availability"];
  identifiedBy: "AUTO" | "PHARMACIST" | "SCAN" | null;
  candidates: SpecialtyProposal[];
  refusal: string | null;
  /** Mention de source et de date, imposée par la licence du catalogue. */
  attribution: string | null;
  canEdit: boolean;
}) {
  if (official) {
    return (
      <OfficialFacts
        lineId={lineId}
        official={official}
        availability={availability}
        identifiedBy={identifiedBy}
        attribution={attribution}
        canEdit={canEdit}
      />
    );
  }

  return <Unlinked lineId={lineId} candidates={candidates} refusal={refusal} canEdit={canEdit} />;
}

function OfficialFacts({
  lineId,
  official,
  availability,
  identifiedBy,
  attribution,
  canEdit,
}: {
  lineId: string;
  official: OfficialLineFacts;
  availability: SaleLineDraft["availability"];
  identifiedBy: "AUTO" | "PHARMACIST" | "SCAN" | null;
  attribution: string | null;
  canEdit: boolean;
}) {
  return (
    <div className="mt-1.5 rounded-lg border border-border-subtle bg-surface-sunken/50 px-3 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-medium text-text-primary">
            <BookMarked className="size-3.5 shrink-0 text-text-tertiary" />
            {official.name}
            {availability && (
              <Badge tone={stockTone(availability.state)}>
                {AVAILABILITY_LABELS[availability.state] ?? AVAILABILITY_LABELS.UNKNOWN}
                {availability.state === "IN_STOCK" && ` · ${availability.quantity}`}
              </Badge>
            )}
            {identifiedBy === "PHARMACIST" && <Badge tone="success">Confirmé</Badge>}
            {!official.marketed && <Badge tone="warning">Commercialisation arrêtée</Badge>}
          </p>
          <p className="text-[12px] leading-4 text-text-secondary">
            {official.substances.join(", ") || "Composition non publiée"}
            {official.pharmaceuticalForm && ` · ${official.pharmaceuticalForm}`}
            {official.prescriptionConditions.length > 0 &&
              ` · ${official.prescriptionConditions.join(", ")}`}
          </p>
          {attribution && (
            <p className="text-[11.5px] leading-4 text-text-tertiary">{attribution}</p>
          )}
        </div>
        {canEdit && <DetachButton lineId={lineId} />}
      </div>
    </div>
  );
}

function DetachButton({ lineId }: { lineId: string }) {
  const [state, formAction, pending] = useActionState<ActionResult<{ lineId: string }> | null, FormData>(
    detachSpecialtyAction,
    null,
  );
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.push({ tone: "info", title: state.message ?? "Rattachement retiré" });
      router.refresh();
    } else {
      toast.push({ tone: "error", title: state.error });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="lineId" value={lineId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        loading={pending}
        title="Ce n'est pas ce médicament"
        aria-label="Retirer le rattachement au catalogue national"
      >
        <X className="size-3.5" />
      </Button>
    </form>
  );
}

/**
 * Nombre de candidats montrés d'emblée.
 *
 * Six propositions occupaient un tiers de l'écran de vente pour une décision
 * qui se prend en regardant la boîte. Les suivantes restent à un clic.
 */
const VISIBLE_CANDIDATES = 3;

function Unlinked({
  lineId,
  candidates,
  refusal,
  canEdit,
}: {
  lineId: string;
  candidates: SpecialtyProposal[];
  refusal: string | null;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? candidates : candidates.slice(0, VISIBLE_CANDIDATES);

  return (
    <div className="mt-1.5 rounded-lg border border-warning-300 bg-warning-50/50 px-3 py-2 dark:border-warning-800 dark:bg-warning-950/30">
      <p className="text-[12.5px] leading-4 text-warning-800 dark:text-warning-400">
        Non rattaché au catalogue national.{" "}
        <span className="text-text-secondary">
          {refusal ?? "Ni la composition ni les conditions de délivrance ne sont vérifiées."}
        </span>
      </p>

      {canEdit && (candidates.length > 0 || open) && (
        <div className="mt-2 space-y-1.5">
          {visible.map((candidate) => (
            <AttachButton key={candidate.id} lineId={lineId} candidate={candidate} />
          ))}
          {/* Les deux issues secondaires, sur une même rangée : « il y en a
              d'autres » et « aucune ne convient ». Empilées, elles se
              chevauchaient. */}
          {open ? (
            <FreeSearch lineId={lineId} />
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
              {!showAll && candidates.length > VISIBLE_CANDIDATES && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="text-[12px] font-medium text-brand-700 hover:underline dark:text-brand-400"
                >
                  {candidates.length - VISIBLE_CANDIDATES} autre(s) spécialité(s)
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-700 hover:underline dark:text-brand-400"
              >
                <Search className="size-3.5" />
                Aucune ne correspond — chercher
              </button>
            </div>
          )}
        </div>
      )}

      {canEdit && candidates.length === 0 && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-700 hover:underline dark:text-brand-400"
        >
          <Search className="size-3.5" />
          Chercher dans le catalogue national
        </button>
      )}
    </div>
  );
}

function AttachButton({
  lineId,
  candidate,
}: {
  lineId: string;
  candidate: SpecialtyProposal | (SpecialtyCandidate & { score?: number; reasons?: string[] });
}) {
  const [state, formAction, pending] = useActionState<ActionResult<{ lineId: string }> | null, FormData>(
    attachSpecialtyAction,
    null,
  );
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.push({ tone: "success", title: state.message ?? "Ligne rattachée" });
      router.refresh();
    } else {
      toast.push({ tone: "error", title: state.error });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="lineId" value={lineId} />
      <input type="hidden" name="specialtyId" value={candidate.id} />
      {/* Une ligne par candidat : le nom porte la décision, la substance la
          confirme. Sur deux lignes, six candidats occupaient un tiers de
          l'écran de vente. */}
      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center gap-2 rounded-md border border-border-subtle bg-surface-card px-2.5 py-1.5 text-left transition-colors hover:border-brand-400 disabled:opacity-60"
      >
        <Check className="size-3.5 shrink-0 text-brand-600" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-text-primary">
          {candidate.name}
        </span>
        <span className="shrink-0 text-[11px] text-text-tertiary">
          {candidate.substances[0] ?? "composition non publiée"}
          {!candidate.marketed && " · arrêté"}
        </span>
      </button>
    </form>
  );
}

function FreeSearch({ lineId }: { lineId: string }) {
  const [state, formAction, pending] = useActionState<
    ActionResult<SpecialtyCandidate[]> | null,
    FormData
  >(searchSpecialtiesAction, null);

  return (
    <div className="space-y-1.5">
      <form action={formAction} className="flex gap-1.5">
        <Input
          name="query"
          placeholder="Nom de spécialité ou substance…"
          className="text-[12.5px]"
          minLength={3}
          required
        />
        <Button type="submit" variant="outline" size="sm" loading={pending}>
          Chercher
        </Button>
      </form>

      {state?.ok === false && (
        <p className="text-[12px] text-danger-600">{state.error}</p>
      )}
      {state?.ok === true && state.data.length === 0 && (
        <p className="text-[12px] text-text-tertiary">
          {state.message ?? "Aucune spécialité ne correspond."}
        </p>
      )}
      {state?.ok === true &&
        state.data.map((candidate) => (
          <AttachButton key={candidate.id} lineId={lineId} candidate={candidate} />
        ))}
    </div>
  );
}
