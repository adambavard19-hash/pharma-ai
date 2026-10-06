import { Badge } from "@/components/ui/badge";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_TONES, isInvoiceStatus } from "@/core/sales/director/invoice";

/** Le statut d'une facture de commercial : le même mot et la même couleur chez le directeur et chez le commercial. */
export function InvoiceStatusBadge({ status }: { status: string }) {
  if (!isInvoiceStatus(status)) return <Badge>{status}</Badge>;
  return <Badge tone={INVOICE_STATUS_TONES[status]}>{INVOICE_STATUS_LABELS[status]}</Badge>;
}
