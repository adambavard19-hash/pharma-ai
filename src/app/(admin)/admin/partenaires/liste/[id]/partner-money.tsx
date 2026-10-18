"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Mail, Trash2 } from "lucide-react";
import { addPartnerEarningAction, removePartnerEarningAction } from "@/server/actions/admin-partner-earnings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

type Earning = { id: string; kind: string; amountCents: number; receivedOn: string; note: string | null; createdByName: string | null };
type Campaign = { id: string; subject: string; status: string; sentAt: string | null; recipients: number; clicks: number; brand: string };

const euros = (cents: number) => (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

/** Ce que le partenaire nous rapporte, et ses e-mails patients (17 oct. 2026). */
export function PartnerMoney({ partnerId, brands, money, kinds }: { partnerId: string; brands: { id: string; name: string }[]; money: { totalCents: number; yearCents: number; monthCents: number; sent: number; clicks: number; earnings: Earning[]; campaigns: Campaign[] }; kinds: { key: string; label: string }[] }) {
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState(kinds[0]?.key ?? "AFFILIATION");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const label = (key: string) => kinds.find((k) => k.key === key)?.label ?? key;

  const add = () =>
    start(async () => {
      const cents = Math.round(Number(amount.replace(",", ".")) * 100);
      const result = await addPartnerEarningAction({ partnerId, kind, amountCents: cents, receivedOn: day, note: note || null });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré") : result.error });
      if (result.ok) {
        setAmount("");
        setNote("");
      }
    });

  return (
    <div className="space-y-5" data-remuneration-partenaire="">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Ce mois-ci", money.monthCents],
          ["Cette année", money.yearCents],
          ["Depuis le début", money.totalCents],
        ].map(([title, cents]) => (
          <div key={title as string} className="rounded-xl bg-surface-sunken/60 px-4 py-3">
            <p className="text-[12.5px] text-text-secondary">{title}</p>
            <p className="mt-1 text-[22px] font-bold text-success-700 tabular-nums dark:text-success-400">{euros(cents as number)}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="text-[13px] font-semibold text-text-primary">Enregistrer une rémunération reçue</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select aria-label="Type" className="h-10 rounded-lg border border-border-default bg-surface-card px-3 text-[13.5px]" value={kind} onChange={(event) => setKind(event.target.value)}>
            {kinds.map((k) => (
              <option key={k.key} value={k.key}>{k.label}</option>
            ))}
          </select>
          <Input aria-label="Montant en euros" placeholder="Montant (€)" inputMode="decimal" className="w-32" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d,.]/g, ""))} />
          <Input aria-label="Reçu le" type="date" className="w-40" value={day} onChange={(event) => setDay(event.target.value)} />
          <Input aria-label="Note" placeholder="Note (relevé, période…)" className="w-60" value={note} onChange={(event) => setNote(event.target.value)} />
          <Button size="sm" onClick={add} disabled={pending || !amount}>Enregistrer</Button>
        </div>
        {money.earnings.length > 0 && (
          <ul className="mt-3 divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {money.earnings.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                <span className="w-24 text-text-tertiary tabular-nums">{new Date(e.receivedOn).toLocaleDateString("fr-FR")}</span>
                <span className="min-w-0 flex-1 text-text-primary">{label(e.kind)}{e.note ? <span className="text-text-tertiary"> · {e.note}</span> : null}</span>
                <span className="font-semibold text-text-primary tabular-nums">{euros(e.amountCents)}</span>
                <button type="button" aria-label="Retirer cette ligne" className="rounded-md p-1 text-text-tertiary hover:text-danger-600" disabled={pending} onClick={() => start(async () => { const r = await removePartnerEarningAction(e.id, partnerId); push({ tone: r.ok ? "success" : "error", title: r.ok ? (r.message ?? "Retiré") : r.error }); })}>
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border-subtle pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-text-primary">E-mails patients · {money.sent} envoi{money.sent > 1 ? "s" : ""} · {money.clicks} clic{money.clicks > 1 ? "s" : ""} vers ses liens</p>
          {brands.length > 0 && (
            <Link href={`/admin/partenaires/emails-patients?marque=${encodeURIComponent(brands[0].id)}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-[13px] font-semibold text-white hover:bg-brand-700" data-envoyer-emails="">
              <Mail className="size-4" /> Envoyer un e-mail aux patients
            </Link>
          )}
        </div>
        {money.campaigns.length === 0 ? (
          <p className="mt-2 text-[13px] text-text-tertiary">Aucune campagne pour ce partenaire pour l&apos;instant.</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-[13px]">
            {money.campaigns.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-text-primary">{c.subject} <span className="text-text-tertiary">· {c.brand}</span></span>
                <span className="shrink-0 text-text-secondary">{c.status === "SENT" ? `envoyée à ${c.recipients} · ${c.clicks} clic(s)` : "brouillon"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
