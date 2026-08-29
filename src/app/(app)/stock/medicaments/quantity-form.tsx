"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Trash2 } from "lucide-react";
import { removeDrugStockAction, setDrugStockAction } from "@/server/actions/drug-stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/server/actions/types";

/**
 * « J'en ai combien en rayon ? »
 *
 * Une quantité à zéro n'est pas un refus : la référence reste, et l'écran dit
 * qu'elle ne sera pas proposée. C'est la différence entre « je ne le vends
 * pas » et « je n'en ai plus » — les deux existent au comptoir.
 */
export function DrugQuantityForm({
  cip13,
  quantity,
  alertThreshold,
  location,
  autoFocus,
  compact,
}: {
  cip13: string;
  quantity: number;
  alertThreshold: number;
  location: string | null;
  autoFocus?: boolean;
  /** Dans une liste : un bouton discret par ligne, pas dix boutons pleins. */
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult<{ cip13: string; quantity: number }> | null,
    FormData
  >(setDrugStockAction, null);
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.push({ tone: "success", title: state.message ?? "Stock mis à jour" });
      router.refresh();
    } else {
      toast.push({ tone: "error", title: state.error });
    }
    // Le résultat ne doit produire qu'une notification, pas une à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="code" value={cip13} />
      <input type="hidden" name="alertThreshold" value={alertThreshold} />
      <input type="hidden" name="location" value={location ?? ""} />
      <div className={compact ? "w-16" : "w-24"}>
        <label htmlFor={`qty-${cip13}`} className="sr-only">
          Quantité en rayon
        </label>
        <Input
          id={`qty-${cip13}`}
          name="quantity"
          type="number"
          min={0}
          max={999999}
          step={1}
          defaultValue={quantity}
          autoFocus={autoFocus}
          className="tabular"
        />
      </div>
      {compact ? (
        <Button
          type="submit"
          loading={pending}
          variant="outline"
          size="sm"
          title="Enregistrer la quantité"
          aria-label="Enregistrer la quantité"
        >
          <Check className="size-4" />
        </Button>
      ) : (
        <Button type="submit" loading={pending} leadingIcon={<Check className="size-[18px]" />}>
          Enregistrer
        </Button>
      )}
    </form>
  );
}

export function RemoveDrugStockButton({ id, label }: { id: string; label: string }) {
  const [state, formAction, pending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    removeDrugStockAction,
    null,
  );
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.push({ tone: "success", title: state.message ?? "Référence retirée" });
      router.refresh();
    } else {
      toast.push({ tone: "error", title: state.error });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        loading={pending}
        aria-label={`Retirer ${label} du stock`}
        title="Retirer du stock de l'officine"
      >
        <Trash2 className="size-4" />
      </Button>
    </form>
  );
}
