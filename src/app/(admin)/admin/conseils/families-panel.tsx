"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Pencil, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { previewTriggerFamilyAction, saveTriggerFamilyAction, setTriggerFamilyMemberAction, setTriggerFamilyRemovedAction } from "@/server/actions/admin-central-advice";
import type { FamilyProduct, FamilyView } from "@/server/services/trigger-families";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { SearchField } from "./advice-control";

/**
 * Les familles déclencheuses (comme « Shampoings anti-chute ») : une famille réunit des produits ; une association déclenchée
 * par la famille part dès que N'IMPORTE LEQUEL de ses produits est scanné. Une famille se remplit par les mots du libellé —
 * elle marche alors seule dans chaque nouvelle pharmacie — puis produit par produit : ajouter, retirer.
 */
export function FamiliesPanel({ families, onAssociate }: { families: FamilyView[]; onAssociate: (familyId: string) => void }) {
  const [editing, setEditing] = useState<FamilyView | "NEW" | null>(null);
  const [query, setQuery] = useState("");
  const live = families.filter((family) => family.status !== "REMOVED");
  const removed = families.filter((family) => family.status === "REMOVED");
  const words = query.trim().toLowerCase();
  const shown = words ? live.filter((family) => family.name.toLowerCase().includes(words) || family.products.some((product) => product.name.toLowerCase().includes(words))) : live;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-1.5 py-4">
          <p className="text-[15px] font-semibold text-text-primary">Une famille déclenche un conseil dès que l&apos;un de ses produits est scanné.</p>
          <p className="text-[13px] leading-5 text-text-secondary">
            Exemple : la famille <strong>Shampoings anti-chute</strong> réunit tous les shampoings anti-chute ; une seule association « Shampoings anti-chute → complément anti-chute » suffit alors pour tous. Une famille se remplit par les <strong>mots du libellé</strong> (elle marche ainsi dans chaque nouvelle pharmacie), puis vous <strong>ajoutez</strong> ou <strong>retirez</strong> un produit à la main.
          </p>
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher une famille ou un produit…" leadingIcon={<Search className="size-4" />} aria-label="Chercher une famille" />
        </div>
        <Button onClick={() => setEditing("NEW")} leadingIcon={<Plus className="size-4" />}>
          Créer une famille
        </Button>
      </div>
      {shown.length === 0 ? (
        <Card>
          <EmptyState title={query ? "Aucune famille ne correspond" : "Aucune famille pour l'instant"} description="Créez la première : un nom, et les mots qu'on lit sur l'étiquette des produits." />
        </Card>
      ) : (
        <ul className="space-y-3">
          {shown.map((family) => (
            <FamilyItem key={family.id} family={family} onEdit={() => setEditing(family)} onAssociate={() => onAssociate(family.id)} />
          ))}
        </ul>
      )}
      {removed.length > 0 && (
        <details className="rounded-xl border border-border-subtle bg-surface-card p-4">
          <summary className="cursor-pointer text-[13.5px] font-semibold text-text-secondary">Familles supprimées ({removed.length})</summary>
          <ul className="mt-3 space-y-2">
            {removed.map((family) => (
              <RemovedFamily key={family.id} family={family} />
            ))}
          </ul>
        </details>
      )}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "NEW" ? "Créer une famille" : "Modifier la famille"}
        description="Les mots qu'on lit sur l'étiquette des produits de la famille. Ce que vous décidez vaut pour toutes les pharmacies."
        size="lg"
      >
        {editing !== null && <FamilyForm family={editing === "NEW" ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

function FamilyItem({ family, onEdit, onAssociate }: { family: FamilyView; onEdit: () => void; onAssociate: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const setMember = (product: { ean: string; name: string }, included: boolean | null) =>
    startTransition(async () => {
      const result = await setTriggerFamilyMemberAction({ familyId: family.id, ean: product.ean, label: product.name, included });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré") : result.error });
    });

  const remove = () =>
    startTransition(async () => {
      const result = await setTriggerFamilyRemovedAction({ id: family.id, removed: true });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Supprimée") : result.error });
    });

  return (
    <li>
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <h3 className="text-[15px] font-semibold text-text-primary">{family.name}</h3>
              <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-text-secondary">
                <Badge tone={family.products.length > 0 ? "success" : "warning"}>
                  {family.products.length} produit{family.products.length > 1 ? "s" : ""}
                </Badge>
                <Badge tone={family.associations > 0 ? "info" : "neutral"}>
                  {family.associations > 0 ? `Déclenche ${family.associations} conseil${family.associations > 1 ? "s" : ""}` : "Ne déclenche encore rien"}
                </Badge>
                {family.includeTerms.length > 0 && <span className="text-text-tertiary">Mots : {family.includeTerms.join(" · ")}</span>}
              </div>
              {family.description && <p className="text-[13px] text-text-secondary">{family.description}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={onAssociate} leadingIcon={<Plus className="size-4" />}>
                Conseil déclenché par cette famille
              </Button>
              <Button size="sm" variant="outline" onClick={onEdit} leadingIcon={<Pencil className="size-4" />}>
                Modifier
              </Button>
              <Button size="sm" variant="ghost" onClick={remove} disabled={pending} leadingIcon={<Trash2 className="size-4" />}>
                Supprimer
              </Button>
            </div>
          </div>
          <button type="button" onClick={() => setOpen((value) => !value)} className="text-[13px] font-medium text-brand-700 hover:underline dark:text-brand-300">
            {open ? "Masquer les produits" : `Voir les produits (${family.products.length})`}
          </button>
          {open && (
            <div className="space-y-3">
              <ProductList products={family.products} pending={pending} onRemove={(product) => setMember(product, false)} onUndo={(product) => setMember(product, null)} />
              {family.removed.length > 0 && (
                <p className="text-[12.5px] text-text-tertiary">
                  Retirés à la main :{" "}
                  {family.removed.map((member, index) => (
                    <span key={member.key}>
                      {index > 0 && " · "}
                      {member.label}{" "}
                      <button type="button" className="text-brand-700 hover:underline dark:text-brand-300" onClick={() => setMember({ ean: member.key.slice(4), name: member.label }, null)} disabled={pending}>
                        remettre
                      </button>
                    </span>
                  ))}
                </p>
              )}
              <SearchField<{ ean: string; name: string; brand: string | null }>
                label="Ajouter un produit à la main"
                endpoint="/api/admin/conseils/produits"
                minLength={2}
                placeholder="Nom, marque ou code-barres…"
                value={null}
                onChange={(item) => item && setMember(item, true)}
                keyOf={(item) => item.ean}
                title={(item) => item.name}
                subtitle={(item) => [item.brand, item.ean].filter(Boolean).join(" · ")}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
}

function ProductList({ products, pending, onRemove, onUndo }: { products: FamilyProduct[]; pending?: boolean; onRemove?: (product: FamilyProduct) => void; onUndo?: (product: FamilyProduct) => void }) {
  if (products.length === 0) return <p className="text-[13px] text-text-tertiary">Aucun produit connu ne correspond encore.</p>;
  return (
    <ul className="max-h-80 divide-y divide-border-subtle overflow-y-auto rounded-lg border border-border-subtle">
      {products.map((product) => (
        <li key={product.ean} className="flex items-center gap-3 px-3 py-2 text-[13px]">
          <span className="min-w-0 flex-1 truncate text-text-primary">{product.name}</span>
          {product.manual && <Badge tone="info">Ajouté à la main</Badge>}
          <span className="hidden text-[12px] text-text-tertiary tabular-nums sm:inline">{product.ean}</span>
          {onRemove && (
            <button
              type="button"
              disabled={pending}
              onClick={() => (product.manual ? onUndo?.(product) : onRemove(product))}
              className="shrink-0 rounded-md p-1.5 text-text-tertiary hover:bg-surface-sunken hover:text-danger-600"
              aria-label={`Retirer ${product.name} de la famille`}
              title="Retirer de la famille"
            >
              <X className="size-4" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

const linesOf = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);

function FamilyForm({ family, onDone }: { family: FamilyView | null; onDone: () => void }) {
  const [name, setName] = useState(family?.name ?? "");
  const [description, setDescription] = useState(family?.description ?? "");
  const [include, setInclude] = useState((family?.includeTerms ?? []).join("\n"));
  const [exclude, setExclude] = useState((family?.excludeTerms ?? []).join("\n"));
  const [preview, setPreview] = useState<FamilyProduct[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();
  const terms = useMemo(() => ({ includeTerms: linesOf(include), excludeTerms: linesOf(exclude) }), [include, exclude]);
  const shownPreview = terms.includeTerms.length > 0 ? preview : null;

  // L'aperçu suit la frappe : les produits connus que ces mots prennent.
  useEffect(() => {
    if (terms.includeTerms.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPreviewing(true);
      const result = await previewTriggerFamilyAction(terms);
      if (!cancelled) {
        setPreview(result.ok ? result.data : null);
        setPreviewing(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [terms]);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveTriggerFamilyAction({ id: family?.id ?? null, name, description: description.trim() || null, ...terms });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Famille enregistrée" });
      onDone();
    });
  };

  return (
    <div className="space-y-4">
      <Field label="Nom de la famille" htmlFor="family-name">
        <Input id="family-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Shampoings anti-chute" />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Mots de l'étiquette (un par ligne)" htmlFor="family-include" hint="Tous les mots d'une ligne doivent y être, en début de mot. « shamp/shp chute » = « shamp » ou « shp », et « chute ».">
          <Textarea id="family-include" rows={5} value={include} onChange={(event) => setInclude(event.target.value)} placeholder={"shamp/shp chute\nshamp/shp antichute"} />
        </Field>
        <Field label="Mots à exclure (un par ligne)" htmlFor="family-exclude" hint="Un produit qui les porte n'en fait pas partie.">
          <Textarea id="family-exclude" rows={5} value={exclude} onChange={(event) => setExclude(event.target.value)} placeholder={"chien/chat"} />
        </Field>
      </div>
      <Field label="Note (facultatif)" htmlFor="family-description">
        <Input id="family-description" value={description} maxLength={300} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
          Produits pris par ces mots {shownPreview && `(${shownPreview.length})`}
          {previewing && <Loader2 className="size-4 animate-spin text-text-tertiary" />}
        </p>
        {shownPreview ? <ProductList products={shownPreview} /> : <p className={cn("text-[13px] text-text-tertiary")}>Écrivez des mots pour voir les produits qu&apos;ils prennent.</p>}
        {family && <p className="text-[12px] text-text-tertiary">Les produits ajoutés ou retirés à la main restent ajoutés ou retirés.</p>}
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-danger-600">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Annuler
        </Button>
        <Button onClick={submit} loading={pending}>
          Enregistrer
        </Button>
      </div>
    </div>
  );
}

function RemovedFamily({ family }: { family: FamilyView }) {
  const [pending, startTransition] = useTransition();
  const { push } = useToast();
  return (
    <li className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-text-secondary">{family.name}</span>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        leadingIcon={<RotateCcw className="size-4" />}
        onClick={() =>
          startTransition(async () => {
            const result = await setTriggerFamilyRemovedAction({ id: family.id, removed: false });
            push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Rétablie") : result.error });
          })
        }
      >
        Rétablir
      </Button>
    </li>
  );
}
