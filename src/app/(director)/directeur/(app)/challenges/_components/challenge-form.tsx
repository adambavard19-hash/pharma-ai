"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Rocket } from "lucide-react";
import { createChallengeAction, updateChallengeAction } from "@/server/actions/director-challenges";
import { CHALLENGE_LIMITS, CHALLENGE_METRICS, CHALLENGE_METRIC_HELP, CHALLENGE_METRIC_LABELS, describeChallengeGoal, isChallengeMetric, type LockedFields } from "@/core/sales/director/challenge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

export type ChallengeFormValues = {
  title: string;
  description: string;
  metric: string;
  target: string;
  startsDay: string;
  endsDay: string;
  rewardLabel: string;
  rewardEuros: string;
};

/**
 * Le formulaire d'un challenge : lancer (page « Nouveau challenge ») ou
 * modifier (fiche du challenge). Les règles sont celles du serveur ; ici on ne
 * fait qu'afficher ses réponses, champ par champ. En modification, les champs
 * qui ne bougent plus (selon l'état du challenge) sont grisés et expliqués.
 */
export function ChallengeForm({ mode, challengeId, initial, locked, notice, activeReps }: { mode: "create" | "edit"; challengeId?: string; initial: ChallengeFormValues; locked?: LockedFields; notice?: string | null; activeReps?: number }) {
  const router = useRouter();
  const { push } = useToast();
  const [values, setValues] = useState<ChallengeFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = (key: keyof ChallengeFormValues) => (event: { target: { value: string } }) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const lock = locked ?? { metric: false, target: false, startsDay: false, endsDay: false };

  const submit = () =>
    start(async () => {
      setError(null);
      setErrors({});
      const result = mode === "create" ? await createChallengeAction(values) : await updateChallengeAction({ id: challengeId ?? "", ...values });
      if (!result.ok) {
        setError(result.error);
        setErrors(result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "C'est fait." });
      if (mode === "create") router.push(`/directeur/challenges/${result.data.id}`);
      else router.refresh();
    });

  const metric = isChallengeMetric(values.metric) ? values.metric : null;
  const target = Number(values.target);
  const goal = metric && Number.isInteger(target) && target >= 1 ? describeChallengeGoal(metric, target) : null;

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {notice && <Alert tone="info">{notice}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}

      <Field label="Titre" htmlFor="challenge-title" required error={errors.title} hint="Court et motivant : « Le mois des démonstrations ».">
        <Input id="challenge-title" value={values.title} maxLength={CHALLENGE_LIMITS.titleMax} onChange={set("title")} aria-invalid={errors.title ? true : undefined} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Ce que le challenge compte" htmlFor="challenge-metric" required error={errors.metric} hint={metric ? CHALLENGE_METRIC_HELP[metric] : undefined}>
          <Select id="challenge-metric" value={values.metric} onChange={set("metric")} disabled={lock.metric} aria-invalid={errors.metric ? true : undefined}>
            {CHALLENGE_METRICS.map((value) => (
              <option key={value} value={value}>
                {CHALLENGE_METRIC_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Objectif par commercial" htmlFor="challenge-target" required error={errors.target} hint={goal ? `Chaque commercial actif vise ${goal}.` : "Le même nombre pour chaque commercial."}>
          <Input id="challenge-target" type="number" inputMode="numeric" min={1} max={CHALLENGE_LIMITS.targetMax} step={1} value={values.target} onChange={set("target")} disabled={lock.target} aria-invalid={errors.target ? true : undefined} />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Premier jour" htmlFor="challenge-starts" required error={errors.startsDay}>
          <Input id="challenge-starts" type="date" value={values.startsDay} onChange={set("startsDay")} disabled={lock.startsDay} aria-invalid={errors.startsDay ? true : undefined} />
        </Field>
        <Field label="Dernier jour (compris)" htmlFor="challenge-ends" required error={errors.endsDay}>
          <Input id="challenge-ends" type="date" value={values.endsDay} min={values.startsDay || undefined} onChange={set("endsDay")} disabled={lock.endsDay} aria-invalid={errors.endsDay ? true : undefined} />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Récompense" htmlFor="challenge-reward" error={errors.rewardLabel} hint="Facultatif. Dite en clair : « Prime de 200 € », « Un week-end offert ».">
          <Input id="challenge-reward" value={values.rewardLabel} maxLength={CHALLENGE_LIMITS.rewardLabelMax} onChange={set("rewardLabel")} aria-invalid={errors.rewardLabel ? true : undefined} />
        </Field>
        <Field label="Montant de la prime (€)" htmlFor="challenge-reward-amount" error={errors.rewardEuros} hint="Facultatif. Pour mémoire : rien n'est versé automatiquement.">
          <Input id="challenge-reward-amount" inputMode="decimal" value={values.rewardEuros} onChange={set("rewardEuros")} placeholder="200" aria-invalid={errors.rewardEuros ? true : undefined} />
        </Field>
      </div>

      <Field label="Un mot pour l'équipe" htmlFor="challenge-description" error={errors.description} hint="Facultatif. Les commerciaux le lisent dans leur espace.">
        <Textarea id="challenge-description" rows={3} value={values.description} maxLength={CHALLENGE_LIMITS.descriptionMax} onChange={set("description")} aria-invalid={errors.description ? true : undefined} />
      </Field>

      {mode === "create" && (
        <p className="text-[13px] leading-5 text-text-secondary">
          {activeReps === undefined ? "" : activeReps === 0 ? "Aucun commercial actif pour l'instant : personne ne sera prévenu. " : `Les ${activeReps} commerciaux actifs participent et reçoivent une notification. `}
          Leur avancement se calcule tout seul, à partir de leurs dossiers.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {mode === "create" && (
          <Button asChild variant="ghost">
            <Link href="/directeur/challenges">Annuler</Link>
          </Button>
        )}
        <Button type="submit" loading={pending} leadingIcon={mode === "create" ? <Rocket className="size-4" /> : undefined}>
          {mode === "create" ? "Lancer le challenge" : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
