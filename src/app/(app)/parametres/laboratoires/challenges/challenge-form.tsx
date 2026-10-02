"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2, X } from "lucide-react";
import { saveChallengeAction, searchChallengeProductsAction } from "@/server/actions/challenges";
import type { BrandSuggestion, ChallengeProductOption, ChallengeRow } from "@/server/services/challenges";
import { UNIVERSES } from "@/config/universes";
import { describeChallengeSources } from "@/core/challenges/sources";
import type { RewardMode } from "@/core/challenges/terms";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { centsToInput, parseAmountToCents } from "@/lib/format";
import { cn } from "@/lib/utils";

type Picked = { id: string; name: string; brand: string | null };
type TierDraft = { units: string; bonus: string };

/** La fin du trimestre en cours : la durée la plus courante d'un challenge laboratoire. */
function quarterEnd(today: string): string {
  const [year, month] = today.split("-").map(Number);
  const lastMonth = Math.ceil(month / 3) * 3;
  const lastDay = new Date(Date.UTC(year, lastMonth, 0)).getUTCDate();
  return `${year}-${String(lastMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

const REWARD_OPTIONS: { key: RewardMode; label: string }[] = [
  { key: "PER_UNIT", label: "Prime par unité" },
  { key: "TIERS", label: "Paliers" },
  { key: "NONE", label: "Sans prime" },
];

/**
 * Créer ou modifier un challenge, en une seule fenêtre.
 *
 * Le laboratoire se choisit parmi les marques du stock (ou se tape). Par
 * défaut, toute la marque compte ; on peut aussi cocher des produits précis.
 * La rémunération est une prime par unité OU des paliers, jamais les deux.
 */
export function ChallengeFormModal({
  open,
  onClose,
  challenge,
  brands,
  today,
}: {
  open: boolean;
  onClose: () => void;
  challenge: ChallengeRow | null;
  brands: BrandSuggestion[];
  today: string;
}) {
  if (!open) return null;
  // Le formulaire est remonté à chaque ouverture : ses champs repartent de la valeur enregistrée.
  return <ChallengeForm key={challenge?.id ?? "nouveau"} onClose={onClose} challenge={challenge} brands={brands} today={today} />;
}

function ChallengeForm({ onClose, challenge, brands, today }: { onClose: () => void; challenge: ChallengeRow | null; brands: BrandSuggestion[]; today: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();

  const [title, setTitle] = useState(challenge?.title ?? "");
  const [laboratory, setLaboratory] = useState(challenge?.laboratory ?? "");
  const [brand, setBrand] = useState(
    // La marque n'est affichée que si elle diffère du laboratoire (sinon le champ reste vide : « celle du laboratoire »).
    challenge?.brandLabel && challenge.brandLabel.toUpperCase() !== challenge.laboratory.trim().toUpperCase() ? challenge.brandLabel : "",
  );
  const [universe, setUniverse] = useState(challenge?.universe ?? "");
  const [scope, setScope] = useState<"BRAND" | "PRODUCTS">(challenge && challenge.productIds.length > 0 ? "PRODUCTS" : "BRAND");
  const [picked, setPicked] = useState<Picked[]>(challenge?.selectedProducts.map(({ id, name, brand }) => ({ id, name, brand })) ?? []);
  const [startsOn, setStartsOn] = useState(challenge?.startsOn ?? today);
  const [endsOn, setEndsOn] = useState(challenge?.endsOn ?? quarterEnd(today));
  const [target, setTarget] = useState(challenge?.targetUnits ? String(challenge.targetUnits) : "");
  const [rewardMode, setRewardMode] = useState<RewardMode>(challenge?.rewardMode ?? "PER_UNIT");
  const [bonus, setBonus] = useState(challenge?.bonusPerUnitCents ? centsToInput(challenge.bonusPerUnitCents) : "");
  const [tiers, setTiers] = useState<TierDraft[]>(
    challenge && challenge.tiers.length > 0 ? challenge.tiers.map((tier) => ({ units: String(tier.units), bonus: centsToInput(tier.bonusCents) })) : [{ units: "", bonus: "" }],
  );
  const [countMode, setCountMode] = useState<"ALL_SALES" | "ATTRIBUTED">(challenge?.countMode ?? "ALL_SALES");
  const [notes, setNotes] = useState(challenge?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Les produits de la marque, lus dans le stock de l'officine.
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ brand: string; total: number; items: ChallengeProductOption[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  const effectiveBrand = brand.trim() || laboratory.trim();

  const search = (brandValue: string, queryValue: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (!brandValue.trim() && !queryValue.trim()) {
      setResults(null);
      return;
    }
    timer.current = setTimeout(async () => {
      const id = ++requestId.current;
      setSearching(true);
      const result = await searchChallengeProductsAction({ brand: brandValue, query: queryValue });
      if (id !== requestId.current) return;
      setSearching(false);
      if (result.ok) setResults({ brand: brandValue, ...result.data });
    }, 250);
  };

  const togglePicked = (product: Picked) =>
    setPicked((current) => (current.some((item) => item.id === product.id) ? current.filter((item) => item.id !== product.id) : [...current, product]));

  const submit = () => {
    setFormError(null);
    const targetUnits = target.trim() ? Number(target.trim()) : null;
    const bonusCents = bonus.trim() ? parseAmountToCents(bonus) : null;
    const parsedTiers = tiers
      .filter((tier) => tier.units.trim() || tier.bonus.trim())
      .map((tier) => ({ units: Number(tier.units.trim() || 0), bonusCents: parseAmountToCents(tier.bonus) ?? 0 }));
    const local: Record<string, string> = {};
    if (bonus.trim() && bonusCents === null) local.bonusPerUnitCents = "Montant invalide.";
    if (scope === "PRODUCTS" && picked.length === 0) local.productIds = "Cochez au moins un produit, ou comptez toute la marque.";
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }

    start(async () => {
      const result = await saveChallengeAction({
        id: challenge?.id ?? null,
        title,
        laboratory,
        brand: brand.trim() || null,
        universe: universe || null,
        productIds: scope === "PRODUCTS" ? picked.map((item) => item.id) : [],
        startsOn,
        endsOn,
        targetUnits,
        rewardMode,
        bonusPerUnitCents: rewardMode === "PER_UNIT" ? bonusCents : null,
        tiers: rewardMode === "TIERS" ? parsedTiers : [],
        countMode,
        notes: notes.trim() || null,
      });
      if (!result.ok) {
        const fieldErrors: Record<string, string> = {};
        for (const [key, message] of Object.entries(result.fieldErrors ?? {})) fieldErrors[key.startsWith("tiers") ? "tiers" : key] ??= message;
        setErrors(fieldErrors);
        setFormError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Challenge enregistré." });
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={challenge ? "Modifier le challenge" : "Nouveau challenge"}
      description="Ce que le laboratoire vous propose, tel qu'il vous l'a proposé. Rien de ceci n'apparaît au comptoir."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Annuler
          </Button>
          <Button onClick={submit} loading={pending}>
            {challenge ? "Enregistrer" : "Créer le challenge"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {formError && <Alert tone="danger" title={formError} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Laboratoire" htmlFor="challenge-lab" required error={errors.laboratory}>
            <Input
              id="challenge-lab"
              value={laboratory}
              onChange={(event) => setLaboratory(event.target.value)}
              onBlur={() => scope === "BRAND" && search(brand.trim() || laboratory, "")}
              list="challenge-brands"
              placeholder="Ex. AVENE"
              autoComplete="off"
            />
          </Field>
          <Field label="Titre" htmlFor="challenge-title" required error={errors.title}>
            <Input id="challenge-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex. Solaires été 2027" />
          </Field>
        </div>
        <datalist id="challenge-brands">
          {brands.map((item) => (
            <option key={item.label} value={item.label}>{`${item.references} réf.`}</option>
          ))}
        </datalist>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Début" htmlFor="challenge-start" required error={errors.startsOn}>
            <Input id="challenge-start" type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} />
          </Field>
          <Field label="Fin (incluse)" htmlFor="challenge-end" required error={errors.endsOn}>
            <Input id="challenge-end" type="date" value={endsOn} min={startsOn} onChange={(event) => setEndsOn(event.target.value)} />
          </Field>
          <Field label="Univers" htmlFor="challenge-universe" hint="Facultatif" error={errors.universe}>
            <Select id="challenge-universe" value={universe} onChange={(event) => setUniverse(event.target.value)}>
              <option value="">Aucun</option>
              {UNIVERSES.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-[13px] font-medium text-text-primary">Produits concernés</legend>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Produits concernés">
            <ChoiceCard active={scope === "BRAND"} onClick={() => { setScope("BRAND"); search(effectiveBrand, ""); }} title="Toute la marque" description="Chaque référence de la marque dans votre stock." />
            <ChoiceCard active={scope === "PRODUCTS"} onClick={() => { setScope("PRODUCTS"); search(effectiveBrand, query); }} title="Des produits précis" description="Seulement ceux que vous cochez." />
          </div>

          <Field
            label="Marque telle qu'au stock"
            htmlFor="challenge-brand"
            hint={brand.trim() ? undefined : "Vide : celle du laboratoire."}
            error={errors.brand}
          >
            <Input
              id="challenge-brand"
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
              onBlur={() => search(brand.trim() || laboratory, scope === "PRODUCTS" ? query : "")}
              list="challenge-brands"
              placeholder={laboratory.trim() || "Ex. AVENE"}
              autoComplete="off"
            />
          </Field>

          {scope === "BRAND" && results && results.brand === effectiveBrand && !searching && (
            <p className={cn("text-[12.5px]", results.total === 0 ? "font-medium text-text-primary" : "text-text-secondary")}>
              {results.total === 0
                ? `Aucune référence de votre stock ne correspond à « ${effectiveBrand} » : aucune vente ne pourrait être comptée.`
                : `${results.total} référence${results.total > 1 ? "s" : ""} de votre stock ${results.total > 1 ? "correspondent" : "correspond"} à « ${effectiveBrand} ».`}
            </p>
          )}

          {scope === "PRODUCTS" && (
            <div className="space-y-2">
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  search(effectiveBrand, event.target.value);
                }}
                leadingIcon={<Search className="size-4" />}
                placeholder={effectiveBrand ? `Filtrer les produits ${effectiveBrand}…` : "Rechercher un produit de votre stock…"}
                aria-label="Rechercher un produit"
              />
              {picked.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {picked.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => togglePicked(item)}
                        className="inline-flex max-w-full items-center gap-1 rounded-full border border-border-default bg-surface-sunken px-2.5 py-1 text-[12px] text-text-primary hover:border-border-strong"
                        aria-label={`Retirer ${item.name}`}
                      >
                        <span className="truncate">{item.name}</span>
                        <X className="size-3 shrink-0 text-text-tertiary" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="max-h-60 overflow-y-auto rounded-lg border border-border-subtle">
                {searching ? (
                  <p className="px-3 py-4 text-center text-[12.5px] text-text-tertiary">Recherche dans votre stock…</p>
                ) : !results ? (
                  <p className="px-3 py-4 text-center text-[12.5px] text-text-tertiary">Indiquez le laboratoire ou tapez un nom de produit.</p>
                ) : results.items.length === 0 ? (
                  <p className="px-3 py-4 text-center text-[12.5px] text-text-tertiary">Aucun produit de votre stock ne correspond.</p>
                ) : (
                  <ul className="divide-y divide-border-subtle">
                    {results.items.map((product) => {
                      const checked = picked.some((item) => item.id === product.id);
                      return (
                        <li key={product.id}>
                          <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-surface-sunken">
                            <input
                              type="checkbox"
                              className="size-4 shrink-0 rounded border-border-strong text-brand-600"
                              checked={checked}
                              onChange={() => togglePicked({ id: product.id, name: product.name, brand: product.brand })}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] text-text-primary">{product.name}</span>
                              <span className="block text-[11.5px] text-text-tertiary">
                                {product.inStock === null ? "stock non renseigné" : `${product.inStock} en stock`}
                                {product.isActive ? "" : " · inactif"}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                    {results.total > results.items.length && (
                      <li className="px-3 py-2 text-[12px] text-text-tertiary">
                        {results.total - results.items.length} autres : affinez la recherche.
                      </li>
                    )}
                  </ul>
                )}
              </div>
              {errors.productIds && (
                <p className="text-[12.5px] text-danger-600" role="alert">
                  {errors.productIds}
                </p>
              )}
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-[13px] font-medium text-text-primary">Objectif et rémunération</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Objectif (unités)" htmlFor="challenge-target" hint="Facultatif" error={errors.targetUnits}>
              <Input id="challenge-target" type="number" inputMode="numeric" min={1} step={1} value={target} onChange={(event) => setTarget(event.target.value)} placeholder="Ex. 120" />
            </Field>
            <div className="space-y-1.5">
              <p className="text-[13px] font-medium text-text-primary">Rémunération</p>
              <div className="flex rounded-md border border-border-default p-0.5" role="radiogroup" aria-label="Rémunération">
                {REWARD_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={rewardMode === option.key}
                    onClick={() => setRewardMode(option.key)}
                    className={cn(
                      "flex-1 rounded px-2 py-1.5 text-[12.5px] font-medium whitespace-nowrap transition-colors",
                      rewardMode === option.key ? "bg-brand-600 text-white" : "text-text-secondary hover:text-text-primary",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {rewardMode === "PER_UNIT" && (
            <Field label="Prime par unité (€)" htmlFor="challenge-bonus" required error={errors.bonusPerUnitCents} className="sm:max-w-[50%] sm:pr-2">
              <Input id="challenge-bonus" inputMode="decimal" value={bonus} onChange={(event) => setBonus(event.target.value)} placeholder="Ex. 1,50" />
            </Field>
          )}

          {rewardMode === "TIERS" && (
            <div className="space-y-2">
              <ul className="space-y-2">
                {tiers.map((tier, index) => (
                  <li key={index} className="flex flex-wrap items-center gap-2 text-[13px] text-text-secondary">
                    <span>À partir de</span>
                    <Input
                      aria-label={`Seuil du palier ${index + 1}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={tier.units}
                      onChange={(event) => setTiers((current) => current.map((item, i) => (i === index ? { ...item, units: event.target.value } : item)))}
                      className="w-24"
                      placeholder="50"
                    />
                    <span>unités :</span>
                    <Input
                      aria-label={`Montant du palier ${index + 1}`}
                      inputMode="decimal"
                      value={tier.bonus}
                      onChange={(event) => setTiers((current) => current.map((item, i) => (i === index ? { ...item, bonus: event.target.value } : item)))}
                      className="w-28"
                      placeholder="100,00"
                    />
                    <span>€</span>
                    {tiers.length > 1 && (
                      <Button variant="ghost" size="sm" aria-label={`Retirer le palier ${index + 1}`} onClick={() => setTiers((current) => current.filter((_, i) => i !== index))}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {tiers.length < 10 && (
                <Button variant="outline" size="sm" leadingIcon={<Plus className="size-3.5" />} onClick={() => setTiers((current) => [...current, { units: "", bonus: "" }])}>
                  Ajouter un palier
                </Button>
              )}
              <p className="text-[12px] text-text-tertiary">Seul le palier atteint est acquis : pas de prorata entre deux paliers.</p>
              {errors.tiers && (
                <p className="text-[12.5px] text-danger-600" role="alert">
                  {errors.tiers}
                </p>
              )}
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-[13px] font-medium text-text-primary">Ce qui compte</legend>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Ce qui compte">
            <ChoiceCard
              active={countMode === "ALL_SALES"}
              onClick={() => setCountMode("ALL_SALES")}
              title="Toutes les ventes enregistrées"
              description="Chaque boîte vendue et enregistrée dans PharmaBoost, conseillée ou non."
            />
            <ChoiceCard
              active={countMode === "ATTRIBUTED"}
              onClick={() => setCountMode("ATTRIBUTED")}
              title="Seulement les ventes issues d'un conseil"
              description="Les ventes rattachées à un conseil PharmaBoost accepté au comptoir."
            />
          </div>
          <p className="text-[12px] text-text-tertiary">Vos saisies manuelles s&apos;ajoutent toujours. Source : {describeChallengeSources()}.</p>
        </fieldset>

        <Field label="Notes" htmlFor="challenge-notes" hint="Conditions du laboratoire, contact, référence de l'accord…" error={errors.notes}>
          <Textarea id="challenge-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={1000} />
        </Field>
      </div>
    </Modal>
  );
}

function ChoiceCard({ active, onClick, title, description }: { active: boolean; onClick: () => void; title: string; description: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2.5 text-left transition-colors",
        active ? "border-brand-500 bg-brand-500/10 ring-1 ring-brand-500" : "border-border-default hover:border-border-strong",
      )}
    >
      <span className="block text-[13px] font-medium text-text-primary">{title}</span>
      <span className="block text-[12px] text-text-secondary">{description}</span>
    </button>
  );
}
