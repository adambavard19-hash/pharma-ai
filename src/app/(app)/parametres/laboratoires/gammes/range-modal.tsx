"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackageSearch, Search } from "lucide-react";
import type { BrandProduct, BrandSuggestion, PreferredRangeRow } from "@/server/services/preferred-ranges";
import { listBrandProductsAction, savePreferredRangeAction } from "@/server/actions/preferred-ranges";
import { UNIVERSES } from "@/config/universes";
import { PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { brandKey } from "@/core/catalog/brand";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const PERCENT = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

export function formatPercent(value: number): string {
  return PERCENT.format(value);
}

/** Ce qu'un univers départage, dit simplement. */
function universeHint(key: string): string {
  const universe = UNIVERSES.find((entry) => entry.key === key);
  if (!universe) return "";
  if (universe.categories.length === 0) return "Départage entre les produits de la gamme elle-même, quel que soit le conseil.";
  return `Départage les conseils : ${universe.categories.map((category) => PRODUCT_CATEGORY_LABELS[category]).join(", ")}.`;
}

/**
 * Ajout ou modification d'une gamme privilégiée.
 *
 * La marque se choisit dans le stock (suggestions avec leur nombre de
 * références) ou se saisit telle qu'elle figure sur les étiquettes. Les
 * produits concernés sont facultatifs : par défaut, toute la marque.
 */
export function RangeModal({
  range,
  initialUniverse,
  brands,
  ranges,
  onClose,
}: {
  range: PreferredRangeRow | null;
  initialUniverse: string;
  brands: BrandSuggestion[];
  ranges: PreferredRangeRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [saving, startSaving] = useTransition();
  const [loading, startLoading] = useTransition();

  const nextPriority = (universe: string) => ranges.filter((entry) => entry.universe === universe).length + 1;

  const [universe, setUniverse] = useState(range?.universe && UNIVERSES.some((u) => u.key === range.universe) ? range.universe : initialUniverse);
  const [laboratory, setLaboratory] = useState(range?.laboratory ?? "");
  const [rangeName, setRangeName] = useState(range?.rangeName ?? "");
  const [priority, setPriority] = useState(String(range?.priority ?? nextPriority(initialUniverse)));
  const [priorityTouched, setPriorityTouched] = useState(Boolean(range));
  const [discount, setDiscount] = useState(range?.discountPercent != null ? formatPercent(range.discountPercent) : "");
  const [notes, setNotes] = useState(range?.notes ?? "");
  const [isActive, setIsActive] = useState(range?.isActive ?? true);
  const [mode, setMode] = useState<"brand" | "products">(range && (range.products.length > 0 || range.missingProducts > 0) ? "products" : "brand");
  const [selected, setSelected] = useState<Map<string, string>>(() => new Map((range?.products ?? []).map((product) => [product.id, product.name])));
  const [products, setProducts] = useState<BrandProduct[] | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  const key = brandKey(laboratory);
  const exact = brands.find((brand) => brand.key === key) ?? null;
  const suggestions = useMemo(() => {
    if (exact) return [];
    const list = key ? brands.filter((brand) => brand.key.includes(key)) : brands;
    return list.slice(0, 8);
  }, [brands, key, exact]);

  const visibleProducts = useMemo(() => {
    if (!products) return [];
    const needle = brandKey(productQuery);
    return needle ? products.filter((product) => brandKey(product.name).includes(needle)) : products;
  }, [products, productQuery]);

  const changeLaboratory = (value: string) => {
    if (brandKey(value) !== key) {
      // Une autre marque : les produits choisis pour l'ancienne ne valent plus.
      setProducts(null);
      setSelected(new Map());
      setProductQuery("");
    }
    setLaboratory(value);
  };

  const changeUniverse = (value: string) => {
    setUniverse(value);
    if (!range && !priorityTouched) setPriority(String(nextPriority(value)));
  };

  const loadProducts = (brand = laboratory) => {
    if (!brand.trim()) {
      setFieldErrors((current) => ({ ...current, laboratory: "Indiquez d'abord le laboratoire ou la marque." }));
      return;
    }
    startLoading(async () => {
      const result = await listBrandProductsAction(brand);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setProducts(result.data);
    });
  };

  const chooseMode = (next: "brand" | "products") => {
    setMode(next);
    if (next === "products" && products === null && laboratory.trim()) loadProducts();
  };

  const toggleProduct = (product: { id: string; name: string }) => {
    setSelected((current) => {
      const copy = new Map(current);
      if (copy.has(product.id)) copy.delete(product.id);
      else copy.set(product.id, product.name);
      return copy;
    });
  };

  const save = () =>
    startSaving(async () => {
      setError(null);
      setFieldErrors({});
      if (mode === "products" && selected.size === 0) {
        setFieldErrors({ productIds: "Cochez au moins un produit, ou gardez « toute la marque »." });
        return;
      }
      const result = await savePreferredRangeAction({
        id: range?.id ?? null,
        universe,
        laboratory,
        rangeName: rangeName.trim() || null,
        isActive,
        priority,
        discountPercent: discount,
        notes: notes.trim() || null,
        productIds: mode === "products" ? [...selected.keys()] : [],
      });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "Gamme enregistrée." });
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={range ? `Modifier ${range.laboratory}${range.rangeName ? ` · ${range.rangeName}` : ""}` : "Ajouter une gamme privilégiée"}
      description="Elle ne servira qu'à départager des produits également pertinents et sûrs pour le patient."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button loading={saving} disabled={!laboratory.trim()} onClick={save}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <Field label="Univers" htmlFor="range-universe" required error={fieldErrors.universe} hint={universeHint(universe)}>
            <Select id="range-universe" value={universe} onChange={(event) => changeUniverse(event.target.value)}>
              {UNIVERSES.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priorité" htmlFor="range-priority" required error={fieldErrors.priority} hint="1 = prioritaire">
            <Input
              id="range-priority"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              value={priority}
              aria-invalid={Boolean(fieldErrors.priority)}
              onChange={(event) => {
                setPriority(event.target.value);
                setPriorityTouched(true);
              }}
            />
          </Field>
        </div>

        <Field
          label="Laboratoire ou marque"
          htmlFor="range-laboratory"
          required
          error={fieldErrors.laboratory}
          hint={
            exact
              ? `${exact.references} référence${exact.references > 1 ? "s" : ""} de cette marque dans votre stock, dont ${exact.inStock} en rayon.`
              : laboratory.trim()
                ? "Pas dans la liste des marques de votre stock. La gamme s'appliquera aux produits qui portent ce nom ; « Certains produits » montre ceux déjà reconnus."
                : brands.length > 0
                  ? "Choisissez parmi les marques de votre stock, ou saisissez-la telle qu'elle figure sur vos étiquettes."
                  : "Saisissez la marque telle qu'elle figure sur vos étiquettes."
          }
        >
          <Input
            id="range-laboratory"
            value={laboratory}
            autoComplete="off"
            placeholder="ex. ARKOPHARMA"
            aria-invalid={Boolean(fieldErrors.laboratory)}
            onChange={(event) => changeLaboratory(event.target.value)}
          />
        </Field>
        {suggestions.length > 0 && (
          <div className="-mt-2 flex flex-wrap gap-1.5" aria-label="Marques de votre stock">
            {suggestions.map((brand) => (
              <button
                key={brand.label}
                type="button"
                onClick={() => changeLaboratory(brand.label)}
                className="rounded-full border border-border-default bg-surface-card px-2.5 py-1 text-[12.5px] text-text-primary transition-colors hover:border-brand-500 hover:bg-brand-50"
              >
                {brand.label} <span className="tabular text-text-tertiary">· {brand.references} réf.</span>
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Gamme" htmlFor="range-name" error={fieldErrors.rangeName} hint="Facultatif : laissez vide pour toute la marque.">
            <Input id="range-name" value={rangeName} placeholder="ex. Arkogélules" onChange={(event) => setRangeName(event.target.value)} />
          </Field>
          <Field label="Remise ou marge négociée (%)" htmlFor="range-discount" error={fieldErrors.discountPercent} hint="Pour mémoire : n'entre jamais dans le choix d'un conseil.">
            <Input
              id="range-discount"
              inputMode="decimal"
              value={discount}
              placeholder="ex. 12"
              aria-invalid={Boolean(fieldErrors.discountPercent)}
              onChange={(event) => setDiscount(event.target.value)}
            />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-[13px] font-medium text-text-primary">Produits concernés</legend>
          <div role="radiogroup" aria-label="Produits concernés" className="inline-flex flex-wrap rounded-lg border border-border-default p-0.5">
            {(
              [
                ["brand", "Toute la marque"],
                ["products", "Certains produits"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => chooseMode(value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                  mode === value ? "bg-brand-600 text-white" : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "products" && (
            <div className="space-y-2 rounded-lg border border-border-subtle p-3">
              {products === null ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] text-text-secondary">
                    {selected.size > 0
                      ? `${selected.size} produit${selected.size > 1 ? "s" : ""} choisi${selected.size > 1 ? "s" : ""}.`
                      : laboratory.trim()
                        ? `Les produits ${laboratory.trim().toUpperCase()} de votre stock.`
                        : "Indiquez d'abord le laboratoire ou la marque."}
                  </p>
                  <Button size="sm" variant="outline" leadingIcon={<PackageSearch className="size-3.5" />} loading={loading} disabled={!laboratory.trim()} onClick={() => loadProducts()}>
                    {selected.size > 0 ? "Modifier la sélection" : "Afficher les produits"}
                  </Button>
                </div>
              ) : products.length === 0 ? (
                <p className="text-[13px] text-text-secondary">
                  Aucun produit de cette marque dans votre stock. Gardez « toute la marque » : la gamme s&apos;appliquera dès que des produits y entreront.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-[180px] flex-1">
                      <Input
                        leadingIcon={<Search className="size-4" aria-hidden="true" />}
                        value={productQuery}
                        onChange={(event) => setProductQuery(event.target.value)}
                        placeholder={`Rechercher parmi ${products.length} produit${products.length > 1 ? "s" : ""}…`}
                        aria-label="Rechercher un produit"
                      />
                    </div>
                    <p className="tabular text-[12.5px] text-text-secondary">
                      {selected.size} choisi{selected.size > 1 ? "s" : ""}
                    </p>
                    {selected.size > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => setSelected(new Map())}>
                        Tout décocher
                      </Button>
                    )}
                  </div>
                  <ul className="max-h-64 divide-y divide-border-subtle overflow-y-auto rounded-md border border-border-subtle">
                    {visibleProducts.length === 0 && <li className="px-3 py-3 text-[13px] text-text-tertiary">Aucun produit ne correspond.</li>}
                    {visibleProducts.map((product) => (
                      <li key={product.id} className="px-3 py-2">
                        <Checkbox
                          id={`range-product-${product.id}`}
                          checked={selected.has(product.id)}
                          onChange={() => toggleProduct(product)}
                          label={product.name}
                          description={product.quantity > 0 ? `En stock : ${product.quantity}` : "Pas en stock"}
                        />
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {range && range.missingProducts > 0 && (
                <p className="text-[12.5px] text-warning-700">
                  {range.missingProducts} produit{range.missingProducts > 1 ? "s" : ""} choisi{range.missingProducts > 1 ? "s" : ""} auparavant {range.missingProducts > 1 ? "ont" : "a"} quitté le stock et {range.missingProducts > 1 ? "seront retirés" : "sera retiré"} à l&apos;enregistrement.
                </p>
              )}
            </div>
          )}
          {fieldErrors.productIds && (
            <p className="text-[12.5px] text-danger-600" role="alert">
              {fieldErrors.productIds}
            </p>
          )}
        </fieldset>

        <Field label="Notes internes" htmlFor="range-notes" error={fieldErrors.notes} hint="Visibles seulement ici : conditions, interlocuteur, échéance…">
          <Textarea id="range-notes" rows={2} value={notes} maxLength={500} onChange={(event) => setNotes(event.target.value)} />
        </Field>

        <Checkbox
          id="range-active"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
          label="Active"
          description="Décochée, la gamme reste enregistrée mais ne départage plus rien."
        />
      </div>
    </Modal>
  );
}
