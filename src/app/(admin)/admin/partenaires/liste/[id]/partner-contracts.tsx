"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSignature, Pencil, Plus } from "lucide-react";
import { savePartnerContractAction } from "@/server/actions/platform-partners";
import { CONTRACT_TYPE_LABELS, CONTRACT_TYPES, type ContractType } from "@/core/partners/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatCents, formatDate, formatNumber } from "@/lib/format";

export type PartnerContractView = {
  id: string;
  type: ContractType;
  startsAt: string;
  endsAt: string;
  fixedAmountCents: number | null;
  commissionPercent: number | null;
  commissionPerUnitCents: number | null;
  minimumCents: number | null;
  notes: string | null;
  isCurrent: boolean;
  volume: { amountCents: number; units: number; count: number; unpriced: number };
  estimate: { fixedCents: number; variableCents: number; totalCents: number; note: string };
};

const TYPE_HINTS: Record<ContractType, string> = {
  FLAT_FEE: "Un montant fixe, sans part variable.",
  COMMISSION: "Un pourcentage du montant HT attribué et/ou un montant par unité, avec un minimum éventuel.",
  HYBRID: "Un montant fixe plus une part variable.",
  PILOT: "Période d'essai, sans rémunération.",
  FREE: "Aucune rémunération.",
};

const usesFixed = (type: ContractType) => type === "FLAT_FEE" || type === "HYBRID";
const usesVariable = (type: ContractType) => type === "COMMISSION" || type === "HYBRID";

function periodOf(contract: PartnerContractView): string {
  if (!contract.startsAt && !contract.endsAt) return "Sans dates";
  if (contract.startsAt && contract.endsAt) return `Du ${formatDate(contract.startsAt)} au ${formatDate(contract.endsAt)}`;
  return contract.startsAt ? `À partir du ${formatDate(contract.startsAt)}` : `Jusqu'au ${formatDate(contract.endsAt)}`;
}

function termsOf(contract: PartnerContractView): string[] {
  const terms: string[] = [];
  if (contract.fixedAmountCents !== null) terms.push(`Fixe ${formatCents(contract.fixedAmountCents)}`);
  if (contract.commissionPercent !== null) terms.push(`${formatNumber(contract.commissionPercent)} % du montant HT`);
  if (contract.commissionPerUnitCents !== null) terms.push(`${formatCents(contract.commissionPerUnitCents)} par unité`);
  if (contract.minimumCents !== null) terms.push(`minimum ${formatCents(contract.minimumCents)}`);
  return terms;
}

const toInput = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));

/**
 * Les contrats internes du partenaire, avec une estimation INDICATIVE calculée
 * sur les seules commandes réellement attribuées (transmises ou confirmées)
 * pendant la période du contrat. Rien n'est facturé.
 */
export function PartnerContracts({ partnerId, contracts }: { partnerId: string; contracts: PartnerContractView[] }) {
  const [editing, setEditing] = useState<PartnerContractView | "new" | null>(null);

  return (
    <div className="space-y-3">
      {contracts.length === 0 ? (
        <p className="text-[13px] text-text-secondary">Aucun contrat enregistré.</p>
      ) : (
        <ul className="space-y-3">
          {contracts.map((contract) => {
            const terms = termsOf(contract);
            return (
              <li key={contract.id} className="space-y-2 rounded-lg border border-border-subtle p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium text-text-primary">
                      <FileSignature className="size-3.5 text-text-tertiary" aria-hidden="true" />
                      {CONTRACT_TYPE_LABELS[contract.type]}
                      {contract.isCurrent && <Badge tone="success">En cours</Badge>}
                    </p>
                    <p className="text-[12.5px] text-text-tertiary">{periodOf(contract)}</p>
                    {terms.length > 0 && <p className="text-[12.5px] text-text-secondary">{terms.join(" · ")}</p>}
                  </div>
                  <Button size="sm" variant="outline" leadingIcon={<Pencil className="size-3.5" />} onClick={() => setEditing(contract)}>
                    Modifier
                  </Button>
                </div>
                {contract.notes && <p className="text-[12.5px] break-words whitespace-pre-wrap text-text-secondary">{contract.notes}</p>}
                <div className="rounded-md bg-surface-sunken/70 px-3 py-2 text-[12.5px] leading-5 text-text-secondary">
                  <p>
                    <span className="font-medium text-text-primary">Estimation indicative, non facturée : {formatCents(contract.estimate.totalCents)}</span>
                    {contract.estimate.fixedCents > 0 && contract.estimate.variableCents > 0 && ` (fixe ${formatCents(contract.estimate.fixedCents)} + variable ${formatCents(contract.estimate.variableCents)})`}
                  </p>
                  <p>
                    {contract.volume.count === 0
                      ? "Aucune commande transmise ou confirmée n'est attribuée à ce partenaire sur la période."
                      : `Sur ${formatNumber(contract.volume.count)} commande${contract.volume.count > 1 ? "s" : ""} transmise${contract.volume.count > 1 ? "s" : ""} ou confirmée${contract.volume.count > 1 ? "s" : ""} : ${formatCents(contract.volume.amountCents)} HT, ${formatNumber(contract.volume.units)} unité${contract.volume.units > 1 ? "s" : ""}.`}
                    {contract.volume.unpriced > 0 && ` ${contract.volume.unpriced} sans montant connu, comptée${contract.volume.unpriced > 1 ? "s" : ""} pour leurs seules unités.`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Button size="sm" variant="outline" leadingIcon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>
        Ajouter un contrat
      </Button>
      {editing && <ContractModal partnerId={partnerId} contract={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ContractModal({ partnerId, contract, onClose }: { partnerId: string; contract: PartnerContractView | null; onClose: () => void }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [type, setType] = useState<ContractType>(contract?.type ?? "COMMISSION");
  const [startsAt, setStartsAt] = useState(contract?.startsAt ?? "");
  const [endsAt, setEndsAt] = useState(contract?.endsAt ?? "");
  const [fixedAmount, setFixedAmount] = useState(toInput(contract?.fixedAmountCents ?? null));
  const [commissionPercent, setCommissionPercent] = useState(contract?.commissionPercent !== null && contract?.commissionPercent !== undefined ? String(contract.commissionPercent).replace(".", ",") : "");
  const [commissionPerUnit, setCommissionPerUnit] = useState(toInput(contract?.commissionPerUnitCents ?? null));
  const [minimum, setMinimum] = useState(toInput(contract?.minimumCents ?? null));
  const [notes, setNotes] = useState(contract?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  const submit = () =>
    start(async () => {
      setError(null);
      const result = await savePartnerContractAction({ partnerId, id: contract?.id ?? null, type, startsAt, endsAt, fixedAmount, commissionPercent, commissionPerUnit, minimum, notes });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "Contrat enregistré." });
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={contract ? "Modifier le contrat" : "Nouveau contrat"}
      description="Strictement interne à PharmaBoost : rien n'est facturé ni montré au partenaire ou aux officines."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={pending} onClick={submit}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Type" htmlFor="ct-type" error={fieldErrors.type} hint={TYPE_HINTS[type]}>
          <Select id="ct-type" value={type} onChange={(event) => setType(event.target.value as ContractType)}>
            {CONTRACT_TYPES.map((value) => (
              <option key={value} value={value}>
                {CONTRACT_TYPE_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Début" htmlFor="ct-starts" error={fieldErrors.startsAt}>
            <Input id="ct-starts" type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
          </Field>
          <Field label="Fin" htmlFor="ct-ends" error={fieldErrors.endsAt}>
            <Input id="ct-ends" type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
          </Field>
        </div>
        {(usesFixed(type) || usesVariable(type)) && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {usesFixed(type) && (
              <Field label="Montant fixe HT (€)" htmlFor="ct-fixed" required error={fieldErrors.fixedAmount}>
                <Input id="ct-fixed" inputMode="decimal" value={fixedAmount} onChange={(event) => setFixedAmount(event.target.value)} placeholder="0,00" />
              </Field>
            )}
            {usesVariable(type) && (
              <>
                <Field label="Commission (% du HT)" htmlFor="ct-percent" error={fieldErrors.commissionPercent}>
                  <Input id="ct-percent" inputMode="decimal" value={commissionPercent} onChange={(event) => setCommissionPercent(event.target.value)} placeholder="0" />
                </Field>
                <Field label="Par unité HT (€)" htmlFor="ct-unit" error={fieldErrors.commissionPerUnit}>
                  <Input id="ct-unit" inputMode="decimal" value={commissionPerUnit} onChange={(event) => setCommissionPerUnit(event.target.value)} placeholder="0,00" />
                </Field>
                <Field label="Minimum HT (€)" htmlFor="ct-minimum" error={fieldErrors.minimum} hint="Relève la part variable si elle est inférieure.">
                  <Input id="ct-minimum" inputMode="decimal" value={minimum} onChange={(event) => setMinimum(event.target.value)} placeholder="0,00" />
                </Field>
              </>
            )}
          </div>
        )}
        <Field label="Notes" htmlFor="ct-notes" error={fieldErrors.notes}>
          <Textarea id="ct-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={8000} />
        </Field>
      </div>
    </Modal>
  );
}
