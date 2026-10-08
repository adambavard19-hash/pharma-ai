"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowRight, Check, Loader2, Package, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { createAssociationAction, deleteAssociationAction, updateAssociationAction } from "@/server/actions/associations";
import { MAX_SENTENCE_LENGTH } from "@/core/associations/rules";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Switch, Textarea } from "@/components/ui/field";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import type { ProductSearchResult } from "@/app/api/produits/recherche/route";

type ProductBrief = { id: string; name: string; brand: string | null; quantity: number; deleted: boolean };
type AssociationRow = { id: string; trigger: ProductBrief; advice: ProductBrief; sentence: string | null; isActive: boolean; createdBy: string | null; createdAt: string };

/**
 * Les associations de produits : à gauche le produit qui déclenche, à droite celui qu'on propose.
 *
 * Rien ici ne contourne un garde-fou : à l'analyse d'une vente, l'association passe par le stock (jamais un produit en
 * rupture), la sécurité du patient et la vente déjà en cours. L'écran le dit, pour que personne ne s'étonne d'une carte
 * qui ne s'affiche pas.
 */
export function AssociationsManager({ associations }: { associations: AssociationRow[] }) {
  // Les associations groupées par produit déclencheur, dans l'ordre d'arrivée.
  const groups: { trigger: ProductBrief; items: AssociationRow[] }[] = [];
  for (const association of associations) {
    const group = groups.find((candidate) => candidate.trigger.id === association.trigger.id);
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
          <strong>Un produit conseil en appelle un autre</strong> — le spray pour le nez appelle Olioseptil Bronche, même sur une vente spontanée : c&apos;est cette page, et c&apos;est vous qui décidez.
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
            <Card key={group.trigger.id}>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>Quand « {group.trigger.name} » est dans la vente</span>
                    {group.trigger.deleted && <Badge tone="danger">Produit supprimé</Badge>}
                  </span>
                }
                description={group.trigger.brand ?? undefined}
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
  const [trigger, setTrigger] = useState<ProductSearchResult | null>(null);
  const [advice, setAdvice] = useState<ProductSearchResult | null>(null);
  const [sentence, setSentence] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const submit = () => {
    setError(null);
    if (!trigger || !advice) {
      setError("Choisissez le produit déclencheur et le produit à conseiller.");
      return;
    }
    startTransition(async () => {
      const result = await createAssociationAction({ triggerProductId: trigger.id, adviceProductId: advice.id, sentence: sentence.trim() || null });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Association enregistrée" });
      // On garde le déclencheur : on enchaîne souvent plusieurs produits conseillés pour un même produit.
      setAdvice(null);
      setSentence("");
    });
  };

  return (
    <Card>
      <CardHeader title="Nouvelle association" description="Le produit de gauche appelle le produit de droite." />
      <CardContent className="space-y-4">
        <div className="grid items-start gap-4 md:grid-cols-[1fr_auto_1fr]">
          <ProductField label="Quand ce produit est dans la vente" value={trigger} onChange={setTrigger} excludeId={advice?.id} />
          <ArrowRight className="mt-9 hidden size-5 shrink-0 text-text-tertiary md:block" aria-hidden />
          <ProductField label="PharmaBoost propose ce produit" value={advice} onChange={setAdvice} excludeId={trigger?.id} />
        </div>

        <Field
          label="Ce que vous dites au patient (facultatif)"
          htmlFor="association-sentence"
          hint={`Vos mots, tels quels, sur la carte du comptoir. Sans phrase, PharmaBoost n'affiche qu'une formule neutre. ${sentence.length}/${MAX_SENTENCE_LENGTH}`}
        >
          <Textarea id="association-sentence" value={sentence} maxLength={MAX_SENTENCE_LENGTH} onChange={(event) => setSentence(event.target.value)} placeholder="Par exemple : pour accompagner le lavage du nez quand la toux s'installe." className="min-h-16" />
        </Field>

        {error && (
          <p role="alert" className="text-[13px] text-danger-600">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={submit} loading={pending} disabled={!trigger || !advice} leadingIcon={<Plus className="size-[18px]" />}>
            Enregistrer l&apos;association
          </Button>
          <p className="text-[12.5px] text-text-tertiary">Le produit conseillé n&apos;est jamais proposé en rupture de stock, ni s&apos;il est écarté par la sécurité pour le patient.</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Recherche dans le catalogue de l'officine (nom, marque, référence, EAN) ; un produit en rupture reste choisissable. */
function ProductField({ label, value, onChange, excludeId }: { label: string; value: ProductSearchResult | null; onChange: (product: ProductSearchResult | null) => void; excludeId?: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!touched || value) return;
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
    }, 220);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, touched, value]);

  if (value) {
    return (
      <Field label={label}>
        <div className="flex items-center gap-3 rounded-lg border border-brand-300 bg-brand-50/60 p-3 dark:border-brand-700 dark:bg-brand-950/30">
          <Check className="size-4 shrink-0 text-brand-700 dark:text-brand-300" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium text-text-primary">{value.name}</span>
            <span className="block truncate text-[12px] text-text-tertiary">
              {value.brand ? `${value.brand} · ` : ""}
              {value.quantity > 0 ? `${value.quantity} en stock` : "en rupture"}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery("");
              setResults([]);
              setTouched(true);
            }}
            className="shrink-0 rounded-md p-1.5 text-text-tertiary hover:bg-surface-sunken hover:text-text-primary"
            aria-label={`Changer : ${label}`}
          >
            <X className="size-4" />
          </button>
        </div>
      </Field>
    );
  }

  const shown = results.filter((product) => product.id !== excludeId);
  return (
    <Field label={label}>
      <div className="space-y-2">
        <Input
          type="search"
          value={query}
          onFocus={() => setTouched(true)}
          onChange={(event) => {
            setTouched(true);
            setQuery(event.target.value);
          }}
          placeholder="Nom, marque, référence, EAN…"
          leadingIcon={loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          aria-label={label}
        />
        {touched && (
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border-subtle bg-surface-card p-1.5">
            {shown.length === 0 && !loading ? (
              <li className="px-2 py-3 text-center text-[12.5px] text-text-tertiary">Aucun produit trouvé dans votre catalogue.</li>
            ) : (
              shown.map((product) => (
                <li key={product.id}>
                  <button type="button" onClick={() => onChange(product)} className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-brand-50/70 dark:hover:bg-brand-950/40">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-text-primary">{product.name}</span>
                      <span className="block truncate text-[12px] text-text-tertiary">{product.brand ?? "—"}</span>
                    </span>
                    <Badge tone={product.status === "OUT_OF_STOCK" ? "danger" : product.status === "LOW_STOCK" ? "warning" : "success"}>{product.status === "OUT_OF_STOCK" ? "Rupture" : `${product.quantity} en stock`}</Badge>
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
