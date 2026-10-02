"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgePercent, Pencil, Plus } from "lucide-react";
import { savePartnerOfferAction } from "@/server/actions/platform-partner-brands";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import type { PublicationStatus } from "@/core/partners/status";
import { centsToInput, formatCents, formatDate } from "@/lib/format";
import { PublicationBadge } from "../marques/_components/publication-badge";
import { PublicationStatusControl } from "../marques/_components/status-control";

export type OfferRow = {
  id: string;
  title: string;
  conditions: string;
  discountPercent: number | null;
  minimumOrderCents: number | null;
  validFrom: string | null;
  validTo: string | null;
  status: PublicationStatus;
  partner: { id: string; name: string };
  brand: { id: string; name: string } | null;
  range: { id: string; name: string } | null;
};

export type OfferTargetRow = { id: string; name: string; brands: { id: string; name: string; ranges: { id: string; name: string }[] }[] };

type OfferForm = {
  id: string | null;
  partnerId: string;
  brandId: string;
  rangeId: string;
  title: string;
  conditions: string;
  discountPercent: string;
  minimumOrder: string;
  validFrom: string;
  validTo: string;
};

function validity(offer: OfferRow): string {
  if (offer.validFrom && offer.validTo) return `du ${formatDate(offer.validFrom)} au ${formatDate(offer.validTo)}`;
  if (offer.validFrom) return `à partir du ${formatDate(offer.validFrom)}`;
  if (offer.validTo) return `jusqu'au ${formatDate(offer.validTo)}`;
  return "sans date limite";
}

const percent = (value: number) => `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;

/** Les conditions professionnelles des partenaires. Créées en brouillon, publiées comme une marque. */
export function OffersManager({ offers, targets, defaultBrandId, pilotCount }: { offers: OfferRow[]; targets: OfferTargetRow[]; defaultBrandId: string | null; pilotCount: number }) {
  const router = useRouter();
  const { push } = useToast();
  const [form, setForm] = useState<OfferForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const partner = form ? targets.find((target) => target.id === form.partnerId) : undefined;
  const brand = partner?.brands.find((row) => row.id === form?.brandId);

  const open = (offer: OfferRow | null) => {
    setError(null);
    setFieldErrors({});
    if (offer) {
      setForm({
        id: offer.id,
        partnerId: offer.partner.id,
        brandId: offer.brand?.id ?? "",
        rangeId: offer.range?.id ?? "",
        title: offer.title,
        conditions: offer.conditions,
        discountPercent: offer.discountPercent === null ? "" : String(offer.discountPercent).replace(".", ","),
        minimumOrder: offer.minimumOrderCents === null ? "" : centsToInput(offer.minimumOrderCents),
        validFrom: offer.validFrom ?? "",
        validTo: offer.validTo ?? "",
      });
      return;
    }
    const owner = defaultBrandId ? targets.find((target) => target.brands.some((row) => row.id === defaultBrandId)) : undefined;
    setForm({ id: null, partnerId: owner?.id ?? "", brandId: owner ? (defaultBrandId as string) : "", rangeId: "", title: "", conditions: "", discountPercent: "", minimumOrder: "", validFrom: "", validTo: "" });
  };

  const submit = () => {
    if (!form) return;
    setError(null);
    setFieldErrors({});
    start(async () => {
      const result = await savePartnerOfferAction(form);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "Offre enregistrée." });
      setForm(null);
      router.refresh();
    });
  };

  const hasBrands = targets.some((target) => target.brands.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-text-secondary">{offers.length === 0 ? "Aucune offre." : `${offers.length} offre${offers.length > 1 ? "s" : ""}`}</p>
        <Button leadingIcon={<Plus className="size-4" />} onClick={() => open(null)} disabled={!hasBrands} title={hasBrands ? undefined : "Créez d'abord une marque"}>
          Nouvelle offre
        </Button>
      </div>

      {offers.length === 0 ? (
        <Card>
          <EmptyState icon={<BadgePercent className="size-5" />} title="Aucune offre" description="Les conditions professionnelles négociées avec les partenaires (remise, minimum de commande, période) apparaîtront ici." />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {offers.map((offer) => (
            <li key={offer.id}>
              <Card className="h-full">
                <CardContent className="space-y-2 pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <PublicationBadge status={offer.status} />
                    <span className="text-[12.5px] text-text-tertiary">{[offer.partner.name, offer.brand?.name, offer.range ? `gamme ${offer.range.name}` : null].filter(Boolean).join(" · ")}</span>
                  </div>
                  <p className="text-[15px] leading-5 font-semibold break-words text-text-primary">{offer.title}</p>
                  <p className="text-[13px] leading-5 break-words whitespace-pre-line text-text-secondary">{offer.conditions}</p>
                  <p className="text-[12.5px] text-text-tertiary">
                    {[offer.discountPercent !== null ? `Remise ${percent(offer.discountPercent)}` : null, offer.minimumOrderCents !== null ? `minimum ${formatCents(offer.minimumOrderCents)} HT` : null, validity(offer)].filter(Boolean).join(" · ")}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <Button size="sm" variant="outline" leadingIcon={<Pencil className="size-3.5" />} onClick={() => open(offer)}>
                      Modifier
                    </Button>
                    <PublicationStatusControl target={{ kind: "offer", id: offer.id }} current={offer.status} name={offer.title} pilotCount={pilotCount} />
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? "Modifier l'offre" : "Nouvelle offre"}
        description={form?.id ? undefined : "Créée en brouillon : aucune officine ne la voit avant sa publication."}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setForm(null)}>
              Annuler
            </Button>
            <Button loading={pending} onClick={submit}>
              Enregistrer
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Partenaire" htmlFor="offer-partner" required error={fieldErrors.partnerId}>
                <Select id="offer-partner" value={form.partnerId} onChange={(event) => setForm({ ...form, partnerId: event.target.value, brandId: "", rangeId: "" })}>
                  <option value="">Choisir…</option>
                  {targets.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Marque" htmlFor="offer-brand" required error={fieldErrors.brandId}>
                <Select id="offer-brand" value={form.brandId} disabled={!partner} onChange={(event) => setForm({ ...form, brandId: event.target.value, rangeId: "" })}>
                  <option value="">{partner && partner.brands.length === 0 ? "Aucune marque" : "Choisir…"}</option>
                  {partner?.brands.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Gamme" htmlFor="offer-range" hint="Facultatif." error={fieldErrors.rangeId}>
                <Select id="offer-range" value={form.rangeId} disabled={!brand} onChange={(event) => setForm({ ...form, rangeId: event.target.value })}>
                  <option value="">Toute la marque</option>
                  {brand?.ranges.map((range) => (
                    <option key={range.id} value={range.id}>
                      {range.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Titre" htmlFor="offer-title" required error={fieldErrors.title}>
              <Input id="offer-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={200} />
            </Field>
            <Field label="Conditions" htmlFor="offer-conditions" required hint="Les conditions telles que convenues avec le partenaire." error={fieldErrors.conditions}>
              <Textarea id="offer-conditions" value={form.conditions} onChange={(event) => setForm({ ...form, conditions: event.target.value })} rows={4} maxLength={4000} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Remise (%)" htmlFor="offer-discount" hint="Facultatif." error={fieldErrors.discountPercent}>
                <Input id="offer-discount" inputMode="decimal" value={form.discountPercent} onChange={(event) => setForm({ ...form, discountPercent: event.target.value })} placeholder="10" />
              </Field>
              <Field label="Minimum de commande (€ HT)" htmlFor="offer-minimum" hint="Facultatif." error={fieldErrors.minimumOrder}>
                <Input id="offer-minimum" inputMode="decimal" value={form.minimumOrder} onChange={(event) => setForm({ ...form, minimumOrder: event.target.value })} placeholder="150,00" />
              </Field>
              <Field label="Valable à partir du" htmlFor="offer-from" error={fieldErrors.validFrom}>
                <Input id="offer-from" type="date" value={form.validFrom} onChange={(event) => setForm({ ...form, validFrom: event.target.value })} />
              </Field>
              <Field label="Jusqu'au" htmlFor="offer-to" error={fieldErrors.validTo}>
                <Input id="offer-to" type="date" value={form.validTo} onChange={(event) => setForm({ ...form, validTo: event.target.value })} />
              </Field>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
