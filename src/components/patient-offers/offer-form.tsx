"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLabOfferAction, createPharmacyOfferAction } from "@/server/actions/patient-offers";
import { OFFER_LIMITS } from "@/core/patient-app/offers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Une offre de l'appli des patients : la gamme, la remise, les dates, à qui elle s'adresse. Le titulaire l'écrit pour sa
 * pharmacie ; la console l'écrit pour un laboratoire (avec le prix par boîte qu'il paie à PharmaBoost). Les règles —
 * jamais un médicament, remise de 5 à 70 %, trois mois au plus — sont celles du serveur, rejouées à l'enregistrement.
 */
export function OfferForm({ kind, partners = [] }: { kind: "pharmacy" | "lab"; partners?: { id: string; name: string }[] }) {
  const today = new Date();
  const empty = { title: "", rangeLabel: "", discountPercent: "20", details: "", startsOn: isoDay(today), endsOn: isoDay(new Date(today.getTime() + 30 * 86_400_000)), audience: "SUBSCRIBERS" as "ALL" | "SUBSCRIBERS", partnerId: partners[0]?.id ?? "", labFeeEuros: "2" };
  const [form, setForm] = useState(empty);
  const [pending, start] = useTransition();
  const { push } = useToast();
  const router = useRouter();
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  const submit = () =>
    start(async () => {
      const base = { title: form.title, rangeLabel: form.rangeLabel, discountPercent: Number(form.discountPercent), details: form.details || null, startsOn: form.startsOn, endsOn: form.endsOn, audience: form.audience };
      const result = kind === "lab" ? await createLabOfferAction({ ...base, partnerId: form.partnerId, labFeeEuros: Number(form.labFeeEuros.replace(",", ".")) }) : await createPharmacyOfferAction(base);
      if (!result.ok) return push({ tone: "error", title: result.error });
      push({ tone: "success", title: result.message ?? "Offre publiée." });
      setForm(empty);
      router.refresh();
    });
  return (
    <Card data-offre-formulaire={kind}>
      <CardHeader title={kind === "lab" ? "Nouvelle offre de laboratoire" : "Nouvelle offre"} description={kind === "lab" ? "Valable dans toutes les pharmacies PharmaBoost. Le laboratoire rembourse la remise au pharmacien et paie PharmaBoost à chaque boîte vendue avec l'offre." : "Vos patients la voient dans l'appli PharmaBoost et la montrent au comptoir : la douchette bipe leur code, vous faites la remise en caisse."} />
      <CardContent className="space-y-4">
        {kind === "lab" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="offre-labo">Laboratoire</Label>
              <Select id="offre-labo" value={form.partnerId} onChange={(event) => set({ partnerId: event.target.value })}>
                {partners.length === 0 && <option value="">Aucun partenaire actif</option>}
                {partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="offre-prix">Prix payé par boîte vendue (€)</Label>
              <Input id="offre-prix" inputMode="decimal" value={form.labFeeEuros} onChange={(event) => set({ labFeeEuros: event.target.value })} />
            </div>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="offre-titre">Titre</Label>
            <Input id="offre-titre" maxLength={OFFER_LIMITS.titleMax} placeholder="Nouvelle gamme solaire" value={form.title} onChange={(event) => set({ title: event.target.value })} />
          </div>
          <div>
            <Label htmlFor="offre-gamme">Gamme ou marque</Label>
            <Input id="offre-gamme" maxLength={OFFER_LIMITS.rangeMax} placeholder="Avène Solaire" value={form.rangeLabel} onChange={(event) => set({ rangeLabel: event.target.value })} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <Label htmlFor="offre-remise">Remise (%)</Label>
            <Input id="offre-remise" type="number" min={OFFER_LIMITS.discountMin} max={OFFER_LIMITS.discountMax} value={form.discountPercent} onChange={(event) => set({ discountPercent: event.target.value })} />
          </div>
          <div>
            <Label htmlFor="offre-debut">Début</Label>
            <Input id="offre-debut" type="date" value={form.startsOn} onChange={(event) => set({ startsOn: event.target.value })} />
          </div>
          <div>
            <Label htmlFor="offre-fin">Fin</Label>
            <Input id="offre-fin" type="date" value={form.endsOn} onChange={(event) => set({ endsOn: event.target.value })} />
          </div>
          <div>
            <Label htmlFor="offre-public">Pour qui</Label>
            <Select id="offre-public" value={form.audience} onChange={(event) => set({ audience: event.target.value as "ALL" | "SUBSCRIBERS" })}>
              <option value="SUBSCRIBERS">Abonnés PharmaBoost+</option>
              <option value="ALL">Tous les inscrits (bienvenue)</option>
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="offre-conditions">Conditions (facultatif)</Label>
          <Textarea id="offre-conditions" rows={2} maxLength={OFFER_LIMITS.detailsMax} placeholder="Sur toute la gamme, hors coffrets. Une utilisation par personne." value={form.details} onChange={(event) => set({ details: event.target.value })} />
        </div>
        <p className="text-[12.5px] text-text-secondary">Parapharmacie et produits conseil seulement : une offre qui porte sur un médicament est refusée.</p>
        <div className="flex justify-end">
          <Button onClick={submit} disabled={pending || !form.title || !form.rangeLabel || (kind === "lab" && !form.partnerId)}>
            {pending ? "Publication…" : "Publier l'offre"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
