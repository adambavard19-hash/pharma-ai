"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Search, ShieldCheck, X } from "lucide-react";
import { Button, Spinner } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { UNIVERSES } from "@/config/universes";
import { brandDisplay, type TrainingKindCode } from "@/core/training/content";
import type { ActionResult } from "@/server/actions/types";

/**
 * Le formulaire d'un contenu de formation, partagé par la console PharmaBoost
 * (contenus pour toutes les officines, ciblés par codes produit) et par le
 * titulaire (contenus de son officine, ciblés par ses propres produits).
 * La validation de fond est celle du serveur (src/core/training/content.ts) ;
 * le formulaire ne fait qu'afficher ses erreurs champ par champ.
 */

export type TrainingFormValues = {
  id: string | null;
  title: string;
  summary: string;
  kind: TrainingKindCode;
  url: string;
  body: string;
  laboratory: string;
  brand: string;
  rangeName: string;
  universe: string;
  durationMinutes: string;
  sourceLabel: string;
  /** Console : codes CIP/EAN, un par ligne. */
  productCodes: string;
  /** Officine : ses produits. */
  products: { id: string; name: string }[];
};

/** Ce qu'il faut pour pré-remplir le formulaire depuis un contenu enregistré. */
export type StoredTraining = {
  id: string;
  title: string;
  summary: string | null;
  kind: TrainingKindCode;
  url: string | null;
  body: string | null;
  laboratory: string | null;
  brandKey: string | null;
  rangeName: string | null;
  universe: string | null;
  durationMinutes: number | null;
  sourceLabel: string | null;
  productCodes: string[];
  products?: { id: string; name: string }[];
};

export function formValuesOf(training: StoredTraining | null): TrainingFormValues {
  return {
    id: training?.id ?? null,
    title: training?.title ?? "",
    summary: training?.summary ?? "",
    kind: training?.kind ?? "EXTERNAL_LINK",
    url: training?.url ?? "",
    body: training?.body ?? "",
    laboratory: training?.laboratory ?? "",
    brand: brandDisplay(training?.brandKey) ?? "",
    rangeName: training?.rangeName ?? "",
    universe: training?.universe ?? "",
    durationMinutes: training?.durationMinutes ? String(training.durationMinutes) : "",
    sourceLabel: training?.sourceLabel ?? "",
    productCodes: training?.productCodes.join("\n") ?? "",
    products: training?.products ?? [],
  };
}

const KIND_OPTIONS: { value: TrainingKindCode; label: string; disabled?: boolean }[] = [
  { value: "EXTERNAL_LINK", label: "Lien officiel (page du laboratoire, d'une autorité…)" },
  { value: "VIDEO", label: "Vidéo (YouTube, Vimeo, Dailymotion ou autre lien)" },
  { value: "DOCUMENT", label: "Document PDF (par son lien)" },
  { value: "SHEET", label: "Fiche courte (texte écrit ici)" },
  { value: "QUIZ", label: "Quiz — bientôt", disabled: true },
];

const URL_LABELS: Record<TrainingKindCode, string> = {
  EXTERNAL_LINK: "Lien officiel",
  VIDEO: "Lien de la vidéo",
  DOCUMENT: "Lien du document",
  SHEET: "Lien de la source (facultatif)",
  QUIZ: "Lien",
};

type ProductResult = { id: string; name: string; brand: string | null };

export function TrainingFormModal({
  variant,
  initial,
  onClose,
  onSubmit,
  searchProducts,
}: {
  variant: "pharmacy" | "platform";
  initial: TrainingFormValues;
  onClose: () => void;
  onSubmit: (values: TrainingFormValues) => Promise<ActionResult<{ id: string }>>;
  searchProducts?: (query: string) => Promise<ActionResult<ProductResult[]>>;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [values, setValues] = useState<TrainingFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const set = <K extends keyof TrainingFormValues>(key: K, value: TrainingFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const id = (name: string) => `tr-${variant}-${name}`;

  const submit = () =>
    start(async () => {
      setError(null);
      const result = await onSubmit(values);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "Contenu enregistré." });
      onClose();
      router.refresh();
    });

  const isSheet = values.kind === "SHEET";

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={initial.id ? `Modifier « ${initial.title} »` : variant === "platform" ? "Nouvelle formation PharmaBoost" : "Nouveau contenu pour l'équipe"}
      description={variant === "platform" ? "Visible par toutes les officines dès l'enregistrement." : "Visible par toute votre équipe dès l'enregistrement."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button loading={pending} leadingIcon={<Check className="size-4" />} disabled={!values.title.trim()} onClick={submit}>
            {initial.id ? "Enregistrer" : "Publier"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert tone="info" icon={<ShieldCheck className="size-[18px]" aria-hidden="true" />}>
          N&apos;ajoutez que des liens officiels ou des contenus autorisés par leur auteur. PharmaBoost n&apos;héberge rien : le contenu reste chez sa source.
        </Alert>
        {error && <Alert tone="danger">{error}</Alert>}

        <Field label="Titre" htmlFor={id("title")} required error={fieldErrors.title}>
          <Input id={id("title")} value={values.title} onChange={(e) => set("title", e.target.value)} placeholder="ex. Effaclar : construire la routine peau grasse" />
        </Field>

        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <Field label="Format" htmlFor={id("kind")} required error={fieldErrors.kind}>
            <Select id={id("kind")} value={values.kind} onChange={(e) => set("kind", e.target.value as TrainingKindCode)}>
              {KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Durée (min)" htmlFor={id("duration")} error={fieldErrors.durationMinutes}>
            <Input id={id("duration")} inputMode="numeric" value={values.durationMinutes} onChange={(e) => set("durationMinutes", e.target.value.replace(/\D/g, ""))} placeholder="ex. 8" />
          </Field>
        </div>

        <Field label={URL_LABELS[values.kind]} htmlFor={id("url")} required={!isSheet} error={fieldErrors.url} hint={values.kind === "VIDEO" ? "Une vidéo YouTube, Vimeo ou Dailymotion se lit dans PharmaBoost ; tout autre lien s'ouvre dans un nouvel onglet." : undefined}>
          <Input id={id("url")} type="url" inputMode="url" value={values.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" />
        </Field>

        {isSheet && (
          <Field label="Contenu de la fiche" htmlFor={id("body")} required error={fieldErrors.body} hint="Quelques paragraphes : ce qu'il faut savoir au comptoir. Les retours à la ligne sont conservés.">
            <Textarea id={id("body")} rows={8} value={values.body} onChange={(e) => set("body", e.target.value)} />
          </Field>
        )}

        <Field label="Résumé" htmlFor={id("summary")} error={fieldErrors.summary} hint="Une ou deux phrases, affichées sur la carte du catalogue.">
          <Textarea id={id("summary")} rows={2} value={values.summary} onChange={(e) => set("summary", e.target.value)} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Laboratoire" htmlFor={id("lab")} error={fieldErrors.laboratory}>
            <Input id={id("lab")} value={values.laboratory} onChange={(e) => set("laboratory", e.target.value)} placeholder="ex. Pierre Fabre" />
          </Field>
          <Field label="Marque" htmlFor={id("brand")} error={fieldErrors.brand} hint="Telle que sur les étiquettes.">
            <Input id={id("brand")} value={values.brand} onChange={(e) => set("brand", e.target.value)} placeholder="ex. AVENE" />
          </Field>
          <Field label="Gamme" htmlFor={id("range")} error={fieldErrors.rangeName}>
            <Input id={id("range")} value={values.rangeName} onChange={(e) => set("rangeName", e.target.value)} placeholder="ex. Cicalfate" />
          </Field>
        </div>

        <Field label="Univers" htmlFor={id("universe")} error={fieldErrors.universe}>
          <Select id={id("universe")} value={values.universe} onChange={(e) => set("universe", e.target.value)}>
            <option value="">Aucun univers</option>
            {UNIVERSES.map((universe) => (
              <option key={universe.key} value={universe.key}>{universe.label}</option>
            ))}
          </Select>
        </Field>

        {variant === "platform" ? (
          <Field label="Codes produit (CIP ou EAN)" htmlFor={id("codes")} error={fieldErrors.productCodes} hint="Un par ligne. Relie la formation aux produits des officines qui portent ces codes.">
            <Textarea id={id("codes")} rows={3} value={values.productCodes} onChange={(e) => set("productCodes", e.target.value)} className="font-mono text-[13px]" placeholder={"3400930000014\n3337875545778"} />
          </Field>
        ) : searchProducts ? (
          <ProductPicker products={values.products} onChange={(products) => set("products", products)} search={searchProducts} error={fieldErrors.productIds} inputId={id("products")} />
        ) : null}

        <Field label="Provenance affichée" htmlFor={id("source")} error={fieldErrors.sourceLabel} hint="ex. « Lien officiel du laboratoire », « Contenu fourni par Pierre Fabre ».">
          <Input id={id("source")} value={values.sourceLabel} onChange={(e) => set("sourceLabel", e.target.value)} placeholder="Lien officiel du laboratoire" />
        </Field>
      </div>
    </Modal>
  );
}

function ProductPicker({
  products,
  onChange,
  search,
  error,
  inputId,
}: {
  products: { id: string; name: string }[];
  onChange: (products: { id: string; name: string }[]) => void;
  search: (query: string) => Promise<ActionResult<ProductResult[]>>;
  error?: string;
  inputId: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductResult[]>([]);
  const [searched, setSearched] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onQuery = (value: string) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(() => {
      start(async () => {
        const result = await search(value.trim());
        setResults(result.ok ? result.data : []);
        setSearched(value.trim());
      });
    }, 250);
  };

  const chosen = new Set(products.map((product) => product.id));

  return (
    <Field label="Produits de votre officine" htmlFor={inputId} error={error} hint="Facultatif. Le lien « Se former sur ce produit » apparaîtra sur ces produits ; sans produit, la marque ou l'univers suffisent.">
      <div className="space-y-2">
        {products.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {products.map((product) => (
              <li key={product.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand-50 py-0.5 pr-1 pl-2.5 text-[12.5px] text-brand-800 ring-1 ring-brand-200 ring-inset">
                <span className="truncate">{product.name}</span>
                <button type="button" className="rounded-full p-0.5 hover:bg-brand-100" aria-label={`Retirer ${product.name}`} onClick={() => onChange(products.filter((p) => p.id !== product.id))}>
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Input id={inputId} value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Rechercher un produit par nom, marque ou code…" leadingIcon={pending ? <Spinner className="size-4" /> : <Search className="size-4" />} />
        {results.length > 0 && (
          <ul className="max-h-48 divide-y divide-border-subtle overflow-y-auto rounded-md border border-border-subtle">
            {results.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  disabled={chosen.has(product.id)}
                  onClick={() => onChange([...products, { id: product.id, name: product.name }])}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-text-primary hover:bg-surface-sunken disabled:cursor-default disabled:text-text-tertiary disabled:hover:bg-transparent"
                >
                  {chosen.has(product.id) ? <Check className="size-3.5 shrink-0" /> : <Plus className="size-3.5 shrink-0 text-text-tertiary" />}
                  <span className="min-w-0 flex-1 truncate">{product.name}</span>
                  {product.brand && <span className="shrink-0 text-[11.5px] text-text-tertiary">{product.brand}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {searched !== null && searched === query.trim() && !pending && results.length === 0 && <p className="text-[12.5px] text-text-tertiary">Aucun produit ne correspond dans votre stock.</p>}
      </div>
    </Field>
  );
}
