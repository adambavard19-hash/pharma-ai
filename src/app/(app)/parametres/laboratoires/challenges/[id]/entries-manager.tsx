"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { addChallengeEntryAction, deleteChallengeEntryAction } from "@/server/actions/challenges";
import type { ChallengeEntryRow } from "@/server/services/challenges";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatDay, unitsWord } from "../challenge-display";

/**
 * Les unités saisies à la main : ventes passées hors PharmaBoost, ou relevé
 * du laboratoire. Une saisie négative corrige. Chaque saisie est datée dans la
 * période du challenge et peut être retirée.
 */
export function EntriesManager({
  challengeId,
  entries,
  startsOn,
  endsOn,
  today,
  locked,
}: {
  challengeId: string;
  entries: ChallengeEntryRow[];
  startsOn: string;
  endsOn: string;
  today: string;
  /** Archivé : on consulte, on n'ajoute ni ne retire plus rien. */
  locked: boolean;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const lastDay = today < endsOn ? today : endsOn;
  const notStarted = today < startsOn;
  const [units, setUnits] = useState("");
  const [occurredOn, setOccurredOn] = useState(lastDay);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string | null>(null);

  const add = () => {
    setErrors({});
    start(async () => {
      const result = await addChallengeEntryAction({ challengeId, units: units.trim(), occurredOn, note: note.trim() || null });
      if (!result.ok) {
        setErrors(result.fieldErrors && Object.keys(result.fieldErrors).length > 0 ? result.fieldErrors : { form: result.error });
        return;
      }
      push({ tone: "success", title: result.message ?? "Saisie ajoutée." });
      setUnits("");
      setNote("");
      router.refresh();
    });
  };

  const remove = (entryId: string) =>
    start(async () => {
      const result = await deleteChallengeEntryAction(entryId);
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Saisie retirée.") : result.error });
      setConfirming(null);
      router.refresh();
    });

  const total = entries.reduce((sum, entry) => sum + entry.units, 0);

  return (
    <div className="space-y-4">
      {locked ? (
        <p className="text-[12.5px] text-text-tertiary">Challenge archivé : réactivez-le pour ajouter ou retirer des unités.</p>
      ) : notStarted ? (
        <p className="text-[12.5px] text-text-tertiary">Les saisies s&apos;ouvrent au premier jour du challenge ({formatDay(startsOn)}).</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unités" htmlFor="entry-units" error={errors.units} hint="Négatif pour corriger">
              <Input id="entry-units" type="number" inputMode="numeric" step={1} value={units} onChange={(event) => setUnits(event.target.value)} placeholder="Ex. 6" />
            </Field>
            <Field label="Date" htmlFor="entry-date" error={errors.occurredOn}>
              <Input id="entry-date" type="date" value={occurredOn} min={startsOn} max={lastDay} onChange={(event) => setOccurredOn(event.target.value)} />
            </Field>
          </div>
          <Field label="Note" htmlFor="entry-note" hint="Facultatif — ex. relevé du délégué, vente hors PharmaBoost" error={errors.note}>
            <Input id="entry-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} />
          </Field>
          {errors.form && (
            <p className="text-[12.5px] text-danger-600" role="alert">
              {errors.form}
            </p>
          )}
          <Button type="submit" size="sm" leadingIcon={<Plus className="size-3.5" />} loading={pending} disabled={!units.trim()}>
            Ajouter
          </Button>
        </form>
      )}

      {entries.length === 0 ? (
        <p className="text-[12.5px] text-text-tertiary">Aucune saisie manuelle.</p>
      ) : (
        <div className="space-y-2">
          <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 px-3 py-2.5">
                <span className="w-14 shrink-0 text-[14px] font-semibold tabular text-text-primary">
                  {entry.units > 0 ? `+${entry.units}` : entry.units}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-text-primary">{formatDay(entry.occurredOn)}</span>
                  <span className="block truncate text-[12px] text-text-tertiary">
                    {[entry.note, entry.author ? `par ${entry.author}` : null].filter(Boolean).join(" · ") || "Saisie manuelle"}
                  </span>
                </span>
                {locked ? null : confirming === entry.id ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="danger" loading={pending} onClick={() => remove(entry.id)}>
                      Retirer
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)} disabled={pending}>
                      Non
                    </Button>
                  </span>
                ) : (
                  <Button size="sm" variant="ghost" aria-label={`Retirer la saisie du ${formatDay(entry.occurredOn)}`} onClick={() => setConfirming(entry.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-text-tertiary">
            Total saisi : <span className="font-medium tabular text-text-secondary">{total}</span> {unitsWord(total)}
          </p>
        </div>
      )}
    </div>
  );
}
