"use client";

import { Field, Input, Textarea } from "@/components/ui/field";
import { brandKey } from "@/core/catalog/brand";
import { slugify } from "@/core/partners/status";
import { UNIVERSES } from "@/config/universes";
import { cn } from "@/lib/utils";

/**
 * Les champs d'une fiche marque, communs à la création et à l'édition.
 * Le slug et la marque normalisée se déduisent du nom tant qu'on ne les a pas
 * modifiés à la main.
 */

export type BrandFormValues = {
  name: string;
  slug: string;
  slugTouched: boolean;
  brandKey: string;
  brandKeyTouched: boolean;
  logoUrl: string;
  description: string;
  universes: string[];
};

export const EMPTY_BRAND: BrandFormValues = { name: "", slug: "", slugTouched: false, brandKey: "", brandKeyTouched: false, logoUrl: "", description: "", universes: [] };

export function brandPayloadOf(values: BrandFormValues) {
  return {
    name: values.name,
    slug: values.slug,
    brandKey: values.brandKey,
    logoUrl: values.logoUrl,
    description: values.description,
    universes: values.universes,
  };
}

export function BrandFields({ values, onChange, errors }: { values: BrandFormValues; onChange: (values: BrandFormValues) => void; errors: Record<string, string> }) {
  const setName = (name: string) =>
    onChange({
      ...values,
      name,
      slug: values.slugTouched ? values.slug : slugify(name),
      brandKey: values.brandKeyTouched ? values.brandKey : brandKey(name),
    });
  const toggleUniverse = (key: string) =>
    onChange({ ...values, universes: values.universes.includes(key) ? values.universes.filter((value) => value !== key) : [...values.universes, key] });

  return (
    <div className="space-y-4">
      <Field label="Nom de la marque" htmlFor="brand-name" required error={errors.name}>
        <Input id="brand-name" value={values.name} onChange={(event) => setName(event.target.value)} maxLength={120} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Slug (adresse de la page marque)" htmlFor="brand-slug" hint="Unique. Lettres, chiffres et tirets." error={errors.slug}>
          <Input id="brand-slug" value={values.slug} onChange={(event) => onChange({ ...values, slug: event.target.value, slugTouched: true })} maxLength={80} />
        </Field>
        <Field label="Marque normalisée" htmlFor="brand-key" hint="Relie la marque au stock des officines et aux formations." error={errors.brandKey}>
          <Input id="brand-key" value={values.brandKey} onChange={(event) => onChange({ ...values, brandKey: event.target.value, brandKeyTouched: true })} maxLength={120} />
        </Field>
      </div>
      <Field label="Logo" htmlFor="brand-logo" hint="Adresse https:// d'une image fournie par la marque. Facultatif." error={errors.logoUrl}>
        <Input id="brand-logo" type="url" inputMode="url" value={values.logoUrl} onChange={(event) => onChange({ ...values, logoUrl: event.target.value })} placeholder="https://" />
      </Field>
      <Field label="Présentation" htmlFor="brand-description" hint="Factuelle, telle que fournie par la marque." error={errors.description}>
        <Textarea id="brand-description" value={values.description} onChange={(event) => onChange({ ...values, description: event.target.value })} rows={4} maxLength={4000} />
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-text-primary">Univers</legend>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {UNIVERSES.map((universe) => {
            const checked = values.universes.includes(universe.key);
            return (
              <label
                key={universe.key}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-[13px] transition-colors",
                  checked ? "border-brand-300 bg-brand-50 text-brand-800 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-200" : "border-border-subtle text-text-secondary hover:bg-surface-sunken",
                )}
              >
                <input type="checkbox" className="size-4 rounded border-border-strong text-brand-600" checked={checked} onChange={() => toggleUniverse(universe.key)} />
                {universe.label}
              </label>
            );
          })}
        </div>
        {errors.universes && <p className="text-[12.5px] text-danger-600">{errors.universes}</p>}
      </fieldset>
    </div>
  );
}
