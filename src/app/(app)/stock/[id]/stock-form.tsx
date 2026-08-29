"use client";

import { useActionState } from "react";
import { Boxes } from "lucide-react";
import { adjustStockAction } from "@/server/actions/products";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import type { ActionResult } from "@/server/actions/types";

const MODES = [
  { value: "PURCHASE", label: "Réception (ajout)" },
  { value: "ADJUSTMENT", label: "Ajustement (+/−)" },
  { value: "INVENTORY", label: "Inventaire (valeur exacte)" },
  { value: "LOSS", label: "Perte / casse" },
  { value: "RETURN", label: "Retour (ajout)" },
];

export function StockAdjustForm({
  productId,
  currentQuantity,
}: {
  productId: string;
  currentQuantity: number;
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult<{ quantityAfter: number }> | null,
    FormData
  >(adjustStockAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />

      {state?.ok === false && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok === true && <Alert tone="success">{state.message}</Alert>}

      <Field label="Type de mouvement" htmlFor="mode">
        <Select id="mode" name="mode" defaultValue="PURCHASE">
          {MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Quantité"
        htmlFor="quantity"
        hint={`Stock actuel : ${currentQuantity}. En mode inventaire, saisissez la quantité comptée.`}
      >
        <Input id="quantity" name="quantity" type="number" defaultValue={1} required />
      </Field>

      <Field label="Motif" htmlFor="reason">
        <Input id="reason" name="reason" placeholder="Livraison grossiste, casse…" />
      </Field>

      <Button
        type="submit"
        variant="secondary"
        className="w-full"
        loading={pending}
        leadingIcon={<Boxes className="size-4" />}
      >
        Enregistrer le mouvement
      </Button>
    </form>
  );
}
