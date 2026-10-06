"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { createInvoiceAction } from "@/server/actions/director-money";
import { INVOICE_FILE_MAX_LABEL, INVOICE_NOTE_MAX, INVOICE_NUMBER_MAX, compareInvoiceToCommissions, invoiceFileProblem, parseEurosToCents } from "@/core/sales/director/invoice";
import { COMMISSION_STATUS_LABELS, type CommissionStatusCode } from "@/core/sales/pipeline";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatCents, formatDate } from "@/lib/format";

export type InvoiceRepOption = { id: string; name: string; isActive: boolean };
export type InvoiceCommissionOption = { id: string; salesRepId: string; amountCents: number; status: string; createdAt: string; prospectName: string; city: string | null };

/** Les champs du formulaire, dans l'ordre où on les remplit : le premier en erreur reçoit le focus. */
const ERROR_FIELD_IDS: [string, string][] = [
  ["salesRepId", "invoice-rep"],
  ["number", "invoice-number"],
  ["issuedOn", "invoice-date"],
  ["periodLabel", "invoice-period"],
  ["amount", "invoice-amount"],
  ["file", "invoice-file"],
  ["note", "invoice-note"],
];

const plain = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/**
 * « Enregistrer une facture reçue » : le commercial, le numéro, la date, le
 * montant, les commissions qu'elle réclame et, si on l'a, le PDF. Le montant se
 * remplit tout seul avec le total des commissions cochées tant qu'on n'y a pas
 * touché ; un écart est dit en clair, jamais bloquant. Le serveur relit tout.
 */
export function InvoiceForm({ reps, commissions, defaultRepId, today }: { reps: InvoiceRepOption[]; commissions: InvoiceCommissionOption[]; defaultRepId: string | null; today: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();

  const [salesRepId, setSalesRepId] = useState(defaultRepId && reps.some((rep) => rep.id === defaultRepId) ? defaultRepId : "");
  const [number, setNumber] = useState("");
  const [issuedOn, setIssuedOn] = useState(today);
  const [periodLabel, setPeriodLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const alertRef = useRef<HTMLDivElement>(null);

  const available = commissions.filter((commission) => commission.salesRepId === salesRepId);
  const selected = available.filter((commission) => chosen.includes(commission.id));
  const selectedCents = selected.reduce((total, commission) => total + commission.amountCents, 0);

  const pickRep = (value: string) => {
    setSalesRepId(value);
    setChosen([]);
    if (!amountTouched) setAmount("");
  };

  const toggle = (id: string, checked: boolean) => {
    const next = checked ? [...chosen, id] : chosen.filter((item) => item !== id);
    setChosen(next);
    if (!amountTouched) {
      const total = available.filter((commission) => next.includes(commission.id)).reduce((sum, commission) => sum + commission.amountCents, 0);
      setAmount(total > 0 ? plain(total) : "");
    }
  };

  const typedCents = parseEurosToCents(amount);
  const gap = typedCents !== null && typedCents > 0 && selected.length > 0 ? compareInvoiceToCommissions(typedCents, selectedCents, selected.length) : null;
  const fileProblem = file ? invoiceFileProblem(file) : null;

  /** Montre l'erreur : défile jusqu'au premier champ en cause et lui donne le focus (sinon l'encadré d'erreur), et le dit aussi en bulle. */
  const reveal = (message: string, fields: Record<string, string>) => {
    push({ tone: "error", title: message });
    requestAnimationFrame(() => {
      const first = ERROR_FIELD_IDS.find(([name]) => fields[name]);
      const target = (first && document.getElementById(first[1])) || alertRef.current;
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
      target?.focus({ preventScroll: true });
    });
  };

  const submit = () => {
    setError(null);
    setFieldErrors({});
    if (!salesRepId) {
      const fields = { salesRepId: "Choisissez le commercial." };
      setFieldErrors(fields);
      reveal(fields.salesRepId, fields);
      return;
    }
    if (fileProblem) {
      const fields = { file: fileProblem };
      setFieldErrors(fields);
      reveal(fileProblem, fields);
      return;
    }
    const data = new FormData();
    data.set("salesRepId", salesRepId);
    data.set("number", number);
    data.set("amount", amount);
    data.set("issuedOn", issuedOn);
    data.set("periodLabel", periodLabel);
    data.set("note", note);
    for (const id of selected.map((commission) => commission.id)) data.append("commissionIds", id);
    if (file) data.set("file", file);

    start(async () => {
      const result = await createInvoiceAction(data);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        reveal(result.error, result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "Facture enregistrée." });
      router.push(`/directeur/factures/${result.data.id}`);
    });
  };

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {error && (
        <div ref={alertRef} tabIndex={-1} className="outline-none">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Commercial" htmlFor="invoice-rep" required error={fieldErrors.salesRepId} className="sm:col-span-2">
          <Select id="invoice-rep" value={salesRepId} onChange={(event) => pickRep(event.target.value)} aria-invalid={!!fieldErrors.salesRepId}>
            <option value="">Choisissez…</option>
            {reps.map((rep) => (
              <option key={rep.id} value={rep.id}>
                {rep.name}
                {rep.isActive ? "" : " (inactif)"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Numéro de la facture" htmlFor="invoice-number" required error={fieldErrors.number} hint="Tel qu'il figure sur la facture. Unique pour chaque commercial.">
          <Input id="invoice-number" value={number} maxLength={INVOICE_NUMBER_MAX} onChange={(event) => setNumber(event.target.value)} aria-invalid={!!fieldErrors.number} autoComplete="off" />
        </Field>
        <Field label="Date de la facture" htmlFor="invoice-date" required error={fieldErrors.issuedOn}>
          <Input id="invoice-date" type="date" value={issuedOn} max={today} onChange={(event) => setIssuedOn(event.target.value)} aria-invalid={!!fieldErrors.issuedOn} />
        </Field>
        <Field label="Période concernée" htmlFor="invoice-period" error={fieldErrors.periodLabel} hint="Facultatif. Par exemple : Septembre 2026." className="sm:col-span-2">
          <Input id="invoice-period" value={periodLabel} maxLength={60} onChange={(event) => setPeriodLabel(event.target.value)} />
        </Field>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-[13px] font-medium text-text-primary">Commissions réclamées</legend>
        {!salesRepId ? (
          <p className="text-[13px] text-text-tertiary">Choisissez d&apos;abord le commercial : ses commissions à facturer apparaissent ici.</p>
        ) : available.length === 0 ? (
          <p className="rounded-lg bg-surface-sunken px-3 py-2.5 text-[13px] text-text-secondary">Ce commercial n&apos;a aucune commission à facturer (acquise ou à payer, et pas déjà sur une facture). Vous pouvez enregistrer la facture sans commission.</p>
        ) : (
          <>
            <p className="text-[12.5px] text-text-tertiary">Cochez les commissions que cette facture réclame. Elles sont rattachées à la facture, puis suivent ses étapes.</p>
            <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface-card">
              {available.map((commission) => (
                <li key={commission.id} className="px-4 py-3">
                  <Checkbox
                    id={`invoice-commission-${commission.id}`}
                    checked={chosen.includes(commission.id)}
                    onChange={(event) => toggle(commission.id, event.target.checked)}
                    label={
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span>
                          {commission.prospectName}
                          {commission.city ? ` (${commission.city})` : ""}
                        </span>
                        <span className="font-semibold tabular">{formatCents(commission.amountCents)}</span>
                      </span>
                    }
                    description={`${COMMISSION_STATUS_LABELS[commission.status as CommissionStatusCode] ?? commission.status} · créée le ${formatDate(commission.createdAt)}`}
                  />
                </li>
              ))}
            </ul>
            {selected.length > 0 && (
              <p className="text-[13px] text-text-secondary" role="status">
                {selected.length} commission{selected.length > 1 ? "s" : ""} cochée{selected.length > 1 ? "s" : ""} : <strong className="font-semibold text-text-primary">{formatCents(selectedCents)}</strong>
              </p>
            )}
          </>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Montant de la facture (€)" htmlFor="invoice-amount" required error={fieldErrors.amount} hint={selected.length > 0 && !amountTouched ? "Repris des commissions cochées. Modifiez-le si la facture indique autre chose." : "Le montant écrit sur la facture."}>
          <Input
            id="invoice-amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setAmountTouched(true);
            }}
            aria-invalid={!!fieldErrors.amount}
            placeholder="750,00"
            autoComplete="off"
          />
        </Field>
        <Field label="Facture en PDF" htmlFor="invoice-file" error={fieldErrors.file ?? fileProblem} hint={`Facultatif. PDF, ${INVOICE_FILE_MAX_LABEL} au plus.`}>
          <input
            id="invoice-file"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full text-[13px] text-text-secondary file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-border-default file:bg-surface-raised file:px-3 file:py-2 file:text-[13px] file:font-medium file:text-text-primary hover:file:bg-surface-sunken"
          />
        </Field>
      </div>

      {gap && (
        <p className={gap.kind === "MATCH" ? "rounded-lg bg-success-50 px-3 py-2.5 text-[13px] text-success-700 dark:bg-success-700/15 dark:text-success-500" : "rounded-lg bg-warning-50 px-3 py-2.5 text-[13px] text-warning-700 dark:bg-warning-700/15 dark:text-warning-500"} role="status">
          {gap.message} {gap.kind !== "MATCH" && "Vous pouvez quand même l'enregistrer."}
        </p>
      )}

      <Field label="Note" htmlFor="invoice-note" error={fieldErrors.note} hint="Facultatif. Visible de la direction seulement.">
        <Textarea id="invoice-note" rows={3} value={note} maxLength={INVOICE_NOTE_MAX} onChange={(event) => setNote(event.target.value)} placeholder="Reçue par e-mail le…, point à vérifier…" />
      </Field>

      <div className="flex flex-wrap items-center justify-end gap-2.5">
        <Button asChild variant="ghost">
          <Link href="/directeur/factures">Annuler</Link>
        </Button>
        <Button type="submit" leadingIcon={<Save className="size-4" />} loading={pending}>
          Enregistrer la facture
        </Button>
      </div>
    </form>
  );
}
