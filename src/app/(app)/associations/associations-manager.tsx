"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowRight, Bell, BellOff, Check, Loader2, Package, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { createAssociationsAction, deleteAssociationAction, updateAssociationAction } from "@/server/actions/associations";
import { MAX_ADVICE_PER_SAVE, MAX_SENTENCE_LENGTH, MAX_TRIGGERS_PER_SAVE } from "@/core/associations/rules";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import type { DrugClassOption, TriggerOption, TriggerSearch } from "@/app/api/associations/declencheurs/route";
import type { AdviceOption, AdviceSearch } from "@/app/api/associations/conseils/route";

/** Ce qui est proposé : un produit de l'officine, ou un médicament sans ordonnance de son stock (toutes ses boîtes). */
type ProductBrief = { kind: "PRODUCT" | "DRUG"; id: string; name: string; brand: string | null; quantity: number; deleted: boolean; imageUrl?: string | null };
/** Ce qui déclenche : un produit du stock, ou un médicament du catalogue national (sans stock connu). */
type TriggerBrief = { kind: "PRODUCT" | "DRUG" | "CLASS"; id: string; name: string; brand: string | null; quantity: number | null; deleted: boolean };
type AssociationRow = { id: string; trigger: TriggerBrief; advice: ProductBrief; sentence: string | null; isActive: boolean; createdBy: string | null; createdAt: string };
type Ref = { kind: "PRODUCT" | "DRUG" | "CLASS"; id: string };
/** Un déclencheur choisi : un produit, un médicament, ou une famille de médicaments (toutes les amoxicillines d'un coup). */
type PickedTrigger = TriggerOption | ({ kind: "CLASS" } & DrugClassOption);

/**
 * Les associations de produits : à gauche ce qui déclenche (un ou plusieurs produits ou médicaments), à droite ce qu'on
 * propose (un ou plusieurs produits ou médicaments sans ordonnance du stock). « Enregistrer » crée toutes les combinaisons.
 *
 * Rien ici ne contourne un garde-fou : à l'analyse d'une vente, l'association passe par le stock (jamais un produit en
 * rupture), l'ordonnance (jamais un médicament sur ordonnance), la sécurité du patient et la vente déjà en cours. L'écran le
 * dit, pour que personne ne s'étonne d'une carte qui ne s'affiche pas.
 */
export function AssociationsManager({ associations, canEdit = true }: { associations: AssociationRow[]; /** Faux : lecture seule (le serveur refuse de toute façon). */ canEdit?: boolean }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(associations.length === 0);
  const needle = fold(search.trim());
  const counts: Record<Filter, number> = {
    ALL: associations.length,
    ACTIVE: associations.filter((row) => row.isActive).length,
    OUT: associations.filter(isOut).length,
    PAUSED: associations.filter((row) => !row.isActive).length,
  };
  const shown = associations.filter((row) => FILTERS[filter].keep(row) && (!needle || fold(`${row.trigger.name} ${row.advice.name} ${row.advice.brand ?? ""} ${row.sentence ?? ""}`).includes(needle)));

  return (
    <div className="space-y-5">
      {canEdit ? (
        creating && <NewAssociation onClose={associations.length > 0 ? () => setCreating(false) : undefined} />
      ) : (
        <Alert tone="neutral" title="Lecture seule">
          Vous voyez les associations de votre pharmacie ; les créer ou les modifier est réservé au titulaire, au pharmacien et au préparateur.
        </Alert>
      )}

      <section aria-labelledby="mes-associations" className="space-y-3">
        <h2 id="mes-associations" className="sr-only">
          Mes associations
        </h2>
        {/* La barre : les onglets, la recherche, « Créer une association ». */}
        <div className="flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Filtrer les associations" className="flex flex-wrap gap-1 rounded-xl border border-border-subtle bg-surface-card p-1">
            {(Object.keys(FILTERS) as Filter[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                onClick={() => setFilter(key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                  filter === key ? "bg-brand-600 text-white shadow-sm" : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
                )}
              >
                {FILTERS[key].label}
                <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", filter === key ? "bg-white/20" : "bg-surface-sunken text-text-tertiary")}>{counts[key]}</span>
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une association" leadingIcon={<Search className="size-4" />} aria-label="Rechercher une association" className="w-64" />
            {canEdit && !creating && (
              <Button leadingIcon={<Plus className="size-[18px]" />} onClick={() => setCreating(true)}>
                Créer une association
              </Button>
            )}
          </div>
        </div>

        {associations.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Package className="size-5" />}
              title="Aucune association pour l'instant"
              description={
                canEdit
                  ? "Tapez la première lettre d'un produit, d'un médicament ou d'une famille (Pénicillines…) à gauche, puis celle du produit à proposer à droite. L'association s'appliquera dès la prochaine vente."
                  : "Votre pharmacie n'a pas encore d'association : elles apparaîtront ici dès qu'elles seront créées."
              }
            />
          </Card>
        ) : (
          <div className="space-y-2.5">
            {/* L'en-tête du tableau, en paysage : les trois colonnes. */}
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)_44px] gap-6 rounded-xl border border-border-subtle bg-surface-card px-5 py-3 text-[11.5px] font-semibold tracking-[0.08em] text-text-tertiary uppercase shadow-xs lg:grid">
              <span>Élément déclencheur</span>
              <span>Produit conseillé</span>
              <span>Conseil associé</span>
              <span />
            </div>
            {shown.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border-subtle px-4 py-8 text-center text-[13.5px] text-text-tertiary">Aucune association ne correspond.</p>
            ) : (
              <ul className="space-y-2.5">
                {shown.map((association) => (
                  <AssociationRowCard key={association.id} association={association} canEdit={canEdit} />
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <Alert tone="info" title="Deux façons de conseiller, qui se complètent">
        <span className="block">
          <strong>Un médicament déclenche un produit conseil</strong> — un antibiotique appelle un spray pour laver le nez : c&apos;est le moteur de PharmaBoost, rien à régler ici.
        </span>
        <span className="mt-1 block">
          <strong>Vos associations</strong> — un produit, un médicament ou une famille de médicaments en appelle d&apos;autres, que vous choisissez dans votre stock, même sur une vente spontanée : c&apos;est cette page.
        </span>
      </Alert>
    </div>
  );
}

type Filter = "ALL" | "ACTIVE" | "OUT" | "PAUSED";
const isOut = (row: AssociationRow) => row.isActive && (row.advice.deleted || row.advice.quantity <= 0);
const FILTERS: Record<Filter, { label: string; keep: (row: AssociationRow) => boolean }> = {
  ALL: { label: "Toutes", keep: () => true },
  ACTIVE: { label: "Actives", keep: (row) => row.isActive },
  OUT: { label: "En rupture", keep: isOut },
  PAUSED: { label: "Désactivées", keep: (row) => !row.isActive },
};
const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

type Push = ReturnType<typeof useToast>["push"];

/** Enregistre toutes les combinaisons ; dit ce qui a été créé, et pourquoi le reste a été écarté. Vrai si quelque chose a été créé. */
async function saveGrid(triggers: Ref[], advice: AdviceOption[], sentence: string | null, push: Push): Promise<boolean> {
  const result = await createAssociationsAction({ triggers, advice: advice.map((option) => ({ kind: option.kind, id: option.id })), sentence });
  if (!result.ok) {
    push({ tone: "error", title: "Rien n'a été enregistré", description: result.error });
    return false;
  }
  push({ tone: "success", title: result.message ?? "Associations enregistrées" });
  const skipped = result.data.skipped;
  if (skipped.length > 0) push({ tone: "warning", title: skipped.length === 1 ? "Une combinaison écartée" : `${skipped.length} combinaisons écartées`, description: skipped.map((skip) => skip.reason).join(" ") });
  return true;
}

function NewAssociation({ onClose }: { onClose?: () => void }) {
  const [triggers, setTriggers] = useState<PickedTrigger[]>([]);
  const [advice, setAdvice] = useState<AdviceOption[]>([]);
  const [sentence, setSentence] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const total = triggers.length * advice.length;
  const submit = () => {
    setError(null);
    if (triggers.length === 0 || advice.length === 0) {
      setError("Choisissez au moins un produit ou médicament à gauche, et au moins un produit à proposer à droite.");
      return;
    }
    startTransition(async () => {
      const refs = triggers.map((option): Ref => (option.kind === "PRODUCT" ? { kind: "PRODUCT", id: option.productId } : option.kind === "CLASS" ? { kind: "CLASS", id: option.code } : { kind: "DRUG", id: option.specialtyId }));
      if (await saveGrid(refs, advice, sentence.trim() || null, push)) {
        setTriggers([]);
        setAdvice([]);
        setSentence("");
        onClose?.();
      }
    });
  };

  return (
    <Card>
      <CardHeader
        title="Nouvelle association"
        description="Tapez une lettre : PharmaBoost propose ce qui est dans votre stock, et les familles de médicaments. Choisissez-en autant que vous voulez de chaque côté — chaque élément de gauche appellera chaque produit de droite."
        action={
          onClose && (
            <Button size="sm" variant="ghost" leadingIcon={<X className="size-4" />} onClick={onClose}>
              Fermer
            </Button>
          )
        }
      />
      <CardContent className="space-y-4">
        <div className="grid items-start gap-4 md:grid-cols-[1fr_auto_1fr]">
          <TriggerField values={triggers} onChange={setTriggers} />
          <ArrowRight className="mt-9 hidden size-5 shrink-0 text-text-tertiary md:block" aria-hidden />
          <AdviceField values={advice} onChange={setAdvice} excludeTrigger={undefined} label={advice.length > 1 ? "PharmaBoost propose ces produits" : "PharmaBoost propose"} />
        </div>

        <Field
          label="Ce que vous dites au patient (facultatif)"
          htmlFor="association-sentence"
          hint={`Vos mots, tels quels, sur la carte du comptoir${total > 1 ? " — la même phrase pour chaque association, modifiable ensuite une par une" : ""}. Sans phrase, PharmaBoost n'affiche qu'une formule neutre. ${sentence.length}/${MAX_SENTENCE_LENGTH}`}
        >
          <Textarea id="association-sentence" value={sentence} maxLength={MAX_SENTENCE_LENGTH} onChange={(event) => setSentence(event.target.value)} placeholder="Par exemple : pour accompagner le lavage du nez quand la toux s'installe." className="min-h-16" />
        </Field>

        {error && (
          <p role="alert" className="text-[13px] text-danger-600">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={submit} loading={pending} disabled={total === 0} leadingIcon={<Plus className="size-[18px]" />}>
            {total > 1 ? `Enregistrer les ${total} associations` : "Enregistrer l'association"}
          </Button>
          {triggers.length > 1 || advice.length > 1 ? (
            <p className="text-[13px] text-text-secondary">
              {triggers.length} déclencheur{triggers.length > 1 ? "s" : ""} × {advice.length} produit{advice.length > 1 ? "s" : ""} proposé{advice.length > 1 ? "s" : ""} = {total} association{total > 1 ? "s" : ""}. Celles qui existent déjà sont simplement ignorées.
            </p>
          ) : (
            <p className="text-[12.5px] text-text-tertiary">Au comptoir, deux associations au plus par boîte scannée (six par vente), en plus des conseils de PharmaBoost. Jamais un produit en rupture, jamais un médicament sur ordonnance, jamais ce que la sécurité du patient écarte.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Le délai avant d'interroger le serveur : court, pour que la liste suive chaque lettre sans une requête par touche. */
const SEARCH_DELAY_MS = 150;

/** Ce qu'on lit d'un médicament : son nom sans la forme, puis la forme (ou le conditionnement détenu). */
const drugTitle = (name: string) => name.split(",")[0].trim();
const drugForm = (name: string) => (name.includes(",") ? name.slice(name.indexOf(",") + 1).trim() : "");

function stockBadge(quantity: number | null, status?: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK") {
  if (quantity === null) return null;
  if (quantity <= 0) return <Badge tone="danger">Rupture</Badge>;
  return <Badge tone={status === "LOW_STOCK" ? "warning" : "success"}>{`${quantity} en stock`}</Badge>;
}

/** Interroge `url` à chaque lettre (dès la première), annule la requête précédente, garde l'affichage pendant la frappe. */
function useLiveSearch<T>(url: string, query: string, empty: T): { results: T; loading: boolean } {
  const [results, setResults] = useState<T>(empty);
  const [loading, setLoading] = useState(false);
  const needle = query.trim();
  useEffect(() => {
    if (needle.length === 0) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`${url}?q=${encodeURIComponent(needle)}`, { signal: controller.signal });
        if (response.ok) setResults((await response.json()) as T);
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
  }, [needle, url]);
  return { results, loading };
}

/** Les puces de ce qui est choisi, chacune retirable d'un clic. */
function Chips<T>({ values, label, keyOf, render, onRemove }: { values: T[]; label: string; keyOf: (value: T) => string; render: (value: T) => { title: string; detail: string; drug: boolean }; onRemove: (value: T) => void }) {
  if (values.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={label}>
      {values.map((value) => {
        const { title, detail, drug } = render(value);
        return (
          <li key={keyOf(value)} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-brand-300 bg-brand-50/60 py-1 pr-1 pl-3 text-[13px] text-text-primary dark:border-brand-700 dark:bg-brand-950/30">
            <Check className="size-3.5 shrink-0 text-brand-700 dark:text-brand-300" aria-hidden />
            <span className="truncate font-medium">{title}</span>
            {drug && <span className="shrink-0 rounded-full bg-info-50 px-1.5 text-[10.5px] font-medium text-info-700 dark:bg-info-700/20 dark:text-info-300">Médicament</span>}
            {detail && <span className="shrink-0 text-[11.5px] text-text-tertiary">{detail}</span>}
            <button type="button" onClick={() => onRemove(value)} className="shrink-0 rounded-full p-1 text-text-tertiary hover:bg-surface-sunken hover:text-text-primary" aria-label={`Retirer ${title}`}>
              <X className="size-3.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Pendant la toute première recherche : trois lignes qui respirent, à la place du résultat. */
function SearchSkeleton() {
  return (
    <div className="space-y-1.5 p-1.5" role="status" aria-label="Recherche en cours">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex items-center gap-3 px-1 py-1">
          <Skeleton className="size-4 rounded" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

const triggerKey = (option: PickedTrigger) => (option.kind === "DRUG" ? `d:${option.specialtyId}` : option.kind === "CLASS" ? `c:${option.code}` : `p:${option.productId}`);

/**
 * Les déclencheurs, en UN champ : dès la première lettre, ce que l'officine détient (médicaments et produits, en stock
 * d'abord), puis le reste du catalogue national. On en choisit autant qu'on veut : la liste reste ouverte.
 */
function TriggerField({ values, onChange }: { values: PickedTrigger[]; onChange: (options: PickedTrigger[]) => void }) {
  const label = "Quand ce produit ou ce médicament est dans la vente";
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { results, loading } = useLiveSearch<TriggerSearch>("/api/associations/declencheurs", query, { stock: [], catalogue: [], classes: [] });
  const needle = query.trim();
  const full = values.length >= MAX_TRIGGERS_PER_SAVE;
  const chosen = new Set(values.map(triggerKey));
  const stock = results.stock.filter((option) => !chosen.has(triggerKey(option)));
  const catalogue = results.catalogue.filter((option) => !chosen.has(triggerKey(option)));
  const classes = results.classes.map((item) => ({ kind: "CLASS" as const, ...item })).filter((option) => !chosen.has(triggerKey(option)));
  const pick = (option: PickedTrigger) => {
    if (!full && !chosen.has(triggerKey(option))) onChange([...values, option]);
  };

  return (
    <Field label={label} hint={full ? `${MAX_TRIGGERS_PER_SAVE} au plus en une fois : enregistrez, puis continuez.` : values.length > 0 ? "Ajoutez-en d'autres si vous voulez : chacun appellera les produits de droite." : "Un médicament vaut pour toutes ses formes (comprimé, sirop…). Une famille (Pénicillines, Macrolides…) vaut pour tous ses médicaments."}>
      <div className="space-y-2">
        <Chips
          values={values}
          label="Déclencheurs choisis"
          keyOf={triggerKey}
          render={(option) =>
            option.kind === "CLASS"
              ? { title: option.label, detail: "famille", drug: false }
              : { title: option.kind === "DRUG" ? drugTitle(option.name) : option.name, detail: option.quantity === null ? "catalogue" : option.quantity > 0 ? `${option.quantity} en stock` : "rupture", drug: option.kind === "DRUG" }
          }
          onRemove={(option) => onChange(values.filter((value) => triggerKey(value) !== triggerKey(option)))}
        />
        <Input type="search" value={query} disabled={full} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={(event) => event.key === "Escape" && setOpen(false)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} placeholder={values.length > 0 ? "Ajouter un autre produit ou médicament…" : "Tapez une lettre : D, DO, DOLI…"} leadingIcon={loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} aria-label={label} />
        {open && needle.length > 0 && !full && (
          <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-border-subtle bg-surface-card p-1.5">
            {stock.length === 0 && catalogue.length === 0 && classes.length === 0 ? (
              loading ? <SearchSkeleton /> : <p className="px-2 py-3 text-center text-[12.5px] text-text-tertiary">Rien trouvé, ni dans votre stock ni au catalogue national.</p>
            ) : (
              <>
                <OptionGroup title="Familles de médicaments — tout d'un coup">
                  {classes.map((option) => (
                    <OptionRow key={triggerKey(option)} onPick={() => pick(option)} title={option.label} detail={option.detail} badges={<Badge tone="info">Famille</Badge>} />
                  ))}
                </OptionGroup>
                <OptionGroup title="Dans mon stock">
                  {stock.map((option) => (
                    <OptionRow
                      key={triggerKey(option)}
                      onPick={() => pick(option)}
                      title={option.kind === "DRUG" ? drugTitle(option.name) : option.name}
                      detail={option.kind === "DRUG" ? [drugForm(option.name), option.label ?? option.substances.join(", ")].filter(Boolean).join(" — ") || "—" : (option.brand ?? "Produit de l'officine")}
                      badges={
                        <>
                          {option.kind === "DRUG" && <Badge tone="info">Médicament</Badge>}
                          {option.kind === "DRUG" ? stockBadge(option.quantity) : stockBadge(option.quantity, option.status)}
                        </>
                      }
                    />
                  ))}
                </OptionGroup>
                <OptionGroup title="Autres médicaments (pas dans mon stock)">
                  {catalogue.map((option) => (
                    <OptionRow
                      key={triggerKey(option)}
                      onPick={() => pick(option)}
                      title={option.kind === "DRUG" ? drugTitle(option.name) : option.name}
                      detail={option.kind === "DRUG" ? [drugForm(option.name), option.substances.join(", ")].filter(Boolean).join(" — ") || "—" : ""}
                      badges={
                        <>
                          <Badge tone="info">Médicament</Badge>
                          {option.kind === "DRUG" && !option.marketed && <Badge tone="warning">Non commercialisé</Badge>}
                        </>
                      }
                    />
                  ))}
                </OptionGroup>
              </>
            )}
          </div>
        )}
      </div>
    </Field>
  );
}

function OptionGroup({ title, children }: { title: string; children: React.ReactNode[] }) {
  if (children.length === 0) return null;
  return (
    <section aria-label={title}>
      <h3 className="px-2.5 pt-1.5 pb-1 text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">{title}</h3>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  );
}

function OptionRow({ title, detail, badges, onPick }: { title: string; detail: string; badges: React.ReactNode; onPick: () => void }) {
  return (
    <li>
      {/* La souris ne retire pas le focus du champ : on enchaîne les choix, la liste reste ouverte. */}
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onPick} className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-brand-50/70 dark:hover:bg-brand-950/40">
        <Plus className="size-4 shrink-0 text-text-tertiary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-text-primary">{title}</span>
          {detail && <span className="block truncate text-[12px] text-text-tertiary">{detail}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">{badges}</span>
      </button>
    </li>
  );
}

const adviceKey = (option: AdviceOption) => `${option.kind}:${option.id}`;

/**
 * Les produits proposés : dès la première lettre, ce que l'officine peut remettre — ses produits et ses médicaments SANS
 * ordonnance, en stock d'abord. Un médicament sur ordonnance n'apparaît jamais. On en choisit autant qu'on veut.
 */
function AdviceField({ values, onChange, label, exclude, excludeTrigger }: { values: AdviceOption[]; onChange: (options: AdviceOption[]) => void; label: string; exclude?: ReadonlySet<string>; excludeTrigger?: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { results, loading } = useLiveSearch<AdviceSearch>("/api/associations/conseils", query, { stock: [], empty: [] });
  const needle = query.trim();
  const full = values.length >= MAX_ADVICE_PER_SAVE;
  const chosen = new Set(values.map(adviceKey));
  const visible = (option: AdviceOption) => !chosen.has(adviceKey(option)) && !exclude?.has(adviceKey(option)) && !(option.kind === "PRODUCT" && option.id === excludeTrigger);
  const stock = results.stock.filter(visible);
  const empty = results.empty.filter(visible);
  const pick = (option: AdviceOption) => {
    if (!full && !chosen.has(adviceKey(option))) onChange([...values, option]);
  };
  const row = (option: AdviceOption) => (
    <OptionRow
      key={adviceKey(option)}
      onPick={() => pick(option)}
      title={option.kind === "DRUG" ? drugTitle(option.name) : option.name}
      detail={option.kind === "DRUG" ? [drugForm(option.name), option.label].filter(Boolean).join(" — ") || "Médicament sans ordonnance" : (option.brand ?? "Produit de l'officine")}
      badges={
        <>
          {option.kind === "DRUG" && <Badge tone="info">Médicament</Badge>}
          {option.kind === "DRUG" ? stockBadge(option.quantity) : stockBadge(option.quantity, option.status)}
        </>
      }
    />
  );

  return (
    <Field label={label} hint={full ? `${MAX_ADVICE_PER_SAVE} produits au plus en une fois : enregistrez, puis continuez.` : values.length > 0 ? "Ajoutez-en d'autres si vous voulez : chacun devient une association." : "Produits et médicaments sans ordonnance de votre stock."}>
      <div className="space-y-2">
        <Chips
          values={values}
          label="Produits choisis"
          keyOf={adviceKey}
          render={(option) => ({ title: option.kind === "DRUG" ? drugTitle(option.name) : option.name, detail: option.quantity > 0 ? `${option.quantity} en stock` : "rupture", drug: option.kind === "DRUG" })}
          onRemove={(option) => onChange(values.filter((value) => adviceKey(value) !== adviceKey(option)))}
        />
        <Input type="search" value={query} disabled={full} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={(event) => event.key === "Escape" && setOpen(false)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} placeholder={values.length > 0 ? "Ajouter un autre produit…" : "Tapez une lettre : produit, marque, médicament…"} leadingIcon={loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} aria-label={label} />
        {open && needle.length > 0 && !full && (
          <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-border-subtle bg-surface-card p-1.5">
            {stock.length === 0 && empty.length === 0 ? (
              loading ? <SearchSkeleton /> : <p className="px-2 py-3 text-center text-[12.5px] text-text-tertiary">Rien trouvé dans votre stock.</p>
            ) : (
              <>
                <OptionGroup title="En stock">{stock.map(row)}</OptionGroup>
                <OptionGroup title="En rupture — proposé dès le réassort">{empty.map(row)}</OptionGroup>
              </>
            )}
          </div>
        )}
      </div>
    </Field>
  );
}

/** Une association, une ligne du tableau : ce qui déclenche, ce qui est proposé, ce qu'on dit — et les actions à droite. */
function AssociationRowCard({ association, canEdit }: { association: AssociationRow; canEdit: boolean }) {
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

  const { trigger, advice } = association;
  const triggerName = trigger.kind === "DRUG" ? drugTitle(trigger.name) : trigger.name;
  const triggerDetail = trigger.kind === "DRUG" ? "Toutes les formes de ce médicament" : trigger.kind === "CLASS" ? (trigger.brand ?? "Toute la famille") : (trigger.brand ?? "Produit de l'officine");
  const adviceName = advice.kind === "DRUG" ? drugTitle(advice.name) : advice.name;

  return (
    <li
      className={cn(
        "grid gap-4 rounded-2xl border border-border-subtle bg-surface-card px-5 py-4 shadow-xs transition-shadow hover:shadow-sm lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)_44px] lg:items-center lg:gap-6",
        !association.isActive && "opacity-60",
      )}
    >
      {/* Élément déclencheur */}
      <div className="min-w-0 space-y-1">
        <p className="text-[11.5px] text-text-tertiary">Élément déclencheur</p>
        <p className="text-[14.5px] leading-5 font-semibold text-text-primary">{triggerName}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={trigger.kind === "PRODUCT" ? "neutral" : "info"}>{trigger.kind === "CLASS" ? "Famille" : trigger.kind === "DRUG" ? "Médicament" : "Produit"}</Badge>
          {trigger.deleted && <Badge tone="danger">Produit supprimé</Badge>}
        </div>
        <p className="line-clamp-2 text-[12px] leading-4 text-text-tertiary">{triggerDetail}</p>
      </div>

      {/* Produit conseillé */}
      <div className="flex min-w-0 items-center gap-3">
        {advice.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- la photo studio, petite, servie telle quelle.
          <img src={advice.imageUrl} alt="" className="size-12 shrink-0 rounded-lg border border-border-subtle bg-white object-contain p-0.5" />
        ) : (
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300">
            <Package className="size-5" aria-hidden />
          </span>
        )}
        <div className="min-w-0 space-y-1">
          <p className="text-[11.5px] text-text-tertiary">Produit conseillé</p>
          <p className="text-[14px] leading-5 font-semibold text-text-primary">{adviceName}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {advice.kind === "DRUG" && <Badge tone="info">Médicament</Badge>}
            {advice.deleted ? <Badge tone="danger">Produit supprimé</Badge> : advice.quantity > 0 ? <Badge tone="success">{`${advice.quantity} en stock`}</Badge> : <Badge tone="warning">Rupture</Badge>}
            {!association.isActive && <Badge tone="neutral">Désactivée</Badge>}
          </div>
        </div>
      </div>

      {/* Conseil associé */}
      <div className="min-w-0 space-y-1">
        <p className="text-[11.5px] text-text-tertiary">Conseil associé</p>
        {editing ? (
          <div className="space-y-2">
            <Textarea value={sentence} maxLength={MAX_SENTENCE_LENGTH} onChange={(event) => setSentence(event.target.value)} aria-label="Ce que vous dites au patient" className="min-h-16" autoFocus />
            <div className="flex items-center gap-2">
              <Button size="sm" loading={pending} onClick={() => run(() => updateAssociationAction({ associationId: association.id, sentence: sentence.trim() || null }), () => setEditing(false))}>
                Enregistrer
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
        ) : association.sentence ? (
          <p className="text-[13.5px] leading-5 text-text-primary">{association.sentence}</p>
        ) : (
          <p className="text-[13px] leading-5 text-text-tertiary">Pas de phrase : la carte du comptoir affiche une formule neutre.</p>
        )}
        <p className="text-[11.5px] text-text-tertiary">
          {formatDate(association.createdAt)}
          {association.createdBy ? ` · ${association.createdBy}` : ""}
        </p>
      </div>

      {/* Les actions : modifier le conseil, désactiver, supprimer. */}
      {canEdit && (
        <div className="flex items-center gap-2 lg:flex-col">
          <RoundAction label={association.sentence ? "Modifier le conseil associé" : "Ajouter un conseil associé"} tone="brand" disabled={pending} onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
          </RoundAction>
          <RoundAction
            label={association.isActive ? "Désactiver l'association" : "Réactiver l'association"}
            tone="neutral"
            disabled={pending}
            onClick={() => run(() => updateAssociationAction({ associationId: association.id, isActive: !association.isActive }))}
          >
            {association.isActive ? <BellOff className="size-4" /> : <Bell className="size-4" />}
          </RoundAction>
          {confirming ? (
            <span className="flex items-center gap-1 lg:flex-col">
              <Button size="sm" variant="danger" disabled={pending} onClick={() => run(() => deleteAssociationAction(association.id))}>
                Supprimer
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
                Garder
              </Button>
            </span>
          ) : (
            <RoundAction label={`Supprimer l'association vers ${advice.name}`} tone="danger" disabled={pending} onClick={() => setConfirming(true)}>
              <Trash2 className="size-4" />
            </RoundAction>
          )}
        </div>
      )}
    </li>
  );
}

function RoundAction({ label, tone, disabled, onClick, children }: { label: string; tone: "brand" | "neutral" | "danger"; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full border transition-colors disabled:opacity-50",
        tone === "brand" && "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-300",
        tone === "neutral" && "border-border-subtle bg-surface-card text-text-tertiary hover:bg-surface-sunken hover:text-text-primary",
        tone === "danger" && "border-border-subtle bg-surface-card text-text-tertiary hover:border-danger-200 hover:bg-danger-50 hover:text-danger-600 dark:hover:bg-danger-700/15",
      )}
    >
      {children}
    </button>
  );
}
