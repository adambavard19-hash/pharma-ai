"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateShortDateThresholdsAction } from "@/server/actions/stock-lots";
import type { ShortDateThresholds } from "@/core/stock/expiry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

/**
 * Les deux seuils de l'officine, réglés en une ligne. « Urgent » ne dépasse
 * jamais « bientôt » : vérifié ici pour le confort, et côté serveur pour de bon.
 */
export function ThresholdsForm({ thresholds }: { thresholds: ShortDateThresholds }) {
  const [soon, setSoon] = useState(String(thresholds.soonDays));
  const [urgent, setUrgent] = useState(String(thresholds.urgentDays));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  const soonDays = Number(soon);
  const urgentDays = Number(urgent);
  const changed = soonDays !== thresholds.soonDays || urgentDays !== thresholds.urgentDays;

  const save = () => {
    if (!Number.isInteger(soonDays) || soonDays < 1 || soonDays > 730 || !Number.isInteger(urgentDays) || urgentDays < 0 || urgentDays > 730) {
      setError("Des nombres de jours entiers : bientôt de 1 à 730, urgent de 0 à 730.");
      return;
    }
    if (urgentDays > soonDays) {
      setError("Le seuil « urgent » ne peut pas dépasser le seuil « bientôt ».");
      return;
    }
    setError(null);
    start(async () => {
      const result = await updateShortDateThresholdsAction({ soonDays, urgentDays });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Seuils enregistrés.") : result.error });
      if (result.ok) router.refresh();
    });
  };

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-[13.5px] text-text-secondary">
        <label className="flex items-center gap-2">
          <span className="font-medium text-text-primary">Bientôt</span> à
          <Input type="number" inputMode="numeric" min={1} max={730} value={soon} onChange={(event) => setSoon(event.target.value)} className="w-20 text-right tabular" aria-label="Seuil bientôt, en jours" />
          jours ou moins
        </label>
        <label className="flex items-center gap-2">
          <span className="font-medium text-text-primary">Urgent</span> à
          <Input type="number" inputMode="numeric" min={0} max={730} value={urgent} onChange={(event) => setUrgent(event.target.value)} className="w-20 text-right tabular" aria-label="Seuil urgent, en jours" />
          jours ou moins
        </label>
        <Button type="submit" size="sm" variant={changed ? "primary" : "outline"} disabled={!changed} loading={pending}>
          Enregistrer
        </Button>
      </div>
      {error && (
        <p className="text-[12.5px] text-danger-600" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
