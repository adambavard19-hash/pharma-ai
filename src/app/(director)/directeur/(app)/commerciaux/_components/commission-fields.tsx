"use client";

import { COMMISSION_OPTIONS, COMMISSION_TYPES, type CommissionTypeKey } from "@/core/sales/director/team";
import { Field, Input, Select } from "@/components/ui/field";

/**
 * Le type et le montant de la commission, avec l'aide du type choisi sous le
 * champ : « Montant fixe », « Pourcentage », « Montant mensuel ». La valeur est
 * saisie comme on la dit (« 250 », « 12,5 ») ; la conversion en centimes se fait
 * à l'envoi (`parseCommissionInput`).
 */
export function CommissionFields({ idPrefix, type, value, onType, onValue, error }: { idPrefix: string; type: CommissionTypeKey; value: string; onType: (type: CommissionTypeKey) => void; onValue: (value: string) => void; error?: string | null }) {
  const option = COMMISSION_OPTIONS[type];
  return (
    <div className="space-y-4">
      <Field label="Comment est-il rémunéré ?" htmlFor={`${idPrefix}-type`} hint={option.help}>
        <Select id={`${idPrefix}-type`} value={type} onChange={(event) => {
            // Changer de type vide le montant : « 250 » euros par contrat n'a rien à voir avec « 250 » % ou par mois.
            const next = event.target.value as CommissionTypeKey;
            if (next === type) return;
            onType(next);
            onValue("");
          }}
        >
          {COMMISSION_TYPES.map((key) => (
            <option key={key} value={key}>
              {COMMISSION_OPTIONS[key].label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={`Montant (${option.unit})`} htmlFor={`${idPrefix}-value`} required error={error}>
        <Input id={`${idPrefix}-value`} inputMode="decimal" autoComplete="off" value={value} onChange={(event) => onValue(event.target.value)} aria-invalid={error ? true : undefined} />
      </Field>
    </div>
  );
}
