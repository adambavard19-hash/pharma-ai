"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitSiteLeadAction } from "@/server/actions/site-leads";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";

const LGOS = ["LGPI (Pharmagest)", "Winpharma", "Smart Rx", "Leo (Isipharm)", "Périphar", "Alliance+", "Autre"];
const SLOTS = ["Matin (9 h – 12 h)", "Début d'après-midi (14 h – 16 h)", "Fin d'après-midi (16 h – 19 h)"];

/**
 * Un seul formulaire pour deux demandes : la démonstration et l'abonnement.
 * Rien d'autre que les coordonnées de l'officine : aucune donnée de santé,
 * aucune donnée patient.
 */
export function LeadForm({ kind, referralCode = "" }: { kind: "DEMO" | "SUBSCRIBE"; referralCode?: string }) {
  const [form, setForm] = useState({ pharmacyName: "", contactName: "", email: "", phone: "", city: "", lgo: "", postCount: "2", message: "", preferredSlot: "", referralCode, website: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const postCount = Number(form.postCount);
      const result = await submitSiteLeadAction({ kind, ...form, postCount: Number.isFinite(postCount) && postCount > 0 ? Math.round(postCount) : null });
      if (!result.ok) return setError(result.error);
      router.push(`/decouvrir/merci?type=${kind === "DEMO" ? "demo" : "abonnement"}`);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Officine" htmlFor="lead-pharmacy" required>
          <Input id="lead-pharmacy" value={form.pharmacyName} onChange={set("pharmacyName")} placeholder="Pharmacie du Centre" required autoComplete="organization" />
        </Field>
        <Field label="Votre nom" htmlFor="lead-name" required>
          <Input id="lead-name" value={form.contactName} onChange={set("contactName")} placeholder="Prénom Nom" required autoComplete="name" />
        </Field>
        <Field label="E-mail" htmlFor="lead-email" required>
          <Input id="lead-email" type="email" value={form.email} onChange={set("email")} placeholder="vous@officine.fr" required autoComplete="email" />
        </Field>
        <Field label="Téléphone" htmlFor="lead-phone">
          <Input id="lead-phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="06 …" autoComplete="tel" />
        </Field>
        <Field label="Ville" htmlFor="lead-city">
          <Input id="lead-city" value={form.city} onChange={set("city")} autoComplete="address-level2" />
        </Field>
        <Field label="Logiciel de gestion" htmlFor="lead-lgo">
          <Select id="lead-lgo" value={form.lgo} onChange={set("lgo")}>
            <option value="">Choisir…</option>
            {LGOS.map((lgo) => <option key={lgo} value={lgo}>{lgo}</option>)}
          </Select>
        </Field>
        <Field label="Postes de comptoir" htmlFor="lead-posts">
          <Input id="lead-posts" inputMode="numeric" value={form.postCount} onChange={set("postCount")} className="w-24" />
        </Field>
        {kind === "SUBSCRIBE" && (
          <Field label="Code de parrainage" htmlFor="lead-referral" hint="Si une officine vous a recommandé PharmaBoost : son code réduit son abonnement.">
            <Input id="lead-referral" value={form.referralCode} onChange={set("referralCode")} placeholder="PB-XXXXXX" className="uppercase" autoComplete="off" />
          </Field>
        )}
        {kind === "DEMO" && (
          <Field label="Créneau préféré" htmlFor="lead-slot">
            <Select id="lead-slot" value={form.preferredSlot} onChange={set("preferredSlot")}>
              <option value="">Indifférent</option>
              {SLOTS.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
            </Select>
          </Field>
        )}
      </div>
      <Field label={kind === "DEMO" ? "Ce que vous voulez voir en priorité" : "Un mot sur votre officine"} htmlFor="lead-message">
        <Textarea id="lead-message" value={form.message} onChange={set("message")} rows={3} placeholder={kind === "DEMO" ? "L'avis au bip, la lecture d'ordonnance, le stock…" : "Nombre de collaborateurs, parapharmacie, projets…"} />
      </Field>
      {/* Pot de miel, invisible pour une personne. */}
      <div className="absolute -left-[9999px] top-auto" aria-hidden="true">
        <label htmlFor="lead-website">Site web</label>
        <input id="lead-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
      </div>
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button type="submit" size="lg" loading={pending}>
          {kind === "DEMO" ? "Réserver ma démo" : "Demander mon contrat"}
        </Button>
        <p className="text-[12.5px] text-text-tertiary">
          {kind === "DEMO" ? "Vingt minutes, en visio ou par téléphone, sur votre poste." : "Premier mois offert. Prélèvement bancaire ensuite, résiliable à tout moment."}
        </p>
      </div>
    </form>
  );
}
