"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Package, Pencil, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { deletePartnerProductAction, importPartnerCatalogAction, savePartnerProductAction, setPartnerProductActiveAction } from "@/server/actions/platform-partner-brands";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { CATALOG_IMPORT_COLUMNS, CATALOG_IMPORT_MAX_ROWS } from "@/core/partners/catalog-import";
import type { PublicationStatus } from "@/core/partners/status";
import { centsToInput, formatCents } from "@/lib/format";
import { PublicationBadge } from "../marques/_components/publication-badge";

export type CatalogProduct = {
  id: string;
  name: string;
  rangeId: string | null;
  ean: string | null;
  cip13: string | null;
  packaging: string | null;
  proPriceCents: number | null;
  publicPriceCents: number | null;
  externalRef: string | null;
  isActive: boolean;
  orderLines: number;
};

type ProductForm = {
  id: string | null;
  name: string;
  rangeId: string;
  ean: string;
  cip13: string;
  packaging: string;
  proPrice: string;
  publicPrice: string;
  externalRef: string;
  isActive: boolean;
};

type ImportReport = {
  dataLines: number;
  creates: number;
  updates: number;
  errors: { line: number | null; column: string | null; message: string }[];
  ignoredColumns: string[];
  applied: boolean;
};

const price = (cents: number | null) => (cents === null ? "—" : formatCents(cents));

export function CatalogManager({ brandId, ranges, products }: { brandId: string; ranges: { id: string; name: string; status: PublicationStatus }[]; products: CatalogProduct[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [form, setForm] = useState<ProductForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<CatalogProduct | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const open = (product: CatalogProduct | null, rangeId: string | null = null) => {
    setError(null);
    setFieldErrors({});
    setForm(
      product
        ? {
            id: product.id,
            name: product.name,
            rangeId: product.rangeId ?? "",
            ean: product.ean ?? "",
            cip13: product.cip13 ?? "",
            packaging: product.packaging ?? "",
            proPrice: product.proPriceCents === null ? "" : centsToInput(product.proPriceCents),
            publicPrice: product.publicPriceCents === null ? "" : centsToInput(product.publicPriceCents),
            externalRef: product.externalRef ?? "",
            isActive: product.isActive,
          }
        : { id: null, name: "", rangeId: rangeId ?? "", ean: "", cip13: "", packaging: "", proPrice: "", publicPrice: "", externalRef: "", isActive: true },
    );
  };

  const submit = () => {
    if (!form) return;
    setError(null);
    setFieldErrors({});
    start(async () => {
      const result = await savePartnerProductAction({ brandId, ...form });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "Produit enregistré." });
      setForm(null);
      router.refresh();
    });
  };

  const toggle = (product: CatalogProduct) => {
    setBusy(product.id);
    start(async () => {
      const result = await setPartnerProductActiveAction({ brandId, id: product.id, isActive: !product.isActive });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré.") : result.error });
      setBusy(null);
      router.refresh();
    });
  };

  const remove = () => {
    if (!deleting) return;
    start(async () => {
      const result = await deletePartnerProductAction({ brandId, id: deleting.id });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Supprimé.") : result.error });
      setDeleting(null);
      router.refresh();
    });
  };

  const runImport = (apply: boolean) => {
    setImportError(null);
    start(async () => {
      const result = await importPartnerCatalogAction({ brandId, text: importText, apply });
      if (!result.ok) {
        setImportError(result.error);
        return;
      }
      setReport(result.data);
      if (result.data.applied) {
        push({ tone: "success", title: result.message ?? "Catalogue importé." });
        router.refresh();
      }
    });
  };

  const closeImport = () => {
    setImportOpen(false);
    setImportText("");
    setReport(null);
    setImportError(null);
  };

  const groups = [
    ...ranges.map((range) => ({ key: range.id, title: range.name, status: range.status as PublicationStatus | null, items: products.filter((product) => product.rangeId === range.id) })),
    { key: "none", title: "Sans gamme", status: null, items: products.filter((product) => !product.rangeId || !ranges.some((range) => range.id === product.rangeId)) },
  ].filter((group) => group.key !== "none" || group.items.length > 0);

  const actions = (product: CatalogProduct) => (
    <div className="flex flex-wrap gap-1.5">
      <Button size="sm" variant="outline" leadingIcon={<Pencil className="size-3.5" />} onClick={() => open(product)}>
        Modifier
      </Button>
      <Button size="sm" variant="ghost" loading={pending && busy === product.id} leadingIcon={product.isActive ? <Archive className="size-3.5" /> : <RotateCcw className="size-3.5" />} onClick={() => toggle(product)}>
        {product.isActive ? "Désactiver" : "Réactiver"}
      </Button>
      {product.orderLines === 0 && (
        <Button size="sm" variant="ghost" leadingIcon={<Trash2 className="size-3.5" />} onClick={() => setDeleting(product)}>
          Supprimer
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-text-secondary">
          {products.length === 0 ? "Aucun produit." : `${products.length} produit${products.length > 1 ? "s" : ""} · ${products.filter((product) => product.isActive).length} actif${products.filter((product) => product.isActive).length > 1 ? "s" : ""}`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" leadingIcon={<Upload className="size-4" />} onClick={() => setImportOpen(true)}>
            Importer un CSV
          </Button>
          <Button leadingIcon={<Plus className="size-4" />} onClick={() => open(null)}>
            Ajouter un produit
          </Button>
        </div>
      </div>

      {products.length === 0 && (
        <Card>
          <EmptyState icon={<Package className="size-5" />} title="Catalogue vide" description="Ajoutez les produits un par un, ou collez l'export CSV fourni par le partenaire." />
        </Card>
      )}

      {groups.map((group) => (
        <Card key={group.key}>
          <CardHeader
            title={
              <span className="flex flex-wrap items-center gap-2">
                {group.title}
                {group.status && <PublicationBadge status={group.status} />}
              </span>
            }
            description={`${group.items.length} produit${group.items.length > 1 ? "s" : ""}`}
            action={
              group.key !== "none" ? (
                <Button size="sm" variant="ghost" leadingIcon={<Plus className="size-3.5" />} onClick={() => open(null, group.key)}>
                  Produit
                </Button>
              ) : undefined
            }
          />
          {group.items.length > 0 && (
            <CardContent>
              <ul className="space-y-2.5 md:hidden">
                {group.items.map((product) => (
                  <li key={product.id} className={product.isActive ? "space-y-1.5 rounded-lg border border-border-subtle p-3" : "space-y-1.5 rounded-lg border border-border-subtle p-3 opacity-70"}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 text-[13.5px] font-medium break-words text-text-primary">{product.name}</p>
                      {!product.isActive && <Badge tone="neutral">Inactif</Badge>}
                    </div>
                    <p className="font-mono text-[12px] break-all text-text-tertiary">{[product.ean && `EAN ${product.ean}`, product.cip13 && `CIP ${product.cip13}`, product.externalRef && `Réf. ${product.externalRef}`].filter(Boolean).join(" · ") || "Sans code"}</p>
                    <p className="text-[12.5px] text-text-secondary">
                      {product.packaging ?? "—"} · pro HT {price(product.proPriceCents)} · public conseillé {price(product.publicPriceCents)}
                    </p>
                    {product.orderLines > 0 && <p className="text-[12px] text-text-tertiary">Commandé ({product.orderLines} ligne{product.orderLines > 1 ? "s" : ""}) : ne se supprime plus.</p>}
                    {actions(product)}
                  </li>
                ))}
              </ul>
              <TableWrapper className="hidden md:block">
                <Table>
                  <THead>
                    <TR>
                      <TH>Produit</TH>
                      <TH>EAN · CIP13</TH>
                      <TH>Conditionnement</TH>
                      <TH numeric>Prix pro HT</TH>
                      <TH numeric>Public conseillé</TH>
                      <TH>Réf. partenaire</TH>
                      <TH>État</TH>
                      <TH />
                    </TR>
                  </THead>
                  <TBody>
                    {group.items.map((product) => (
                      <TR key={product.id} className={product.isActive ? undefined : "opacity-70"}>
                        <TD className="max-w-[260px]">
                          <span className="block truncate text-[13px] font-medium" title={product.name}>
                            {product.name}
                          </span>
                          {product.orderLines > 0 && <span className="block text-[11.5px] text-text-tertiary">commandé · {product.orderLines} ligne{product.orderLines > 1 ? "s" : ""}</span>}
                        </TD>
                        <TD className="font-mono text-[12px] text-text-secondary">
                          <span className="block">{product.ean ?? "—"}</span>
                          {product.cip13 && <span className="block">{product.cip13}</span>}
                        </TD>
                        <TD className="text-[12.5px] text-text-secondary">{product.packaging ?? "—"}</TD>
                        <TD numeric>{price(product.proPriceCents)}</TD>
                        <TD numeric>{price(product.publicPriceCents)}</TD>
                        <TD className="text-[12.5px] text-text-secondary">{product.externalRef ?? "—"}</TD>
                        <TD>{product.isActive ? <Badge tone="success">Actif</Badge> : <Badge tone="neutral">Inactif</Badge>}</TD>
                        <TD>{actions(product)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>
            </CardContent>
          )}
        </Card>
      ))}

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? "Modifier le produit" : "Nouveau produit"}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setForm(null)}>
              Annuler
            </Button>
            <Button loading={pending} onClick={submit}>
              Enregistrer
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            {error && <Alert tone="danger">{error}</Alert>}
            <Field label="Nom" htmlFor="product-name" required error={fieldErrors.name}>
              <Input id="product-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={300} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Gamme" htmlFor="product-range" error={fieldErrors.rangeId}>
                <Select id="product-range" value={form.rangeId} onChange={(event) => setForm({ ...form, rangeId: event.target.value })}>
                  <option value="">Sans gamme</option>
                  {ranges.map((range) => (
                    <option key={range.id} value={range.id}>
                      {range.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Conditionnement" htmlFor="product-packaging" error={fieldErrors.packaging}>
                <Input id="product-packaging" value={form.packaging} onChange={(event) => setForm({ ...form, packaging: event.target.value })} placeholder="Tube 50 ml" maxLength={200} />
              </Field>
              <Field label="EAN" htmlFor="product-ean" hint="13 chiffres." error={fieldErrors.ean}>
                <Input id="product-ean" inputMode="numeric" value={form.ean} onChange={(event) => setForm({ ...form, ean: event.target.value })} maxLength={20} />
              </Field>
              <Field label="CIP13" htmlFor="product-cip" hint="Facultatif, commence par 34009." error={fieldErrors.cip13}>
                <Input id="product-cip" inputMode="numeric" value={form.cip13} onChange={(event) => setForm({ ...form, cip13: event.target.value })} maxLength={20} />
              </Field>
              <Field label="Prix pro HT (€)" htmlFor="product-pro" error={fieldErrors.proPrice}>
                <Input id="product-pro" inputMode="decimal" value={form.proPrice} onChange={(event) => setForm({ ...form, proPrice: event.target.value })} placeholder="12,90" />
              </Field>
              <Field label="Prix public conseillé (€ TTC)" htmlFor="product-public" error={fieldErrors.publicPrice}>
                <Input id="product-public" inputMode="decimal" value={form.publicPrice} onChange={(event) => setForm({ ...form, publicPrice: event.target.value })} placeholder="19,90" />
              </Field>
              <Field label="Référence partenaire" htmlFor="product-ref" error={fieldErrors.externalRef}>
                <Input id="product-ref" value={form.externalRef} onChange={(event) => setForm({ ...form, externalRef: event.target.value })} maxLength={200} />
              </Field>
            </div>
            <Checkbox id="product-active" label="Actif" description="Un produit inactif reste en base mais n'est plus proposé aux officines." checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
          </div>
        )}
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Supprimer le produit ?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Annuler
            </Button>
            <Button variant="danger" loading={pending} onClick={remove}>
              Supprimer
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] leading-5 text-text-secondary">« {deleting?.name} » n&apos;a jamais été commandé : il sera supprimé définitivement du catalogue central.</p>
      </Modal>

      <Modal
        open={importOpen}
        onClose={closeImport}
        title="Importer un catalogue (CSV)"
        description="Collez l'en-tête puis les lignes, séparées par des points-virgules, des virgules ou des tabulations."
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={closeImport}>
              Fermer
            </Button>
            {report && !report.applied && report.creates + report.updates > 0 ? (
              <Button loading={pending} onClick={() => runImport(true)}>
                Importer {report.creates + report.updates} ligne{report.creates + report.updates > 1 ? "s" : ""} valide{report.creates + report.updates > 1 ? "s" : ""}
              </Button>
            ) : (
              <Button loading={pending} disabled={!importText.trim() || Boolean(report?.applied)} onClick={() => runImport(false)}>
                Vérifier
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <details className="rounded-lg border border-border-subtle p-3 text-[12.5px]">
            <summary className="cursor-pointer font-medium text-text-primary">Colonnes reconnues</summary>
            <ul className="mt-2 space-y-1 text-text-secondary">
              {CATALOG_IMPORT_COLUMNS.map((column) => (
                <li key={column.field}>
                  <code className="font-mono text-text-primary">{column.header}</code>
                  {column.required && <span className="text-danger-600"> *</span>} — {column.hint}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-text-tertiary">
              Un produit existant (même EAN, sinon même CIP13, sinon même référence) est mis à jour, sur les seules colonnes présentes ; les autres lignes créent des produits. Une ligne en erreur n&apos;est jamais importée ni complétée. {CATALOG_IMPORT_MAX_ROWS} lignes au plus par import.
            </p>
          </details>
          <Field label="Texte CSV" htmlFor="import-text">
            <Textarea
              id="import-text"
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value);
                setReport(null);
              }}
              rows={10}
              className="font-mono text-[12.5px]"
              placeholder={"nom;gamme;ean;conditionnement;prix_pro_ht;prix_public_conseille;reference"}
              spellCheck={false}
            />
          </Field>
          {importError && <Alert tone="danger">{importError}</Alert>}
          {report && (
            <div className="space-y-3">
              <Alert tone={report.applied ? "success" : report.errors.length > 0 ? "warning" : "info"} title={report.applied ? "Import terminé" : "Vérification"}>
                {report.dataLines} ligne{report.dataLines > 1 ? "s" : ""} lue{report.dataLines > 1 ? "s" : ""} : {report.creates} à créer, {report.updates} à mettre à jour, {report.errors.length} erreur{report.errors.length > 1 ? "s" : ""}
                {report.applied ? " — les lignes valides sont enregistrées." : report.creates + report.updates > 0 ? ". Rien n'est encore écrit." : "."}
                {report.ignoredColumns.length > 0 && <span className="block">Colonnes ignorées : {report.ignoredColumns.join(", ")}.</span>}
              </Alert>
              {report.errors.length > 0 && (
                <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-border-subtle p-3 text-[12.5px]">
                  {report.errors.map((item, index) => (
                    <li key={index} className="text-text-secondary">
                      <span className="font-medium text-text-primary">{item.line === null ? "Texte" : `Ligne ${item.line}`}</span>
                      {item.column && <span className="text-text-tertiary"> · {item.column}</span>} : {item.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
