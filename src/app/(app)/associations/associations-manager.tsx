"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowRight, Check, Loader2, Package, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { createAssociationsAction, deleteAssociationAction, updateAssociationAction } from "@/server/actions/associations";
import { MAX_ADVICE_PER_SAVE, MAX_SENTENCE_LENGTH } from "@/core/associations/rules";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Switch, Textarea } from "@/components/ui/field";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import type { ProductSearchResult } from "@/app/api/produits/recherche/route";
import type { TriggerOption, TriggerSearch } from "@/app/api/associations/declencheurs/route";

type ProductBrief = { id: string; name: string; brand: string | null; quantity: number; deleted: boolean };
/** Ce qui déclenche : un produit du stock, ou un médicament du catalogue national (sans stock connu). */
type TriggerBrief = { kind: "PRODUCT" | "DRUG"; id: string; name: string; brand: string | null; quantity: number | null; deleted: boolean };
type AssociationRow = { id: string; trigger: TriggerBrief; advice: ProductBrief; sentence: string | null; isActive: boolean; createdBy: string | null; createdAt: string };

/**
 * Les associations de produits : à gauche le produit ou le médicament qui déclenche, à droite ceux qu'on propose.
 *
 * Rien ici ne contourne un garde-fou : à l'analyse d'une vente, l'association passe par le stock (jamais un produit en
 * rupture), la sécurité du patient et la vente déjà en cours. L'écran le dit, pour que personne ne s'étonne d'une carte
 * qui ne s'affiche pas.
 */
export function AssociationsManager({ associations }: { associations: AssociationRow[] }) {
  // Les associations groupées par produit déclencheur, dans l'ordre d'arrivée.
  const groups: { trigger: TriggerBrief; items: AssociationRow[] }[] = [];
  for (const association of associations) {
    const group = groups.find((candidate) => candidate.trigger.kind === association.trigger.kind && candidate.trigger.id === association.trigger.id);
    if (group) group.items.push(association);
    else groups.push({ trigger: association.trigger, items: [association] });
  }

  return (
    <div className="space-y-6">
      <Alert tone="info" title="Deux façons de conseiller, qui se complètent">
        <span className="block">
          <strong>Un médicament déclenche un produit conseil</strong> — un antibiotique appelle un spray pour laver le nez : c&apos;est le moteur de PharmaBoost, rien à régler ici.
        </span>
        <span className="mt-1 block">
          <strong>Un produit ou un médicament conseil en appelle un autre</strong> — Coryzalia, ou le spray pour le nez, appelle le produit de votre choix, même sur une vente spontanée : c&apos;est cette page, et c&apos;est vous qui décidez.
        </span>
      </Alert>

      <NewAssociation />

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Package className="size-5" />}
            title="Aucune association pour l'instant"
            description="Choisissez ci-dessus un produit, puis celui qu'il doit appeler. L'association s'appliquera dès la prochaine vente où le premier est scanné."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <Card key={`${group.trigger.kind}:${group.trigger.id}`}>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>Quand « {group.trigger.kind === "DRUG" ? group.trigger.name.split(",")[0].trim() : group.trigger.name} » est dans la vente</span>
                    {group.trigger.kind === "DRUG" && <Badge tone="info">Médicament</Badge>}
                    {group.trigger.deleted && <Badge tone="danger">Produit supprimé</Badge>}
                  </span>
                }
                description={group.trigger.kind === "DRUG" ? "Toutes les formes de ce médicament" : (group.trigger.brand ?? undefined)}
              />
              <CardContent className="pt-0">
                <ul className="divide-y divide-border-subtle">
                  {group.items.map((association) => (
                    <AssociationItem key={association.id} association={association} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function NewAssociation() {
  const [trigger, setTrigger] = useState<TriggerOption | null>(null);
  const [advice, setAdvice] = useState<ProductSearchResult[]>([]);
  const [sentence, setSentence] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const submit = () => {
    setError(null);
    if (!trigger || advice.length === 0) {
      setError("Choisissez le produit ou le médicament déclencheur, et au moins un produit à conseiller.");
      return;
    }
    startTransition(async () => {
      const result = await createAssociationsAction({
        ...(trigger.kind === "PRODUCT" ? { triggerProductId: trigger.productId } : { triggerSpecialtyId: trigger.specialtyId }),
        adviceProductIds: advice.map((product) => product.id),
        sentence: sentence.trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Associations enregistrées" });
      // Un produit déjà associé n'empêche pas les autres : on dit lequel, et pourquoi.
      const skipped = result.data.skipped.length;
      if (skipped > 0) push({ tone: "warning", title: skipped === 1 ? "Un produit écarté" : `${skipped} produits écartés`, description: result.data.skipped.map((skip) => skip.reason).join(" ") });
      // On garde le déclencheur : on enchaîne souvent d'autres produits conseillés pour un même produit.
      setAdvice([]);
      setSentence("");
    });
  };

  const count = advice.length;
  return (
    <Card>
      <CardHeader title="Nouvelle association" description="Le produit ou le médicament de gauche appelle les produits de droite — un ou plusieurs." />
      <CardContent className="space-y-4">
        <div className="grid items-start gap-4 md:grid-cols-[1fr_auto_1fr]">
          <TriggerField value={trigger} onChange={setTrigger} />
          <ArrowRight className="mt-9 hidden size-5 shrink-0 text-text-tertiary md:block" aria-hidden />
          <AdviceField
            values={advice}
            onAdd={(product) => setAdvice((current) => (current.some((item) => item.id === product.id) || current.length >= MAX_ADVICE_PER_SAVE ? current : [...current, product]))}
            onRemove={(id) => setAdvice((current) => current.filter((item) => item.id !== id))}
            excludeId={trigger?.kind === "PRODUCT" ? trigger.productId : undefined}
          />
        </div>

        <Field
          label="Ce que vous dites au patient (facultatif)"
          htmlFor="association-sentence"
          hint={`Vos mots, tels quels, sur la carte du comptoir${count > 1 ? " — la même phrase pour chaque produit choisi, modifiable ensuite produit par produit" : ""}. Sans phrase, PharmaBoost n'affiche qu'une formule neutre. ${sentence.length}/${MAX_SENTENCE_LENGTH}`}
        >
          <Textarea id="association-sentence" value={sentence} maxLength={MAX_SENTENCE_LENGTH} onChange={(event) => setSentence(event.target.value)} placeholder="Par exemple : pour accompagner le lavage du nez quand la toux s'installe." className="min-h-16" />
        </Field>

        {error && (
          <p role="alert" className="text-[13px] text-danger-600">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={submit} loading={pending} disabled={!trigger || count === 0} leadingIcon={<Plus className="size-[18px]" />}>
            {count > 1 ? `Enregistrer les ${count} associations` : "Enregistrer l'association"}
          </Button>
          <p className="text-[12.5px] text-text-tertiary">Au comptoir, trois associations au plus par vente, en plus des conseils de PharmaBoost. Un produit conseillé n&apos;est jamais proposé en rupture de stock, ni s&apos;il est écarté par la sécurité pour le patient.</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Le délai avant d'interroger le serveur : on cherche quand la frappe se pose, pas à chaque lettre. */
const SEARCH_DELAY_MS = 250;

/** Ce qu'on lit d'un médicament : son nom sans la forme, puis la forme (ou le conditionnement détenu). */
const drugTitle = (name: string) => name.split(",")[0].trim();
const drugForm = (name: string) => (name.includes(",") ? name.slice(name.indexOf(",") + 1).trim() : "");

function stockBadge(quantity: number | null, status?: ProductSearchResult["status"]) {
  if (quantity === null) return null;
  if (quantity <= 0) return <Badge tone="danger">Rupture</Badge>;
  return <Badge tone={status === "LOW_STOCK" ? "warning" : "success"}>{`${quantity} en stock`}</Badge>;
}

/**
 * Le déclencheur, en UN champ : les médicaments du stock de l'officine (avec la quantité), ses produits, puis le reste du
 * catalogue national. La recherche ne tient compte ni des accents, ni de la casse, ni de l'ordre ou du nombre de mots :
 * « cétirizine 10 mg boîte de 15 » trouve la boîte en stock.
 */
function TriggerField({ value, onChange }: { value: TriggerOption | null; onChange: (option: TriggerOption | null) => void }) {
  const label = "Quand ce produit ou ce médicament est dans la vente";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TriggerSearch>({ stock: [], catalogue: [] });
  const [loading, setLoading] = useState(false);
  const needle = query.trim();

  useEffect(() => {
    if (value || needle.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/associations/declencheurs?q=${encodeURIComponent(needle)}`, { signal: controller.signal });
        if (response.ok) setResults((await response.json()) as TriggerSearch);
      } catch {
        // Requête annulée : on garde l'affichage précédent.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [needle, value]);

  if (value) {
    const detail =
      value.kind === "DRUG"
        ? [drugForm(value.name), value.quantity !== null ? `${value.quantity} en stock` : "catalogue national"].filter(Boolean).join(" · ")
        : [value.brand, value.quantity > 0 ? `${value.quantity} en stock` : "en rupture"].filter(Boolean).join(" · ");
    return (
      <Field label={label} hint={value.kind === "DRUG" ? "L'association vaut pour toutes les formes de ce médicament (comprimé, solution buvable…)." : undefined}>
        <div className="flex items-center gap-3 rounded-lg border border-brand-300 bg-brand-50/60 p-3 dark:border-brand-700 dark:bg-brand-950/30">
          <Check className="size-4 shrink-0 text-brand-700 dark:text-brand-300" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-[14px] font-medium text-text-primary">{value.kind === "DRUG" ? drugTitle(value.name) : value.name}</span>
              {value.kind === "DRUG" && <Badge tone="info">Médicament</Badge>}
            </span>
            <span className="block truncate text-[12px] text-text-tertiary">{detail}</span>
          </span>
          <button type="button" onClick={() => { onChange(null); setQuery(""); setResults({ stock: [], catalogue: [] }); }} className="shrink-0 rounded-md p-1.5 text-text-tertiary hover:bg-surface-sunken hover:text-text-primary" aria-label={`Changer : ${label}`}>
            <X className="size-4" />
          </button>
        </div>
      </Field>
    );
  }

  const empty = results.stock.length === 0 && results.catalogue.length === 0;
  return (
    <Field label={label}>
      <div className="space-y-2">
        <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, substance, dosage, code-barres… (cétirizine 10 mg)" leadingIcon={loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} aria-label={label} />
        {needle.length >= 2 && (
          <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-border-subtle bg-surface-card p-1.5">
            {empty ? (
              <p className="px-2 py-3 text-center text-[12.5px] text-text-tertiary">{loading ? "Recherche…" : "Rien trouvé, ni dans votre stock ni au catalogue national."}</p>
            ) : (
              <>
                <TriggerGroup title="Dans mon stock" options={results.stock} onPick={onChange} />
                <TriggerGroup title="Autres médicaments" options={results.catalogue} onPick={onChange} />
              </>
            )}
          </div>
        )}
      </div>
    </Field>
  );
}

function TriggerGroup({ title, options, onPick }: { title: string; options: TriggerOption[]; onPick: (option: TriggerOption) => void }) {
  if (options.length === 0) return null;
  return (
    <section aria-label={title}>
      <h3 className="px-2.5 pt-1.5 pb-1 text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">{title}</h3>
      <ul className="space-y-0.5">
        {options.map((option) => (
          <li key={option.kind === "DRUG" ? `d:${option.specialtyId}` : `p:${option.productId}`}>
            <button type="button" onClick={() => onPick(option)} className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-brand-50/70 dark:hover:bg-brand-950/40">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-text-primary">{option.kind === "DRUG" ? drugTitle(option.name) : option.name}</span>
                <span className="block truncate text-[12px] text-text-tertiary">
                  {option.kind === "DRUG" ? [drugForm(option.name), option.label ?? option.substances.join(", ")].filter(Boolean).join(" — ") || "—" : (option.brand ?? "Produit de l'officine")}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {option.kind === "DRUG" && <Badge tone="info">Médicament</Badge>}
                {option.kind === "DRUG" && option.quantity === null && !option.marketed && <Badge tone="warning">Non commercialisé</Badge>}
                {option.kind === "DRUG" ? stockBadge(option.quantity) : stockBadge(option.quantity, option.status)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Les produits conseillés : on en choisit un ou plusieurs (des puces qu'on retire d'un clic), « Enregistrer » crée toutes
 * les associations d'un coup. La recherche est celle du catalogue de l'officine ; un produit en rupture reste choisissable.
 */
function AdviceField({ values, onAdd, onRemove, excludeId }: { values: ProductSearchResult[]; onAdd: (product: ProductSearchResult) => void; onRemove: (id: string) => void; excludeId?: string }) {
  const label = values.length > 1 ? "PharmaBoost propose ces produits" : "PharmaBoost propose ce produit";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);
  const full = values.length >= MAX_ADVICE_PER_SAVE;

  useEffect(() => {
    if (!touched) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/produits/recherche?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        if (response.ok) setResults(((await response.json()) as { results: ProductSearchResult[] }).results);
      } catch {
        // Requête annulée : on garde l'affichage précédent.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, touched]);

  const chosen = new Set(values.map((product) => product.id));
  const shown = results.filter((product) => product.id !== excludeId && !chosen.has(product.id));
  return (
    <Field label={label} hint={full ? `${MAX_ADVICE_PER_SAVE} produits au plus en une fois : enregistrez, puis continuez.` : values.length > 0 ? "Ajoutez-en d'autres si vous voulez : chacun devient une association." : undefined}>
      <div className="space-y-2">
        {values.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Produits choisis">
            {values.map((product) => (
              <li key={product.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-brand-300 bg-brand-50/60 py-1 pr-1 pl-3 text-[13px] text-text-primary dark:border-brand-700 dark:bg-brand-950/30">
                <span className="truncate font-medium">{product.name}</span>
                <span className="shrink-0 text-[11.5px] text-text-tertiary">{product.quantity > 0 ? `${product.quantity} en stock` : "rupture"}</span>
                <button type="button" onClick={() => onRemove(product.id)} className="shrink-0 rounded-full p-1 text-text-tertiary hover:bg-surface-sunken hover:text-text-primary" aria-label={`Retirer ${product.name}`}>
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Input
          type="search"
          value={query}
          disabled={full}
          onFocus={() => setTouched(true)}
          onChange={(event) => {
            setTouched(true);
            setQuery(event.target.value);
          }}
          placeholder={values.length > 0 ? "Ajouter un autre produit…" : "Nom, marque, référence, EAN…"}
          leadingIcon={loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          aria-label={values.length > 0 ? "Ajouter un autre produit à conseiller" : label}
        />
        {touched && !full && (
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border-subtle bg-surface-card p-1.5">
            {shown.length === 0 && !loading ? (
              <li className="px-2 py-3 text-center text-[12.5px] text-text-tertiary">Aucun produit trouvé dans votre catalogue.</li>
            ) : (
              shown.map((product) => (
                <li key={product.id}>
                  <button type="button" onClick={() => onAdd(product)} className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-brand-50/70 dark:hover:bg-brand-950/40">
                    <Plus className="size-4 shrink-0 text-text-tertiary" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-text-primary">{product.name}</span>
                      <span className="block truncate text-[12px] text-text-tertiary">{product.brand ?? "—"}</span>
                    </span>
                    {stockBadge(product.quantity, product.status)}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </Field>
  );
}

function AssociationItem({ association }: { association: AssociationRow }) {
  const [editing, setEditing] = useState(false);
  const [sentence, setSentence] = useState(association.sentence ?? "");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const run = (action: () => ReturnType<typeof updateAssociationAction>, after?: () => void) => {
    startTransition(async () => {
      const result = await action();
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré") : result.error });
      if (result.ok) after?.();
    });
  };

  const unavailable = association.advice.deleted ? "Produit supprimé" : association.advice.quantity <= 0 ? "En rupture : non proposé tant qu'il n'y en a pas" : null;

  return (
    <li className="space-y-2.5 py-3.5">
      <div className="flex flex-wrap items-start gap-3">
        <ArrowRight className="mt-1 size-4 shrink-0 text-text-tertiary" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-medium text-text-primary">
            <span>{association.advice.name}</span>
            {!association.isActive && <Badge tone="neutral">Suspendue</Badge>}
            {unavailable && <Badge tone="warning">{unavailable}</Badge>}
          </p>
          <p className="text-[12px] text-text-tertiary">
            {association.advice.brand ? `${association.advice.brand} · ` : ""}
            {association.advice.quantity > 0 ? `${association.advice.quantity} en stock` : "0 en stock"}
            {" · "}
            {formatDate(association.createdAt)}
            {association.createdBy ? ` · ${association.createdBy}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Switch checked={association.isActive} disabled={pending} aria-label={association.isActive ? "Suspendre l'association" : "Réactiver l'association"} onChange={(event) => run(() => updateAssociationAction({ associationId: association.id, isActive: event.target.checked }))} />
          {confirming ? (
            <span className="flex items-center gap-1.5">
              <Button size="sm" variant="danger" disabled={pending} onClick={() => run(() => deleteAssociationAction(association.id))}>
                Supprimer
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
                Garder
              </Button>
            </span>
          ) : (
            <button type="button" disabled={pending} onClick={() => setConfirming(true)} className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-danger-50 hover:text-danger-600 disabled:opacity-50 dark:hover:bg-danger-700/15" aria-label={`Supprimer l'association vers ${association.advice.name}`}>
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-2 pl-7">
          <Textarea value={sentence} maxLength={MAX_SENTENCE_LENGTH} onChange={(event) => setSentence(event.target.value)} aria-label="Ce que vous dites au patient" className="min-h-16" />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              loading={pending}
              onClick={() =>
                run(
                  () => updateAssociationAction({ associationId: association.id, sentence: sentence.trim() || null }),
                  () => setEditing(false),
                )
              }
            >
              Enregistrer la phrase
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSentence(association.sentence ?? "");
                setEditing(false);
              }}
            >
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 pl-7">
          <p className="min-w-0 flex-1 text-[13px] leading-5 text-text-secondary">{association.sentence ? <>« {association.sentence} »</> : <span className="text-text-tertiary">Pas de phrase : la carte affichera une formule neutre.</span>}</p>
          <button type="button" onClick={() => setEditing(true)} className="flex shrink-0 items-center gap-1 text-[12.5px] text-text-tertiary underline-offset-2 hover:text-text-secondary hover:underline">
            <Pencil className="size-3.5" aria-hidden />
            {association.sentence ? "Modifier" : "Ajouter une phrase"}
          </button>
        </div>
      )}
    </li>
  );
}
