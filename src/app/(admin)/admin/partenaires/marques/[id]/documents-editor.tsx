"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ExternalLink, FileText, Pencil, Plus, RotateCcw } from "lucide-react";
import { savePartnerDocumentAction, setPartnerDocumentActiveAction } from "@/server/actions/platform-partner-brands";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

/** Types de documents professionnels proposés. Un type inconnu (saisi ailleurs) s'affiche tel quel. */
const DOCUMENT_KINDS: { key: string; label: string }[] = [
  { key: "DOCUMENT", label: "Document" },
  { key: "FICHE_PRODUIT", label: "Fiche produit" },
  { key: "CATALOGUE", label: "Catalogue" },
  { key: "FORMATION", label: "Formation" },
  { key: "ARGUMENTAIRE", label: "Argumentaire" },
  { key: "REGLEMENTAIRE", label: "Document réglementaire" },
];

const kindLabel = (key: string) => DOCUMENT_KINDS.find((kind) => kind.key === key)?.label ?? key;

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export type DocumentRow = { id: string; title: string; kind: string; url: string; isActive: boolean };

type DocumentForm = { id: string | null; title: string; kind: string; url: string };

/** Documentation professionnelle : un lien vers la source publiée par la marque, jamais une copie. */
export function DocumentsCard({ brandId, documents }: { brandId: string; documents: DocumentRow[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [form, setForm] = useState<DocumentForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const open = (document: DocumentRow | null) => {
    setError(null);
    setFieldErrors({});
    setForm(document ? { id: document.id, title: document.title, kind: document.kind, url: document.url } : { id: null, title: "", kind: "DOCUMENT", url: "" });
  };

  const submit = () => {
    if (!form) return;
    setError(null);
    setFieldErrors({});
    start(async () => {
      const result = await savePartnerDocumentAction({ brandId, ...form });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "Document enregistré." });
      setForm(null);
      router.refresh();
    });
  };

  const toggle = (document: DocumentRow) => {
    setBusy(document.id);
    start(async () => {
      const result = await setPartnerDocumentActiveAction({ brandId, id: document.id, isActive: !document.isActive });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré.") : result.error });
      setBusy(null);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader
        title="Documents professionnels"
        description="Fiches, catalogues, argumentaires : des liens https vers la source publiée par la marque."
        action={
          <Button size="sm" variant="outline" leadingIcon={<Plus className="size-4" />} onClick={() => open(null)}>
            Ajouter
          </Button>
        }
      />
      <CardContent>
        {documents.length === 0 ? (
          <EmptyState icon={<FileText className="size-5" />} title="Aucun document" description="Ajoutez les liens vers la documentation professionnelle fournie par la marque." className="py-8" />
        ) : (
          <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {documents.map((document) => (
              <li key={document.id} className={document.isActive ? "space-y-1.5 p-3.5" : "space-y-1.5 p-3.5 opacity-70"}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{kindLabel(document.kind)}</Badge>
                  {!document.isActive && <Badge tone="warning">Retiré</Badge>}
                </div>
                <p className="text-[14px] font-medium break-words text-text-primary">{document.title}</p>
                <p className="truncate text-[12px] text-text-tertiary" title={document.url}>
                  {host(document.url)}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <Button size="sm" variant="outline" leadingIcon={<Pencil className="size-3.5" />} onClick={() => open(document)}>
                    Modifier
                  </Button>
                  <Button asChild size="sm" variant="ghost" leadingIcon={<ExternalLink className="size-3.5" />}>
                    <a href={document.url} target="_blank" rel="noopener noreferrer">
                      Ouvrir
                    </a>
                  </Button>
                  <Button size="sm" variant="ghost" loading={pending && busy === document.id} leadingIcon={document.isActive ? <Archive className="size-3.5" /> : <RotateCcw className="size-3.5" />} onClick={() => toggle(document)}>
                    {document.isActive ? "Retirer" : "Remettre"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? "Modifier le document" : "Nouveau document"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setForm(null)}>
              Annuler
            </Button>
            <Button loading={pending && busy === null} onClick={submit}>
              Enregistrer
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            {error && <Alert tone="danger">{error}</Alert>}
            <Field label="Titre" htmlFor="doc-title" required error={fieldErrors.title}>
              <Input id="doc-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={200} />
            </Field>
            <Field label="Type" htmlFor="doc-kind" error={fieldErrors.kind}>
              <Select id="doc-kind" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
                {DOCUMENT_KINDS.map((kind) => (
                  <option key={kind.key} value={kind.key}>
                    {kind.label}
                  </option>
                ))}
                {!DOCUMENT_KINDS.some((kind) => kind.key === form.kind) && <option value={form.kind}>{form.kind}</option>}
              </Select>
            </Field>
            <Field label="Adresse" htmlFor="doc-url" required hint="https:// uniquement, publiée par la marque." error={fieldErrors.url}>
              <Input id="doc-url" type="url" inputMode="url" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://" />
            </Field>
          </div>
        )}
      </Modal>
    </Card>
  );
}
