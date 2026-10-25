"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Flame, Loader2, Megaphone, Search, Square, X } from "lucide-react";
import { createOverstockCampaignAction, searchOverstockProductsAction, stopOverstockCampaignAction } from "@/server/actions/overstock";
import type { CampaignView, OverstockProduct } from "@/server/services/overstock";
import { OVERSTOCK_SENTENCE_MAX } from "@/core/overstock/campaign";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatCents, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Campaign = Omit<CampaignView, "createdAt"> & { createdAt: string };
type Option = { id: string; name: string };

/** La date du jour + n jours, au format AAAA-MM-JJ. */
function plusDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const END_LABELS: Record<string, string> = { OBJECTIF: "objectif de stock atteint", DATE: "date de fin passée", MANUEL: "arrêtée à la main" };

export function OverstockManager({ canEdit, today, classes, families, suggestions, campaigns }: { canEdit: boolean; today: string; classes: { code: string; label: string }[]; families: Option[]; suggestions: OverstockProduct[]; campaigns: Campaign[] }) {
  const [product, setProduct] = useState<OverstockProduct | null>(null);
  const active = campaigns.filter((campaign) => campaign.isActive);
  const ended = campaigns.filter((campaign) => !campaign.isActive);
  const classLabel = new Map(classes.map((item) => [item.code, item.label]));

  return (
    <div className="space-y-8">
      <section aria-labelledby="surstock-encours" className="space-y-3">
        <h2 id="surstock-encours" className="text-[15px] font-semibold text-text-primary">Campagnes en cours {active.length > 0 && <span className="text-text-tertiary">· {active.length}</span>}</h2>
        {active.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-default px-4 py-5 text-[13.5px] text-text-secondary">Aucune campagne en cours. {canEdit ? "Choisissez un produit ci-dessous pour en lancer une." : "Le titulaire ou le pharmacien en lance une depuis cet écran."}</p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {active.map((campaign) => (
              <li key={campaign.id}>
                <CampaignCard campaign={campaign} classLabel={classLabel} canEdit={canEdit} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {canEdit && (
        <section aria-labelledby="surstock-lancer" className="space-y-3">
          <h2 id="surstock-lancer" className="text-[15px] font-semibold text-text-primary">Lancer une campagne</h2>
          <Card>
            <CardContent className="space-y-5 p-5">
              <ProductPicker product={product} onPick={setProduct} />
              {product ? (
                <CampaignForm key={product.id} product={product} today={today} classes={classes} families={families} onDone={() => setProduct(null)} />
              ) : (
                suggestions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[13px] font-medium text-text-secondary">Ce qui immobilise le plus d&apos;argent dans vos rayons (stock × prix d&apos;achat) :</p>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {suggestions.map((item) => (
                        <li key={item.id}>
                          <button type="button" onClick={() => setProduct(item)} data-suggestion={item.id} className="flex w-full items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-card px-3 py-2.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/50">
                            <span className="min-w-0">
                              <span className="block truncate text-[13.5px] font-medium text-text-primary">{item.name}</span>
                              <span className="block text-[12px] text-text-tertiary">{item.quantity} en stock{item.brand ? ` · ${item.brand}` : ""}</span>
                            </span>
                            {item.tiedUpCents !== null && <span className="shrink-0 text-[13px] font-semibold text-warning-700 tabular-nums">{formatCents(item.tiedUpCents)}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {ended.length > 0 && (
        <section aria-labelledby="surstock-terminees" className="space-y-3">
          <h2 id="surstock-terminees" className="text-[15px] font-semibold text-text-primary">Campagnes terminées</h2>
          <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface-card">
            {ended.map((campaign) => (
              <li key={campaign.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[13px]">
                <span className="min-w-0">
                  <span className="font-medium text-text-primary">{campaign.product.name}</span>
                  <span className="text-text-tertiary"> · lancée le {formatDate(campaign.createdAt)} · {END_LABELS[campaign.endedReason ?? ""] ?? "terminée"}</span>
                </span>
                <span className="text-text-secondary tabular-nums">{campaign.startQuantity} → {campaign.product.quantity} en stock · {campaign.soldByAdvice} vendu{campaign.soldByAdvice > 1 ? "s" : ""} sur conseil</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CampaignCard({ campaign, classLabel, canEdit }: { campaign: Campaign; classLabel: Map<string, string>; canEdit: boolean }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const { product } = campaign;
  const toSell = Math.max(1, campaign.startQuantity - campaign.targetQuantity);
  const done = Math.min(toSell, Math.max(0, campaign.startQuantity - product.quantity));
  const percent = Math.round((done / toSell) * 100);

  const stop = () =>
    start(async () => {
      const result = await stopOverstockCampaignAction({ id: campaign.id });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Campagne arrêtée.") : result.error });
      if (result.ok) router.refresh();
    });

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Badge tone="warning" icon={<Flame className="size-3" aria-hidden="true" />}>Surstock</Badge>
            <h3 className="mt-1.5 text-[15px] leading-5 font-semibold text-text-primary">{product.name}</h3>
            {product.brand && <p className="text-[12.5px] text-text-tertiary">{product.brand}</p>}
          </div>
          {product.tiedUpCents !== null && (
            <div className="shrink-0 text-right">
              <p className="text-[11px] text-text-tertiary">Encore immobilisé</p>
              <p className="text-[16px] font-semibold text-warning-700 tabular-nums">{formatCents(product.tiedUpCents)}</p>
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-[12.5px] text-text-secondary">
            <span><span className="font-semibold text-text-primary tabular-nums">{campaign.startQuantity} → {product.quantity}</span> en stock · objectif {campaign.targetQuantity}</span>
            <span className="tabular-nums">{percent} %</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Avancement vers l'objectif de stock">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-[12.5px] text-text-secondary">
            <span className="font-semibold text-text-primary tabular-nums">{campaign.soldByAdvice}</span> vendu{campaign.soldByAdvice > 1 ? "s" : ""} sur conseil PharmaBoost depuis le {formatDate(campaign.createdAt)}
            {campaign.endsOn ? ` · jusqu'au ${formatDate(campaign.endsOn)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Quand le proposer">
          {campaign.classes.map((code) => <Badge key={code} tone="info">{classLabel.get(code) ?? code}</Badge>)}
          {campaign.families.map((family) => <Badge key={family.id} tone="neutral">{family.name}</Badge>)}
        </div>
        {campaign.sentence && <p className="rounded-lg bg-surface-sunken px-3 py-2 text-[12.5px] text-text-secondary">« {campaign.sentence} »</p>}
        {canEdit && (
          <div className="mt-auto flex justify-end pt-1">
            <Button size="sm" variant="outline" onClick={stop} disabled={pending} leadingIcon={pending ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />}>Arrêter</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProductPicker({ product, onPick }: { product: OverstockProduct | null; onPick: (product: OverstockProduct | null) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OverstockProduct[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const result = await searchOverstockProductsAction({ query: needle });
      if (!cancelled) {
        setResults(result.ok ? result.data : []);
        setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  if (product) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-300 bg-brand-50/60 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[12px] text-text-tertiary">Produit en surstock</p>
          <p className="truncate text-[15px] font-semibold text-text-primary">{product.name}</p>
          <p className="text-[12.5px] text-text-secondary">{product.quantity} en stock{product.tiedUpCents !== null ? ` · ${formatCents(product.tiedUpCents)} immobilisés` : ""}</p>
        </div>
        <button type="button" onClick={() => onPick(null)} aria-label="Changer de produit" className="rounded-full p-1.5 text-text-tertiary hover:bg-surface-sunken"><X className="size-4" /></button>
      </div>
    );
  }
  const shown = query.trim().length >= 2 ? results : [];
  return (
    <div className="space-y-2">
      <label className="block text-[13px] font-medium text-text-primary" htmlFor="surstock-recherche">Quel produit voulez-vous écouler ?</label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-tertiary" aria-hidden="true" />
        <input id="surstock-recherche" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, marque ou code-barres (ex. Immunostim)" className="h-11 w-full rounded-xl border border-border-default bg-surface-card pr-3 pl-9 text-[14px]" autoComplete="off" />
        {loading && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-text-tertiary" aria-hidden="true" />}
      </div>
      {shown.length > 0 && (
        <ul className="max-h-72 divide-y divide-border-subtle overflow-auto rounded-xl border border-border-subtle bg-surface-card">
          {shown.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => onPick(item)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[13.5px] hover:bg-surface-sunken">
                <span className="min-w-0 truncate">{item.name}{item.brand ? <span className="text-text-tertiary"> · {item.brand}</span> : null}</span>
                <span className="shrink-0 text-[12.5px] text-text-secondary tabular-nums">{item.quantity} en stock</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length >= 2 && !loading && results.length === 0 && <p className="text-[12.5px] text-text-tertiary">Aucun produit en stock ne correspond.</p>}
    </div>
  );
}

function CampaignForm({ product, today, classes, families, onDone }: { product: OverstockProduct; today: string; classes: { code: string; label: string }[]; families: Option[]; onDone: () => void }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [atcCodes, setAtcCodes] = useState<string[]>([]);
  const [familyIds, setFamilyIds] = useState<string[]>([]);
  const [familyQuery, setFamilyQuery] = useState("");
  const [sentence, setSentence] = useState("");
  const [target, setTarget] = useState("0");
  // L'échéance de la facture fournisseur : 60 jours, par défaut.
  const [endsOn, setEndsOn] = useState(plusDays(today, 60));
  const [error, setError] = useState<string | null>(null);

  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  const shownFamilies = useMemo(() => {
    const needle = familyQuery.trim().toLowerCase();
    return families.filter((family) => familyIds.includes(family.id) || !needle || family.name.toLowerCase().includes(needle));
  }, [families, familyIds, familyQuery]);

  const submit = () =>
    start(async () => {
      setError(null);
      const result = await createOverstockCampaignAction({ productId: product.id, atcCodes, familyIds, sentence, targetQuantity: Number(target), endsOn: endsOn || null });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Campagne lancée." });
      onDone();
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-text-primary">Le proposer sur les ordonnances de…</legend>
        <div className="flex flex-wrap gap-2">
          {classes.map((item) => (
            <Toggle key={item.code} on={atcCodes.includes(item.code)} onClick={() => setAtcCodes((list) => toggle(list, item.code))} data-classe={item.code}>{item.label}</Toggle>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-text-primary">…et à la place des conseils de ces familles</legend>
        <p className="text-[12.5px] text-text-tertiary">Quand PharmaBoost allait conseiller un produit de ces familles, ou que le patient en prend un, votre produit passe en premier. L&apos;autre reste proposé si le patient n&apos;en veut pas.</p>
        <input value={familyQuery} onChange={(event) => setFamilyQuery(event.target.value)} placeholder="Filtrer les familles (vitamines, immunité, magnésium…)" className="h-10 w-full rounded-xl border border-border-default bg-surface-card px-3 text-[13.5px]" />
        <div className="flex max-h-48 flex-wrap gap-2 overflow-auto">
          {shownFamilies.map((family) => (
            <Toggle key={family.id} on={familyIds.includes(family.id)} onClick={() => setFamilyIds((list) => toggle(list, family.id))} data-famille={family.name}>{family.name}</Toggle>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="block text-[13px] font-medium text-text-primary">S&apos;arrêter quand il reste</span>
          <span className="flex items-center gap-2">
            <input type="number" min={0} max={Math.max(0, product.quantity - 1)} value={target} onChange={(event) => setTarget(event.target.value)} className="h-10 w-24 rounded-xl border border-border-default bg-surface-card px-3 text-[14px] tabular-nums" />
            <span className="text-[13px] text-text-secondary">boîtes (sur {product.quantity})</span>
          </span>
        </label>
        <label className="space-y-1.5">
          <span className="block text-[13px] font-medium text-text-primary">Au plus tard le</span>
          <input type="date" min={plusDays(today, 1)} value={endsOn} onChange={(event) => setEndsOn(event.target.value)} className="h-10 rounded-xl border border-border-default bg-surface-card px-3 text-[14px]" />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="block text-[13px] font-medium text-text-primary">Ce que l&apos;équipe dit au patient <span className="font-normal text-text-tertiary">(facultatif)</span></span>
        <textarea value={sentence} onChange={(event) => setSentence(event.target.value.slice(0, OVERSTOCK_SENTENCE_MAX))} rows={2} placeholder="Ex. : Pour vous aider à retrouver vos défenses pendant et après le traitement, je vous conseille…" className="w-full rounded-xl border border-border-default bg-surface-card px-3 py-2 text-[13.5px]" />
      </label>

      {error && <p role="alert" className="text-[13px] font-medium text-danger-700">{error}</p>}
      <div className="flex justify-end">
        <Button onClick={submit} disabled={pending} leadingIcon={pending ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" />}>Lancer la campagne</Button>
      </div>
    </div>
  );
}

function Toggle({ on, onClick, children, ...rest }: { on: boolean; onClick: () => void; children: React.ReactNode } & Record<`data-${string}`, string>) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} {...rest} className={cn("h-8 rounded-full border px-3 text-[12.5px] font-medium transition-colors", on ? "border-brand-600 bg-brand-600 text-white" : "border-border-default bg-surface-card text-text-secondary hover:border-brand-300")}>
      {children}
    </button>
  );
}
