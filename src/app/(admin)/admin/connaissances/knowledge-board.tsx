"use client";

import { useRef, useState, useTransition } from "react";
import { Check, FileText, Loader2, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { decideKnowledgeProposalAction, deleteKnowledgeDocumentAction, depositKnowledgeAction, reanalyseKnowledgeAction, resolveKnowledgeProductAction } from "@/server/actions/admin-knowledge";
import type { KnowledgeDocumentView, KnowledgeProposalView, StoredAssociation } from "@/server/services/knowledge-types";
import type { CustomRuleDefinition } from "@/core/ai/central-advice";
import { PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { SearchField } from "../conseils/advice-control";

export type ProposalCard = Omit<KnowledgeProposalView, "decidedAt"> & { decidedAt: string | null };
export type DocumentCard = Omit<KnowledgeDocumentView, "analysedAt" | "createdAt" | "proposals"> & { analysedAt: string | null; createdAt: string; proposals: ProposalCard[] };

type KnownProduct = { ean: string; name: string; brand: string | null };

const SOURCES: { name: string; state: "LIVE" | "AFTER" | "OFF"; text: string }[] = [
  { name: "Le modèle d'Anthropic", state: "LIVE", text: "Il classe les médicaments d'une vente (famille, code ATC) et lit vos documents ici pour vous proposer des conseils. Il ne décide de rien et n'écrit jamais ce qui est dit au patient." },
  { name: "La base publique des médicaments", state: "LIVE", text: "Le catalogue officiel (BDPM / ANSM) : noms, substances, présentations, conditions de délivrance." },
  { name: "Le stock de chaque pharmacie", state: "LIVE", text: "Un conseil n'est proposé que pour un produit que la pharmacie a en rayon." },
  { name: "Vos règles et associations", state: "LIVE", text: "Écrites dans « Conseils & associations » : en ligne dans toutes les pharmacies." },
  { name: "Vos documents déposés ici", state: "AFTER", text: "Ils ne deviennent des conseils qu'après votre acceptation, proposition par proposition." },
  { name: "Vidal", state: "OFF", text: "Pas branché à ce jour : c'est une base sous licence payante, avec un accès qu'il faut souscrire. Tant qu'il ne l'est pas, rien n'est lu dedans." },
];

const STATE_LABEL = { LIVE: "Branché", AFTER: "Après votre accord", OFF: "Pas branché" } as const;
const STATE_TONE = { LIVE: "success", AFTER: "info", OFF: "neutral" } as const;

/**
 * La base de connaissances. Le chemin : déposer → le modèle lit et propose (avec la phrase du document qui justifie chaque
 * proposition, vérifiée mot à mot) → la pharmacienne accepte ou refuse. Rien ne devient un conseil sans son clic.
 */
export function KnowledgeBoard({ documents, readerAvailable }: { documents: DocumentCard[]; readerAvailable: boolean }) {
  const pendingTotal = documents.reduce((sum, doc) => sum + doc.proposals.filter((p) => p.status === "PENDING").length, 0);
  return (
    <div className="space-y-6">
      <Alert tone="info" title="Comment ça marche">
        Vous déposez un document (PDF, Excel, CSV ou texte) ou vous écrivez une note. Le logiciel la fait lire par le modèle d&apos;Anthropic, qui <strong>propose</strong> des conseils et des associations,
        chacun avec <strong>la phrase exacte de votre document</strong> qui le justifie. Le logiciel vérifie que cette phrase existe vraiment, écarte ce qui ne tient pas, puis c&apos;est vous qui acceptez ou refusez.
        Ce que vous acceptez est en ligne dans toutes les pharmacies, à la vente suivante. Les documents sont lus dans PharmaBoost : ils ne sont envoyés à personne d&apos;autre, et ne doivent contenir aucune donnée de patient.
      </Alert>

      {!readerAvailable && (
        <Alert tone="warning" title="La lecture automatique n'est pas branchée ici">
          Vous pouvez déposer des documents, mais le modèle ne pourra pas les lire sur cet environnement.
        </Alert>
      )}

      <DepositForm />

      <section aria-labelledby="docs" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="docs" className="text-[15px] font-semibold text-text-primary">
            Vos documents
          </h2>
          {pendingTotal > 0 && <Badge tone="warning">{pendingTotal} proposition{pendingTotal > 1 ? "s" : ""} à relire</Badge>}
        </div>
        {documents.length === 0 ? (
          <EmptyState title="Aucun document pour l'instant" description="Déposez le premier : une liste d'associations, une fiche de conseils, une note importante." />
        ) : (
          documents.map((doc) => <DocumentItem key={doc.id} doc={doc} />)
        )}
      </section>

      <section aria-labelledby="sources" className="space-y-3">
        <h2 id="sources" className="text-[15px] font-semibold text-text-primary">
          Ce que PharmaBoost lit pour conseiller
        </h2>
        <Card>
          <CardContent>
            <ul className="divide-y divide-border-subtle">
              {SOURCES.map((source) => (
                <li key={source.name} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4">
                  <div className="flex shrink-0 items-center gap-2 sm:w-64">
                    <span className="text-[13.5px] font-medium text-text-primary">{source.name}</span>
                    <Badge tone={STATE_TONE[source.state]}>{STATE_LABEL[source.state]}</Badge>
                  </div>
                  <p className="text-[13px] text-text-secondary">{source.text}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function DepositForm() {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { push } = useToast();

  const submit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await depositKnowledgeAction(formData);
      if (!result.ok) {
        setError(result.error);
        push({ tone: "error", title: result.error });
        return;
      }
      push({ tone: result.data.analysis === "FAILED" ? "warning" : "success", title: result.message ?? "Document déposé" });
      if (result.data.truncated) push({ tone: "warning", title: "Document très long : seul le début a été lu." });
      formRef.current?.reset();
      setFileName("");
      setText("");
    });
  };

  return (
    <Card>
      <CardContent>
        <form ref={formRef} action={submit} className="space-y-4">
          <h2 className="text-[15px] font-semibold text-text-primary">Déposer un document ou écrire une note</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <Field label="Titre" htmlFor="kb-title" hint="Si vous déposez un fichier, son nom est repris quand vous laissez vide.">
                <Input id="kb-title" name="title" maxLength={120} placeholder="Ex. Associations de l'automne 2026" />
              </Field>
              <Field label="Ce qu'il faut savoir sur ce document (facultatif)" htmlFor="kb-note" hint="Le contexte, les limites : « valable pour l'adulte », « liste à jour en septembre »…">
                <Textarea id="kb-note" name="note" maxLength={600} className="min-h-20" />
              </Field>
            </div>
            <div className="space-y-4">
              <Field label="Un fichier" htmlFor="kb-file" hint="PDF avec du texte, Excel, CSV ou texte — 8 Mo au plus. Un PDF scanné (une image) ne peut pas être lu.">
                <label htmlFor="kb-file" className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border-default bg-surface-sunken px-4 py-3 text-[13.5px] text-text-secondary hover:border-brand-400">
                  <Upload className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 truncate">{fileName || "Choisir un fichier…"}</span>
                </label>
                <input id="kb-file" name="file" type="file" accept=".pdf,.xlsx,.xls,.csv,.tsv,.txt,.md" className="sr-only" onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")} />
              </Field>
              <Field label="Ou un texte écrit ici" htmlFor="kb-text" hint="Une règle, une association, une consigne : une phrase complète par idée.">
                <Textarea id="kb-text" name="text" value={text} onChange={(event) => setText(event.target.value)} className="min-h-28" placeholder="Ex. Sous antibiotique, conseiller un probiotique pour protéger la flore intestinale." />
              </Field>
            </div>
          </div>
          {error && <p className="text-[13px] text-danger-600" role="alert">{error}</p>}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileText className="size-4" aria-hidden />}
              {pending ? "Lecture en cours…" : "Déposer et faire lire"}
            </Button>
            {pending && <span className="text-[12.5px] text-text-tertiary">Cela peut durer une demi-minute pour un long document.</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function DocumentItem({ doc }: { doc: DocumentCard }) {
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { push } = useToast();
  const toastResult = (result: { ok: boolean; message?: string; error?: string }) => push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Fait") : (result.error ?? "Erreur") });
  const pendingProposals = doc.proposals.filter((p) => p.status === "PENDING");
  const decided = doc.proposals.filter((p) => p.status !== "PENDING");

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold text-text-primary">
              {doc.title}
              <Badge tone={doc.status === "ANALYSED" ? "success" : doc.status === "FAILED" ? "danger" : "neutral"}>{doc.status === "ANALYSED" ? "Lu" : doc.status === "FAILED" ? "Lecture impossible" : "Déposé"}</Badge>
            </h3>
            <p className="text-[12.5px] text-text-tertiary">
              {doc.sourceType === "FILE" ? (doc.fileName ?? "Fichier") : "Texte écrit dans la console"} · déposé le {formatDate(doc.createdAt)}
              {doc.createdByName ? ` par ${doc.createdByName}` : ""}
            </p>
            {doc.note && <p className="mt-1 text-[13px] text-text-secondary">{doc.note}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => startTransition(async () => toastResult(await reanalyseKnowledgeAction({ id: doc.id })))}
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RotateCcw className="size-3.5" aria-hidden />}
              Relire
            </Button>
            {confirmDelete ? (
              <>
                <Button variant="danger" size="sm" disabled={pending} onClick={() => startTransition(async () => toastResult(await deleteKnowledgeDocumentAction({ id: doc.id })))}>
                  Confirmer la suppression
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Annuler
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} aria-label={`Supprimer ${doc.title}`}>
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            )}
          </div>
        </div>

        {doc.analysisError && <Alert tone="danger" title="Le modèle n'a pas pu lire ce document">{doc.analysisError}</Alert>}

        {doc.status === "ANALYSED" && doc.proposals.length === 0 && (
          <p className="rounded-lg bg-surface-sunken px-4 py-3 text-[13px] text-text-secondary">
            Rien n&apos;en a été tiré : le document ne contient pas de conseil ou d&apos;association écrit noir sur blanc{doc.discardedCount > 0 ? `, et ${doc.discardedCount} proposition${doc.discardedCount > 1 ? "s ont été écartées" : " a été écartée"} faute de preuve dans le texte` : ""}.
          </p>
        )}

        {pendingProposals.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-[13px] font-semibold text-text-primary">À relire ({pendingProposals.length})</h4>
            {pendingProposals.map((proposal) => (
              <ProposalItem key={proposal.id} proposal={proposal} />
            ))}
          </div>
        )}

        {decided.length > 0 && (
          <details className="text-[13px]">
            <summary className="cursor-pointer text-text-secondary">Déjà tranchées ({decided.length})</summary>
            <ul className="mt-2 space-y-1">
              {decided.map((proposal) => (
                <li key={proposal.id} className="flex flex-wrap items-center gap-2 text-text-secondary">
                  <Badge tone={proposal.status === "ACCEPTED" ? "success" : "neutral"}>{proposal.status === "ACCEPTED" ? "Accepté" : "Refusé"}</Badge>
                  <span>{proposal.title}</span>
                  {proposal.decidedByName && <span className="text-text-tertiary">· {proposal.decidedByName}, {formatDate(proposal.decidedAt)}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}

        {doc.status === "ANALYSED" && doc.discardedCount > 0 && doc.proposals.length > 0 && (
          <p className="text-[12px] text-text-tertiary">{doc.discardedCount} autre{doc.discardedCount > 1 ? "s" : ""} proposition{doc.discardedCount > 1 ? "s ont été écartées" : " a été écartée"} par le logiciel : citation introuvable dans le document, ou non conforme aux règles.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ProposalItem({ proposal }: { proposal: ProposalCard }) {
  const [pending, startTransition] = useTransition();
  const [association, setAssociation] = useState(proposal.kind === "ASSOCIATION" ? (proposal.payload as StoredAssociation) : null);
  const { push } = useToast();
  const rule = proposal.kind === "RULE" ? (proposal.payload as CustomRuleDefinition) : null;
  const problem = association && ((association.triggerKind === "PRODUCT" && !association.triggerEan) || !association.adviceEan) ? proposal.problem ?? "À compléter." : null;

  const decide = (decision: "ACCEPT" | "REJECT") =>
    startTransition(async () => {
      const result = await decideKnowledgeProposalAction({ id: proposal.id, decision });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Fait") : result.error });
    });

  const choose = (which: "trigger" | "advice", product: KnownProduct | null) => {
    if (!product || !association) return;
    startTransition(async () => {
      const result = await resolveKnowledgeProductAction({ id: proposal.id, which, ean: product.ean, name: product.name });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? "Produit choisi" : result.error });
      if (result.ok) setAssociation(which === "trigger" ? { ...association, triggerEan: product.ean, triggerResolvedName: product.name } : { ...association, adviceEan: product.ean, adviceResolvedName: product.name });
    });
  };

  return (
    <div className="space-y-3 rounded-xl border border-border-subtle bg-surface-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">{proposal.kind === "RULE" ? "Conseil" : "Association"}</Badge>
        <p className="text-[14px] font-semibold text-text-primary">{proposal.title}</p>
      </div>

      <blockquote className="border-l-2 border-brand-400 pl-3 text-[13px] text-text-secondary">
        <span className="block text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">Ce que dit votre document</span>« {proposal.quote} »
      </blockquote>

      {rule && (
        <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
          <Row label="Type" value={rule.kind === "TOLERANCE" ? "Tolérance" : "Confort"} />
          <Row label="Pour les médicaments" value={[...rule.atcPrefixes, ...rule.therapeuticClasses].join(" · ")} hint="À vérifier" />
          <Row label="Produit conseillé" value={`${PRODUCT_CATEGORY_LABELS[rule.category as keyof typeof PRODUCT_CATEGORY_LABELS] ?? rule.category} · ${rule.matchingTags.join(", ")}`} />
          <Row label="Raison" value={rule.shortReason} />
          <Row label="Ce que dit le pharmacien" value={rule.counterScript} wide />
        </dl>
      )}

      {association && (
        <div className="space-y-3 text-[13px]">
          <p className="text-text-secondary">
            <strong className="text-text-primary">{association.triggerResolvedName ?? association.triggerName}</strong>
            {association.triggerKind === "MEDICINE" ? " (médicament)" : " (produit)"} appelle <strong className="text-text-primary">{association.adviceResolvedName ?? association.adviceName}</strong>
            {association.sentence ? <> — « {association.sentence} »</> : null}
          </p>
          {association.triggerKind === "PRODUCT" && !association.triggerEan && (
            <SearchField<KnownProduct> label={`Produit déclencheur : « ${association.triggerName} »`} endpoint="/api/admin/conseils/produits" minLength={2} placeholder="Nom, marque ou code-barres…" value={null} onChange={(product) => choose("trigger", product)} keyOf={(item) => item.ean} title={(item) => item.name} subtitle={(item) => [item.brand, item.ean].filter(Boolean).join(" · ")} />
          )}
          {!association.adviceEan && (
            <SearchField<KnownProduct> label={`Produit conseillé : « ${association.adviceName} »`} endpoint="/api/admin/conseils/produits" minLength={2} placeholder="Nom, marque ou code-barres…" value={null} onChange={(product) => choose("advice", product)} keyOf={(item) => item.ean} title={(item) => item.name} subtitle={(item) => [item.brand, item.ean].filter(Boolean).join(" · ")} />
          )}
          {problem && <p className="text-[12.5px] text-warning-700 dark:text-warning-500">{problem}</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button variant="success" size="sm" disabled={pending || Boolean(problem)} onClick={() => decide("ACCEPT")}>
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
          Accepter — en ligne dans toutes les pharmacies
        </Button>
        <Button variant="outline" size="sm" disabled={pending} onClick={() => decide("REJECT")}>
          <X className="size-3.5" aria-hidden />
          Refuser
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, hint, wide }: { label: string; value: string; hint?: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">
        {label}
        {hint && <span className="ml-1.5 font-normal text-warning-700 normal-case dark:text-warning-500">{hint}</span>}
      </dt>
      <dd className="text-text-primary">{value || "—"}</dd>
    </div>
  );
}
