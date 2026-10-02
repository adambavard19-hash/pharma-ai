"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackageMinus, PencilLine, ShoppingBag, Trash2, Undo2 } from "lucide-react";
import { deleteLotAction, resolveLotAction } from "@/server/actions/stock-lots";
import type { LotView } from "@/server/services/stock-lots";
import type { ShortDateThresholds } from "@/core/stock/expiry";
import { LOT_RESOLUTION_LABELS, formatExpiry, type LotResolution } from "@/core/stock/expiry-input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { LotFormModal } from "./lot-form";

const RESOLUTION_ICONS: Record<LotResolution, typeof ShoppingBag> = {
  SOLD: ShoppingBag,
  RETURNED: Undo2,
  DESTROYED: Trash2,
};

/**
 * Sortir un lot du suivi, en un geste : vendu, retourné, détruit. La quantité
 * du stock n'est pas touchée. Une saisie erronée se supprime, après
 * confirmation.
 */
export function ResolveLotModal({ lot, onClose }: { lot: LotView; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<LotResolution | "DELETE" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();
  const { push } = useToast();

  const run = (key: LotResolution | "DELETE") => {
    setBusy(key);
    start(async () => {
      const result = key === "DELETE" ? await deleteLotAction(lot.id) : await resolveLotAction({ id: lot.id, resolution: key });
      setBusy(null);
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "C'est fait.") : result.error });
      if (!result.ok) return;
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Sortir ce lot du suivi"
      description={[lot.label, formatExpiry(lot.expiresOn, lot.precision), lot.lotNumber ? `lot ${lot.lotNumber}` : null].filter(Boolean).join(" · ")}
    >
      <div className="space-y-4">
        <p className="text-[13.5px] text-text-primary">Qu&apos;est devenu ce lot ?</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(Object.keys(LOT_RESOLUTION_LABELS) as LotResolution[]).map((resolution) => {
            const Icon = RESOLUTION_ICONS[resolution];
            return (
              <Button key={resolution} variant="outline" size="lg" disabled={pending && busy !== resolution} loading={pending && busy === resolution} leadingIcon={<Icon className="size-4" />} onClick={() => run(resolution)}>
                {LOT_RESOLUTION_LABELS[resolution]}
              </Button>
            );
          })}
        </div>
        <p className="text-[12.5px] leading-5 text-text-tertiary">La quantité du stock n&apos;est pas modifiée : elle suit votre logiciel de gestion.</p>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
          <p className="text-[12.5px] text-text-tertiary">{confirmDelete ? "Supprimer définitivement cette saisie ?" : "Une erreur de saisie ?"}</p>
          {confirmDelete ? (
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} disabled={pending}>
                Non
              </Button>
              <Button size="sm" variant="danger" loading={pending && busy === "DELETE"} onClick={() => run("DELETE")}>
                Supprimer
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" leadingIcon={<Trash2 className="size-3.5" />} onClick={() => setConfirmDelete(true)} disabled={pending}>
              Supprimer la saisie
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Les deux gestes d'une ligne : sortir le lot, ou corriger sa saisie. */
export function LotRowActions({ lot, today, thresholds }: { lot: LotView; today: string; thresholds: ShortDateThresholds }) {
  const [mode, setMode] = useState<"resolve" | "edit" | null>(null);
  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="outline" leadingIcon={<PackageMinus className="size-3.5" />} onClick={() => setMode("resolve")}>
        Sortir
      </Button>
      <Button size="sm" variant="ghost" aria-label={`Corriger le lot de ${lot.label}`} title="Corriger" onClick={() => setMode("edit")}>
        <PencilLine className="size-3.5" />
      </Button>
      {mode === "resolve" && <ResolveLotModal lot={lot} onClose={() => setMode(null)} />}
      {mode === "edit" && <LotFormModal lot={lot} today={today} thresholds={thresholds} onClose={() => setMode(null)} />}
    </div>
  );
}
