"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck2, CheckCircle2, RotateCcw } from "lucide-react";
import { setSetupStatusAction } from "@/server/actions/platform-billing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

/**
 * La mise en service d'une officine abonnée : la planifier (date), la marquer
 * faite, ou la remettre à planifier. Chaque geste est tracé au journal.
 */
export function SetupStatusActions({ pharmacyId, status, scheduledAt }: { pharmacyId: string; status: "TO_SCHEDULE" | "SCHEDULED" | "DONE" | null; scheduledAt: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Un jour, pas une heure : l'heure se convient avec le titulaire. Midi UTC : le même jour partout.
  const [date, setDate] = useState(scheduledAt ? scheduledAt.slice(0, 10) : "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (payload: Parameters<typeof setSetupStatusAction>[0]) =>
    start(async () => {
      const result = await setSetupStatusAction(payload);
      setMessage({ ok: result.ok, text: result.ok ? (result.message ?? "Enregistré.") : result.error });
      if (result.ok) router.refresh();
    });

  return (
    <div className="space-y-3">
      {status !== "DONE" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="text-[12.5px] font-medium text-text-secondary">Date prévue</span>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
          </label>
          <Button size="sm" variant="outline" loading={pending} leadingIcon={<CalendarCheck2 className="size-4" />} disabled={!date} onClick={() => run({ pharmacyId, status: "SCHEDULED", scheduledAt: `${date}T12:00:00.000Z` })}>
            {status === "SCHEDULED" ? "Changer la date" : "Planifier"}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {status !== "DONE" && (
          <Button size="sm" loading={pending} leadingIcon={<CheckCircle2 className="size-4" />} onClick={() => run({ pharmacyId, status: "DONE" })}>
            Marquer faite
          </Button>
        )}
        {status && status !== "TO_SCHEDULE" && (
          <Button size="sm" variant="ghost" loading={pending} leadingIcon={<RotateCcw className="size-4" />} onClick={() => run({ pharmacyId, status: "TO_SCHEDULE" })}>
            Remettre à planifier
          </Button>
        )}
      </div>
      {message && <p className={message.ok ? "text-[12.5px] text-success-700" : "text-[12.5px] text-danger-700"}>{message.text}</p>}
    </div>
  );
}
