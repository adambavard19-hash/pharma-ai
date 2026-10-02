"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { updatePartnerOrderStatusAction } from "@/server/actions/platform-partner-orders";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { ORDER_STATUS_LABELS } from "@/core/partners/status";

type OrderStatus = keyof typeof ORDER_STATUS_LABELS;
type AdminStatus = "TRANSMITTED" | "CONFIRMED" | "FAILED" | "CANCELLED";
const ADMIN_STATUSES: AdminStatus[] = ["TRANSMITTED", "CONFIRMED", "FAILED", "CANCELLED"];
const isAdminStatus = (status: OrderStatus): status is AdminStatus => (ADMIN_STATUSES as OrderStatus[]).includes(status);

/**
 * Constater où en est une commande chez le partenaire : transmise, confirmée,
 * en échec ou annulée, avec sa référence. Rien n'est envoyé au partenaire
 * depuis ce formulaire.
 */
export function OrderStatusButton({
  order,
}: {
  order: { id: string; attributionCode: string; status: OrderStatus; nextStatuses: OrderStatus[]; partnerReference: string | null; statusDetail: string | null };
}) {
  const router = useRouter();
  const { push } = useToast();
  const choices = [...(isAdminStatus(order.status) ? [order.status] : []), ...order.nextStatuses.filter(isAdminStatus)];
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AdminStatus | "">(choices[0] ?? "");
  const [reference, setReference] = useState(order.partnerReference ?? "");
  const [detail, setDetail] = useState(order.statusDetail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  if (choices.length === 0) return null;

  const submit = () => {
    if (!status) return;
    setError(null);
    setFieldErrors({});
    start(async () => {
      const result = await updatePartnerOrderStatusAction({ id: order.id, status, partnerReference: reference, statusDetail: detail });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "Commande mise à jour." });
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button size="sm" variant="outline" leadingIcon={<RefreshCw className="size-3.5" />} onClick={() => setOpen(true)}>
        Mettre à jour
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Commande ${order.attributionCode}`}
        description={`Statut actuel : ${ORDER_STATUS_LABELS[order.status]}. Ce formulaire consigne ce que le partenaire a fait ; il n'envoie rien.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button loading={pending} onClick={submit} disabled={!status}>
              Enregistrer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Statut" htmlFor={`order-status-${order.id}`} required error={fieldErrors.status}>
            <Select id={`order-status-${order.id}`} value={status} onChange={(event) => setStatus(event.target.value as AdminStatus)}>
              {choices.map((choice) => (
                <option key={choice} value={choice}>
                  {ORDER_STATUS_LABELS[choice]}
                  {choice === order.status ? " (actuel)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Référence chez le partenaire" htmlFor={`order-ref-${order.id}`} hint="Numéro de commande donné par le partenaire, s'il y en a un." error={fieldErrors.partnerReference}>
            <Input id={`order-ref-${order.id}`} value={reference} onChange={(event) => setReference(event.target.value)} maxLength={200} />
          </Field>
          <Field label="Détail" htmlFor={`order-detail-${order.id}`} hint="Ce qu'a répondu le partenaire, la cause d'un échec. Jamais de donnée patient." error={fieldErrors.statusDetail}>
            <Textarea id={`order-detail-${order.id}`} value={detail} onChange={(event) => setDetail(event.target.value)} rows={3} maxLength={2000} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
