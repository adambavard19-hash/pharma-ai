"use client";

import { useEffect, useState, useTransition } from "react";
import { Mail, MousePointerClick, Send, Users } from "lucide-react";
import { partnerAudienceAction, savePartnerCampaignAction, sendPartnerCampaignAction } from "@/server/actions/admin-partner-emails";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

type Campaign = { id: string; brandId: string; brand: string; subject: string; body: string; imageUrl: string | null; affiliateUrl: string; universes: string[]; status: string; sentAt: string | null; recipients: number; clicks: number; audience: number | null; createdAt: string };

const EMPTY = { id: null as string | null, brandId: "", subject: "", body: "", imageUrl: "", affiliateUrl: "", universes: [] as string[] };

export function PartnerEmailsPanel({ initialBrandId = "", consents, brands, universes, campaigns }: { initialBrandId?: string; consents: number; brands: { id: string; name: string }[]; universes: { key: string; label: string }[]; campaigns: Campaign[] }) {
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ ...EMPTY, brandId: brands.some((brand) => brand.id === initialBrandId) ? initialBrandId : "" });
  const [audience, setAudience] = useState<number | null>(null);
  const label = (key: string) => universes.find((u) => u.key === key)?.label ?? key;

  useEffect(() => {
    if (form.universes.length === 0) return;
    let live = true;
    partnerAudienceAction(form.universes).then((count) => live && setAudience(count));
    return () => {
      live = false;
    };
  }, [form.universes]);

  const save = () =>
    start(async () => {
      const result = await savePartnerCampaignAction({ ...form, imageUrl: form.imageUrl || null });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré") : result.error });
      if (result.ok) setForm(EMPTY);
    });
  const send = (campaign: Campaign) =>
    start(async () => {
      if (!window.confirm(`Envoyer « ${campaign.subject} » à ${campaign.audience ?? 0} patient(s) ? L'envoi ne se rattrape pas.`)) return;
      const result = await sendPartnerCampaignAction(campaign.id);
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Envoyé") : result.error });
    });

  return (
    <div className="space-y-6" data-emails-partenaires="">
      <div>
        <h1 className="font-bold text-text-primary">E-mails patients</h1>
        <p className="mt-1 max-w-3xl text-[13.5px] leading-5 text-text-secondary">
          Les patients qui l&apos;ont accepté depuis leur bilan reçoivent les offres des marques partenaires qui correspondent à leurs achats, avec votre lien d&apos;affiliation : chaque achat par ce lien rapporte une commission. Au plus un e-mail par semaine et par patient. Jamais de médicament : seulement des compléments, des soins et de l&apos;hygiène.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: <Users className="size-4" />, label: "Patients inscrits", value: consents },
          { icon: <Send className="size-4" />, label: "E-mails envoyés", value: campaigns.reduce((sum, c) => sum + c.recipients, 0) },
          { icon: <MousePointerClick className="size-4" />, label: "Clics vers les marques", value: campaigns.reduce((sum, c) => sum + c.clicks, 0) },
        ].map((tile) => (
          <div key={tile.label} className="rounded-xl border border-border-subtle bg-surface-card p-4">
            <p className="flex items-center gap-2 text-[13px] text-text-secondary">{tile.icon} {tile.label}</p>
            <p className="mt-2 text-[28px] font-bold text-text-primary tabular-nums">{tile.value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-border-subtle bg-surface-card p-5">
        <h2 className="text-[15px] font-semibold text-text-primary">Nouvelle campagne</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <select aria-label="Marque" className="h-10 rounded-lg border border-border-default bg-surface-card px-3 text-[14px]" value={form.brandId} onChange={(event) => setForm({ ...form, brandId: event.target.value })}>
            <option value="">Marque partenaire…</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>{brand.name}</option>
            ))}
          </select>
          <Input aria-label="Objet" placeholder="Objet de l'e-mail" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} />
          <Textarea aria-label="Message" placeholder="Le message (laissez une ligne vide entre deux paragraphes)" rows={5} className="md:col-span-2" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} />
          <Input aria-label="Lien d'affiliation" placeholder="Lien d'affiliation (https://…)" value={form.affiliateUrl} onChange={(event) => setForm({ ...form, affiliateUrl: event.target.value })} />
          <Input aria-label="Image" placeholder="Image (https://…, facultatif)" value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} />
        </div>
        <p className="mt-4 text-[13px] font-semibold text-text-primary">Univers visés (les achats des patients)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {universes.map((u) => {
            const on = form.universes.includes(u.key);
            return (
              <button key={u.key} type="button" onClick={() => setForm({ ...form, universes: on ? form.universes.filter((k) => k !== u.key) : [...form.universes, u.key] })} className={`rounded-full border px-3 py-1.5 text-[13px] ${on ? "border-brand-600 bg-brand-50 font-semibold text-brand-800" : "border-border-subtle text-text-secondary"}`}>
                {u.label}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-[13px] text-text-secondary">{form.universes.length ? `${audience ?? "…"} patient(s) concerné(s) aujourd'hui.` : "Choisissez un univers pour voir combien de patients seront touchés."}</p>
          <Button onClick={save} disabled={pending}>Enregistrer la campagne</Button>
        </div>
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface-card">
        <h2 className="border-b border-border-subtle px-5 py-3 text-[15px] font-semibold text-text-primary">Campagnes</h2>
        {campaigns.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13.5px] text-text-tertiary">Aucune campagne pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {campaigns.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                <Mail className="size-4 text-brand-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-text-primary">{c.subject}</p>
                  <p className="text-[12.5px] text-text-tertiary">{c.brand} · {c.universes.map(label).join(", ")}</p>
                </div>
                {c.status === "DRAFT" ? (
                  <>
                    <span className="text-[13px] text-text-secondary">{c.audience ?? 0} patient(s)</span>
                    <Button size="sm" onClick={() => send(c)} disabled={pending || !c.audience}>Envoyer</Button>
                  </>
                ) : (
                  <span className="text-[13px] text-text-secondary">Envoyée à {c.recipients} · {c.clicks} clic(s)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
