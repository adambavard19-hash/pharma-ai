"use client";

import { useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { Barcode } from "lucide-react";
import { attachBarcodeAction } from "@/server/actions/counter-scan";
import { useToast } from "@/components/ui/toast";
import { ProductPicker } from "./product-picker";

/**
 * Un code-barres lu par la douchette que personne ne connaît encore : le
 * pharmacien choisit le produit dans son stock, une fois. PharmaBoost retient
 * le code pour l'officine ; la boîte suivante est reconnue à l'instant.
 */
export function BarcodeAttach({ lineId, code, hint, canEdit }: { lineId: string; code: string; hint: string | null; canEdit: boolean }) {
  const params = useParams<{ id: string }>();
  const prescriptionId = params.id;
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  return (
    <div className="mt-2 rounded-lg border border-brand-200 bg-brand-50/40 px-3 py-2.5 dark:border-brand-800 dark:bg-brand-950/30">
      <p className="flex items-start gap-2 text-[12.5px] leading-5 text-text-secondary">
        <Barcode className="mt-0.5 size-3.5 shrink-0 text-brand-700 dark:text-brand-300" />
        <span>
          Code-barres <span className="font-mono text-text-primary">{code}</span> lu par la douchette, pas encore rattaché à votre stock.
          {hint ? <span className="block text-text-primary">{hint}</span> : null}
        </span>
      </p>
      {canEdit && !open && (
        <button type="button" onClick={() => setOpen(true)} className="mt-2 inline-flex items-center rounded-md border border-brand-300 bg-surface-card px-2.5 py-1.5 text-[12.5px] font-medium text-brand-700 hover:bg-brand-50 dark:border-brand-700 dark:text-brand-300">
          Rattacher à un produit du stock
        </button>
      )}
      {canEdit && open && (
        <div className="mt-2">
          <ProductPicker
            disabled={pending}
            onSelect={(productId) =>
              start(async () => {
                const result = await attachBarcodeAction({ lineId, productId, prescriptionId });
                push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Code retenu.") : result.error });
                if (result.ok) {
                  setOpen(false);
                  router.refresh();
                }
              })
            }
          />
        </div>
      )}
    </div>
  );
}
