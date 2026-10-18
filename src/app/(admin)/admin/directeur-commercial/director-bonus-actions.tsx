"use client";

import { moveDirectorBonusAction } from "@/server/actions/admin-sales-director";
import { ConfirmAction } from "@/components/admin/confirm-action";

/** Les gestes sur une prime du directeur, selon son statut : Valider (acquise), Marquer payée (acquise ou à payer), Annuler. */
export function DirectorBonusActions({ id, status }: { id: string; status: string }) {
  if (status !== "EARNED" && status !== "PAYABLE") return null;
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {status === "EARNED" && <ConfirmAction label="Valider" size="sm" variant="outline" title="Valider cette prime ?" confirmLabel="Valider" onConfirm={() => moveDirectorBonusAction({ id, gesture: "VALIDATE" })} />}
      <ConfirmAction label="Marquer payée" size="sm" variant="primary" title="Marquer cette prime payée ?" confirmLabel="Marquer payée" onConfirm={() => moveDirectorBonusAction({ id, gesture: "PAY" })} />
      <ConfirmAction label="Annuler" size="sm" variant="outline" tone="danger" title="Annuler cette prime ?" confirmLabel="Annuler la prime" onConfirm={() => moveDirectorBonusAction({ id, gesture: "CANCEL" })} />
    </div>
  );
}
