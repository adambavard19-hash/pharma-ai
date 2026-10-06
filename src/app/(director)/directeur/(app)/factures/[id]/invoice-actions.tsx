"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Trash2, Wallet } from "lucide-react";
import { deleteInvoiceAction, invoiceGestureAction } from "@/server/actions/director-money";
import { invoiceGesturesFor, type InvoiceGap, type InvoiceStatus } from "@/core/sales/director/invoice";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

const plural = (count: number, one: string, many: string) => (count > 1 ? many : one);

/** Supprimer une facture saisie par erreur : une fenêtre de confirmation, puis retour à la liste. */
function DeleteInvoice({ id, number, commissionCount }: { id: string; number: string; commissionCount: number }) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    if (pending) return;
    setOpen(false);
    setError(null);
  };
  const confirm = () =>
    start(async () => {
      setError(null);
      const result = await deleteInvoiceAction({ invoiceId: id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Facture supprimée." });
      router.replace("/directeur/factures");
    });

  return (
    <>
      <Button type="button" variant="ghost" size="sm" leadingIcon={<Trash2 className="size-3.5" />} onClick={() => setOpen(true)}>
        Supprimer
      </Button>
      <Modal
        open={open}
        onClose={close}
        title={`Supprimer la facture ${number} ?`}
        description="À faire pour une facture saisie par erreur."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={close} disabled={pending}>
              Annuler
            </Button>
            <Button type="button" variant="danger" onClick={confirm} loading={pending}>
              Supprimer la facture
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <ul className="space-y-1.5 rounded-xl bg-surface-sunken px-4 py-3 text-[13.5px] leading-5 text-text-primary">
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-text-tertiary">•</span>
              La facture et son fichier PDF sont effacés.
            </li>
            {commissionCount > 0 && (
              <li className="flex gap-2">
                <span aria-hidden="true" className="text-text-tertiary">•</span>
                {commissionCount} {plural(commissionCount, "commission est libérée", "commissions sont libérées")} : {plural(commissionCount, "elle pourra", "elles pourront")} figurer sur une autre facture.
              </li>
            )}
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-text-tertiary">•</span>
              Cette suppression est notée dans le journal.
            </li>
          </ul>
          {error && <Alert tone="danger">{error}</Alert>}
        </div>
      </Modal>
    </>
  );
}

/**
 * Les gestes d'une facture : valider, payer, refuser (motif obligatoire),
 * supprimer. Seuls ceux que la machine d'états permet sont proposés ; le
 * serveur revérifie tout. Chaque geste dit ce qu'il fait aux commissions.
 */
export function InvoiceActions({ id, number, status, commissionCount, gap, canDelete }: { id: string; number: string; status: InvoiceStatus; commissionCount: number; gap: InvoiceGap; canDelete: boolean }) {
  const gestures = invoiceGesturesFor(status);
  const commissions = `${commissionCount} ${plural(commissionCount, "commission", "commissions")}`;
  const gapWarning = gap.kind === "HIGHER" || gap.kind === "LOWER" ? <Alert tone="warning">{gap.message}</Alert> : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {gestures.includes("APPROVE") && (
        <ConfirmAction
          label="Valider la facture"
          icon={<Check className="size-3.5" />}
          variant="primary"
          size="md"
          title={`Valider la facture ${number} ?`}
          confirmLabel="Valider la facture"
          consequences={[commissionCount > 0 ? `${commissions} rattachée${commissionCount > 1 ? "s" : ""} passe${commissionCount > 1 ? "nt" : ""} à « À payer ».` : "Aucune commission n'est rattachée : seule la facture change d'état.", "Le commercial en est informé dans son espace."]}
          onConfirm={() => invoiceGestureAction({ invoiceId: id, gesture: "APPROVE" })}
        >
          {gapWarning}
        </ConfirmAction>
      )}
      {gestures.includes("PAY") && (
        <ConfirmAction
          label="Marquer payée"
          icon={<Wallet className="size-3.5" />}
          variant="primary"
          size="md"
          title={`Marquer la facture ${number} payée ?`}
          confirmLabel="Marquer payée"
          consequences={[commissionCount > 0 ? `${commissions} rattachée${commissionCount > 1 ? "s" : ""} ${commissionCount > 1 ? "sont" : "est"} marquée${commissionCount > 1 ? "s" : ""} payée${commissionCount > 1 ? "s" : ""}, à la date d'aujourd'hui.` : "Aucune commission n'est rattachée : seule la facture change d'état.", "Le commercial en est informé dans son espace.", "Une facture payée ne se modifie plus."]}
          onConfirm={() => invoiceGestureAction({ invoiceId: id, gesture: "PAY" })}
        >
          {gapWarning}
        </ConfirmAction>
      )}
      {gestures.includes("REJECT") && (
        <ConfirmAction
          label="Refuser"
          icon={<Ban className="size-3.5" />}
          variant="outline"
          size="md"
          tone="danger"
          title={`Refuser la facture ${number} ?`}
          confirmLabel="Refuser la facture"
          consequences={[
            commissionCount > 0 ? `${commissions} ${commissionCount > 1 ? "sont libérées" : "est libérée"} : ${commissionCount > 1 ? "elles pourront" : "elle pourra"} figurer sur une autre facture. Celles qui étaient « À payer » (validées à la main ou par cette facture) redeviennent « Acquises ».` : "Aucune commission n'est rattachée.",
            "Le commercial en est informé, avec votre motif.",
            "Une facture refusée ne se rouvre pas : le commercial vous en envoie une nouvelle.",
          ]}
          reason={{ label: "Motif du refus", placeholder: "Par exemple : montant différent des commissions, mentions manquantes…" }}
          onConfirm={(reason) => invoiceGestureAction({ invoiceId: id, gesture: "REJECT", reason })}
        />
      )}
      {canDelete && <DeleteInvoice id={id} number={number} commissionCount={commissionCount} />}
    </div>
  );
}
