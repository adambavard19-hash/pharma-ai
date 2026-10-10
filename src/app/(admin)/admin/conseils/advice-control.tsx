"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { ArrowRight, Check, ChevronDown, Loader2, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { addCentralAssociationAction, addCentralRuleAction, decideCentralAssociationAction, decideCentralRuleAction } from "@/server/actions/admin-central-advice";
import type { CentralAssociationView, CentralRuleView } from "@/server/services/central-advice";
import { CENTRAL_STATUS_LABELS, CUSTOM_KINDS, CUSTOM_KIND_LABELS, CUSTOM_LIMITS, type CentralStatus } from "@/core/ai/central-advice-constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { StatCard } from "@/components/ui/stat-card";
import type { VigilanceView } from "@/core/ai/vigilance-catalog";
import { AvoidList } from "./avoid-list";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type RuleCard = Omit<CentralRuleView, "decidedAt"> & { decidedAt: string | null };
export type AssociationCard = Omit<CentralAssociationView, "decidedAt" | "createdAt"> & { decidedAt: string | null; createdAt: string };

type Section = "RULES" | "ASSOCIATIONS" | "AVOID";
type Filter = CentralStatus | "ALL";
type Decision = "VALIDATE" | "REMOVE" | "RESTORE";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ACTIVE", label: "À relire" },
  { key: "VALIDATED", label: "Validés" },
  { key: "REMOVED", label: "Supprimés" },
  { key: "ALL", label: "Tous" },
];

const TONES: Record<CentralStatus, "warning" | "success" | "danger"> = { ACTIVE: "warning", VALIDATED: "success", REMOVED: "danger" };

/**
 * Le centre de contrôle des conseils : les règles, les conseils ajoutés et les associations, au même endroit.
 *
 * Chaque geste vaut pour toutes les pharmacies, tout de suite : valider note l'accord de la pharmacienne, supprimer retire le
 * conseil de PharmaBoost partout (on peut le rétablir), ajouter le met en ligne partout. Un conseil non relu parle déjà : il
 * est simplement « à relire ».
 */
export function AdviceControl({ rules, associations, vigilances, categories, tags }: { rules: RuleCard[]; associations: AssociationCard[]; vigilances: VigilanceView[]; categories: { code: string; label: string }[]; tags: string[] }) {
  const [section, setSection] = useState<Section>("RULES");
  const [filter, setFilter] = useState<Filter>("ACTIVE");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<"RULE" | "ASSOCIATION" | null>(null);

  const all = section === "ASSOCIATIONS" ? associations : rules;
  const count = (status: CentralStatus) => all.filter((item) => item.status === status).length;
  const total = (status: CentralStatus) => rules.filter((item) => item.status === status).length + associations.filter((item) => item.status === status).length;
  const text = query.trim().toLowerCase();

  const shownRules = useMemo(
    () => rules.filter((rule) => (filter === "ALL" || rule.status === filter) && (!text || `${rule.title} ${rule.when} ${rule.proposes} ${rule.script}`.toLowerCase().includes(text))),
    [rules, filter, text],
  );
  const shownAssociations = useMemo(
    () => associations.filter((item) => (filter === "ALL" || item.status === filter) && (!text || `${item.triggerLabel} ${item.adviceLabel} ${item.sentence ?? ""}`.toLowerCase().includes(text))),
    [associations, filter, text],
  );

  return (
    <div className="space-y-6">
      {section !== "AVOID" && (
        <>
        <Alert tone="info" title="Tout est déjà en ligne, dans toutes les pharmacies">
          Les conseils et associations ci-dessous parlent déjà au comptoir de chaque pharmacie, dès l&apos;envoi de son stock : les titulaires n&apos;ont rien à régler. Ici, vous
          <strong> validez</strong> ce que vous cautionnez, vous <strong>supprimez</strong> ce qui ne va pas (le conseil disparaît de PharmaBoost, partout, tout de suite — vous pouvez le rétablir) et vous{" "}
          <strong>ajoutez</strong> les vôtres. Ce qui n&apos;est pas encore relu est simplement marqué « à relire ».
        </Alert>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="À relire" value={total("ACTIVE")} sublabel="en ligne, pas encore relus" />
          <StatCard label="Validés" value={total("VALIDATED")} sublabel="relus et validés" />
          <StatCard label="Supprimés" value={total("REMOVED")} sublabel="retirés de PharmaBoost" />
        </div>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Conseils, associations ou ce qu'il ne faut pas associer" className="inline-flex flex-wrap rounded-lg bg-surface-sunken p-1 text-[13.5px] font-medium">
          {([["RULES", `Conseils (${rules.length})`], ["ASSOCIATIONS", `Associations (${associations.length})`], ["AVOID", `À ne pas associer (${vigilances.length})`]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={section === key}
              onClick={() => setSection(key)}
              className={section === key ? "rounded-md bg-surface-card px-4 py-1.5 text-text-primary shadow-sm" : "rounded-md px-4 py-1.5 text-text-secondary hover:text-text-primary"}
            >
              {label}
            </button>
          ))}
        </div>
        {section !== "AVOID" && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setAdding("RULE")} leadingIcon={<Plus className="size-4" />}>
            Ajouter un conseil
          </Button>
          <Button variant="outline" onClick={() => setAdding("ASSOCIATION")} leadingIcon={<Plus className="size-4" />}>
            Ajouter une association
          </Button>
        </div>
        )}
      </div>

      {section === "AVOID" ? (
        <AvoidList vigilances={vigilances} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div role="group" aria-label="Filtrer par état" className="flex flex-wrap gap-2">
              {FILTERS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={filter === item.key}
                  onClick={() => setFilter(item.key)}
                  className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors", filter === item.key ? "bg-brand-600 text-white" : "bg-surface-sunken text-text-secondary hover:text-text-primary")}
                >
                  {item.label} <span className="tabular-nums opacity-80">{item.key === "ALL" ? all.length : count(item.key)}</span>
                </button>
              ))}
            </div>
            <div className="min-w-56 flex-1 sm:max-w-sm">
              <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher un médicament, un produit…" leadingIcon={<Search className="size-4" />} aria-label="Chercher dans la liste" />
            </div>
          </div>

          {section === "RULES" ? (
            shownRules.length === 0 ? (
              <Empty filter={filter} />
            ) : (
              <ul className="space-y-3">
                {shownRules.map((rule) => (
                  <RuleItem key={rule.id} rule={rule} />
                ))}
              </ul>
            )
          ) : shownAssociations.length === 0 ? (
            <Empty filter={filter} noun="association" />
          ) : (
            <ul className="space-y-3">
              {shownAssociations.map((association) => (
                <AssociationItem key={association.id} association={association} />
              ))}
            </ul>
          )}
        </>
      )}

      <Modal open={adding === "RULE"} onClose={() => setAdding(null)} title="Ajouter un conseil" description="Quand un médicament de ces classes est dans la vente, PharmaBoost propose ce type de produit — dans toutes les pharmacies qui l'ont en stock." size="lg">
        {adding === "RULE" && <NewRuleForm categories={categories} tags={tags} onDone={() => setAdding(null)} />}
      </Modal>
      <Modal open={adding === "ASSOCIATION"} onClose={() => setAdding(null)} title="Ajouter une association" description="Un médicament ou un produit en appelle un autre. Chaque pharmacie ne le propose que si elle a le produit conseillé en stock." size="lg">
        {adding === "ASSOCIATION" && <NewAssociationForm onDone={() => setAdding(null)} />}
      </Modal>
    </div>
  );
}

function Empty({ filter, noun = "conseil" }: { filter: Filter; noun?: string }) {
  return (
    <Card>
      <EmptyState
        title={filter === "ACTIVE" ? `Tout est relu. Merci.` : `Aucun ${noun} dans cette liste`}
        description={filter === "ACTIVE" ? `Il ne reste aucun ${noun} à relire.` : "Changez de filtre pour voir le reste."}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Les gestes : valider, supprimer (avec confirmation), rétablir
// ---------------------------------------------------------------------------------------------------------------

function Decisions({ status, onDecide, pending }: { status: CentralStatus; onDecide: (decision: Decision) => void; pending: boolean }) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-danger-50 px-3 py-2 dark:bg-danger-950/40" role="group" aria-label="Confirmer la suppression">
        <span className="text-[13px] font-medium text-danger-700 dark:text-danger-300">Supprimer pour toutes les pharmacies ?</span>
        <Button size="sm" variant="danger" disabled={pending} onClick={() => onDecide("REMOVE")} leadingIcon={<Trash2 className="size-4" />}>
          Oui, supprimer
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
          Non
        </Button>
      </div>
    );
  }
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {status !== "VALIDATED" && status !== "REMOVED" && (
        <Button size="sm" disabled={pending} onClick={() => onDecide("VALIDATE")} leadingIcon={<Check className="size-4" />}>
          Valider
        </Button>
      )}
      {status !== "REMOVED" && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirming(true)} leadingIcon={<Trash2 className="size-4" />}>
          Supprimer
        </Button>
      )}
      {status === "VALIDATED" && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => onDecide("RESTORE")} leadingIcon={<RotateCcw className="size-4" />}>
          Remettre à relire
        </Button>
      )}
      {status === "REMOVED" && (
        <Button size="sm" disabled={pending} onClick={() => onDecide("RESTORE")} leadingIcon={<RotateCcw className="size-4" />}>
          Rétablir
        </Button>
      )}
    </div>
  );
}

function StatusLine({ status, outdated, decidedBy, decidedAt, extra }: { status: CentralStatus; outdated?: boolean; decidedBy: string | null; decidedAt: string | null; extra?: ReactNode }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Badge tone={TONES[status]}>{CENTRAL_STATUS_LABELS[status]}</Badge>
      {extra}
      {outdated && <Badge tone="warning">Modifiée depuis votre validation</Badge>}
      {decidedAt && (
        <span className="text-[12px] text-text-tertiary">
          {decidedBy ? `${decidedBy} · ` : ""}
          {formatDate(decidedAt)}
        </span>
      )}
    </p>
  );
}

function RuleItem({ rule }: { rule: RuleCard }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const decide = (decision: Decision) =>
    startTransition(async () => {
      const result = await decideCentralRuleAction({ ruleKey: rule.ruleKey, decision });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré") : result.error });
    });

  return (
    <li>
      <Card className={rule.status === "REMOVED" ? "opacity-75" : undefined}>
        <CardContent className="space-y-3.5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h3 className="text-[15px] font-semibold text-text-primary">{rule.title}</h3>
              <StatusLine status={rule.status} outdated={rule.outdated} decidedBy={rule.decidedBy} decidedAt={rule.decidedAt} extra={rule.origin === "ADDED" ? <Badge tone="info">Ajouté par l&apos;équipe</Badge> : undefined} />
            </div>
            <Decisions status={rule.status} onDecide={decide} pending={pending} />
          </div>

          <dl className="grid gap-x-6 gap-y-2.5 text-[13px] leading-5 sm:grid-cols-[9.5rem_1fr]">
            <dt className="font-medium text-text-secondary">Quand elle se déclenche</dt>
            <dd className="text-text-primary">
              Quand le patient prend : {rule.when}
              {rule.sideEffects.length > 0 && <span className="text-text-secondary"> — ou signale : {rule.sideEffects.join(", ")}</span>}
            </dd>
            <dt className="font-medium text-text-secondary">Ce qu&apos;elle propose</dt>
            <dd className="text-text-primary">{rule.proposes}</dd>
            <dt className="font-medium text-text-secondary">Ce que dit le pharmacien</dt>
            <dd className="text-text-primary">« {rule.script} »</dd>
          </dl>

          <FeedbackLine feedback={rule.feedback} />

          <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex items-center gap-1 text-[12.5px] text-text-tertiary hover:text-text-secondary">
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
            Voir le détail (raison affichée, question au patient, précautions, source)
          </button>
          {open && (
            <div className="space-y-2 rounded-lg bg-surface-sunken px-3.5 py-3 text-[12.5px] leading-5 text-text-secondary">
              <p>
                <strong className="text-text-primary">Raison affichée : </strong>
                {rule.reason}
              </p>
              {rule.question && (
                <p>
                  <strong className="text-text-primary">Question au patient : </strong>
                  {rule.question}
                </p>
              )}
              {rule.safetyNotes.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5">
                  {rule.safetyNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
              <p>
                <strong className="text-text-primary">Source : </strong>
                {rule.source}
              </p>
              <p className="text-text-tertiary">
                Version {rule.version} · {rule.origin === "ADDED" ? "ajouté depuis la console" : "règle du moteur"}.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
}

/** Ce que les comptoirs de toutes les pharmacies en disent : une indication pour décider, jamais une décision automatique. */
function FeedbackLine({ feedback }: { feedback: RuleCard["feedback"] }) {
  if (!feedback || feedback.decided === 0) {
    return <p className="text-[12.5px] text-text-tertiary">Pas encore proposée au comptoir : aucun retour des pharmacies.</p>;
  }
  const percent = feedback.retainedRate === null ? null : Math.round(feedback.retainedRate * 100);
  const verdict = {
    WELL_RECEIVED: { tone: "success" as const, label: "Bien accueilli" },
    RARELY_RETAINED: { tone: "warning" as const, label: "Peu retenu" },
    NEUTRAL: { tone: "neutral" as const, label: "Accueil moyen" },
    NOT_ENOUGH_DATA: null,
  }[feedback.verdict];
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-text-secondary">
      {verdict && <Badge tone={verdict.tone}>{verdict.label}</Badge>}
      <span>
        Dans les pharmacies : {feedback.decided} proposé{feedback.decided > 1 ? "s" : ""}, {feedback.retained} retenu{feedback.retained > 1 ? "s" : ""}
        {percent !== null ? ` (${percent} %)` : ""}, {feedback.bought} acheté{feedback.bought > 1 ? "s" : ""} · {feedback.pharmacies} pharmacie{feedback.pharmacies > 1 ? "s" : ""}.
      </span>
      {!verdict && <span className="text-text-tertiary">Pas assez de retours pour juger (il en faut 30 dans au moins 3 pharmacies). Indication seulement : rien ne change tout seul.</span>}
    </p>
  );
}

function AssociationItem({ association }: { association: AssociationCard }) {
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const decide = (decision: Decision) =>
    startTransition(async () => {
      const result = await decideCentralAssociationAction({ id: association.id, decision });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré") : result.error });
    });

  return (
    <li>
      <Card className={association.status === "REMOVED" ? "opacity-75" : undefined}>
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold text-text-primary">
                <span>{association.triggerLabel}</span>
                <ArrowRight className="size-4 shrink-0 text-text-tertiary" aria-label="appelle" />
                <span>{association.adviceLabel}</span>
              </h3>
              <StatusLine status={association.status} decidedBy={association.decidedBy} decidedAt={association.decidedAt} extra={<Badge tone="info">{association.triggerKind === "MEDICINE" ? "Médicament" : "Produit"}</Badge>} />
            </div>
            <Decisions status={association.status} onDecide={decide} pending={pending} />
          </div>
          <p className="text-[13px] leading-5 text-text-primary">{association.sentence ? <>« {association.sentence} »</> : <span className="text-text-tertiary">Aucune phrase : la carte n&apos;affiche que l&apos;association.</span>}</p>
          <p className="text-[12px] text-text-tertiary">
            Ajoutée{association.createdBy ? ` par ${association.createdBy}` : ""} le {formatDate(association.createdAt)} · code-barres du produit conseillé : {association.adviceEan}
          </p>
        </CardContent>
      </Card>
    </li>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Ajouter un conseil
// ---------------------------------------------------------------------------------------------------------------

function NewRuleForm({ categories, tags, onDone }: { categories: { code: string; label: string }[]; tags: string[]; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<(typeof CUSTOM_KINDS)[number]>("COMFORT");
  const [atc, setAtc] = useState("");
  const [classes, setClasses] = useState("");
  const [category, setCategory] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [shortReason, setShortReason] = useState("");
  const [counterScript, setCounterScript] = useState("");
  const [patientReason, setPatientReason] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const split = (value: string) => value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await addCentralRuleAction({
        title,
        kind,
        atcPrefixes: split(atc),
        therapeuticClasses: split(classes),
        category,
        matchingTags: picked,
        question,
        shortReason,
        counterScript,
        patientReason,
        source,
        safetyNotes: notes.split("\n").map((line) => line.trim()).filter(Boolean),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Conseil ajouté" });
      onDone();
    });
  };

  return (
    <div className="space-y-4">
      <Field label="Nom du conseil" htmlFor="rule-title" required>
        <Input id="rule-title" value={title} maxLength={CUSTOM_LIMITS.title} onChange={(event) => setTitle(event.target.value)} placeholder="Par exemple : Bouche sèche sous antidépresseur" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="rule-kind" hint="Un conseil de sécurité s'écrit dans le code, pas ici.">
          <Select id="rule-kind" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
            {CUSTOM_KINDS.map((item) => (
              <option key={item} value={item}>
                {CUSTOM_KIND_LABELS[item]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Catégorie du produit conseillé" htmlFor="rule-category" required>
          <Select id="rule-category" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Choisir…</option>
            {categories.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Codes ATC des médicaments concernés" htmlFor="rule-atc" hint="Séparés par des virgules : J01 (antibiotiques), N02AA… Le début du code suffit.">
          <Input id="rule-atc" value={atc} onChange={(event) => setAtc(event.target.value)} placeholder="J01, R05DA" />
        </Field>
        <Field label="…ou classes thérapeutiques" htmlFor="rule-classes" hint="Facultatif, séparées par des virgules.">
          <Input id="rule-classes" value={classes} onChange={(event) => setClasses(event.target.value)} placeholder="Antidépresseur, Neuroleptique" />
        </Field>
      </div>
      <TagPicker tags={tags} picked={picked} onChange={setPicked} />
      <Field label="Question à poser au patient (facultatif)" htmlFor="rule-question" hint="Posée AVANT de proposer le produit. Vide : aucune question.">
        <Input id="rule-question" value={question} maxLength={CUSTOM_LIMITS.question} onChange={(event) => setQuestion(event.target.value)} />
      </Field>
      <Field label="Pourquoi ce conseil, en une ligne" htmlFor="rule-reason" required hint="{drug} sera remplacé par le médicament. Dites le POURQUOI pour ce traitement, jamais ce que fait le produit.">
        <Input id="rule-reason" value={shortReason} maxLength={CUSTOM_LIMITS.reason} onChange={(event) => setShortReason(event.target.value)} placeholder="Antidépresseur ({drug}) : la bouche sèche est fréquente." />
      </Field>
      <Field label="Ce que dit le pharmacien" htmlFor="rule-script" required hint="{product} sera remplacé par le produit choisi dans le stock (obligatoire) ; {drug} par le médicament.">
        <Textarea id="rule-script" value={counterScript} maxLength={CUSTOM_LIMITS.script} onChange={(event) => setCounterScript(event.target.value)} placeholder="« {drug} assèche souvent la bouche. {product} peut soulager cette gêne. »" />
      </Field>
      <Field label="Ce que lit le patient (facultatif)" htmlFor="rule-patient" hint="Vide : la raison ci-dessus est reprise.">
        <Textarea id="rule-patient" value={patientReason} maxLength={CUSTOM_LIMITS.script} onChange={(event) => setPatientReason(event.target.value)} className="min-h-16" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Source (facultatif)" htmlFor="rule-source" hint="Recommandation, RCP, retour du comptoir…">
          <Input id="rule-source" value={source} maxLength={CUSTOM_LIMITS.source} onChange={(event) => setSource(event.target.value)} />
        </Field>
        <Field label="Précautions (facultatif)" htmlFor="rule-notes" hint="Une par ligne.">
          <Textarea id="rule-notes" value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-16" />
        </Field>
      </div>
      <Alert tone="info" title="Les garde-fous restent les mêmes">
        Le produit n&apos;est jamais proposé en rupture de stock, ni s&apos;il est écarté par la sécurité pour le patient, ni si une règle plus précise s&apos;en charge.
      </Alert>
      {error && (
        <p role="alert" className="text-[13px] text-danger-600">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Annuler
        </Button>
        <Button onClick={submit} loading={pending} leadingIcon={<Plus className="size-4" />}>
          Mettre en ligne
        </Button>
      </div>
    </div>
  );
}

/** Les étiquettes du produit à conseiller, prises dans le vocabulaire que les règles connaissent : on ne peut pas en inventer. */
export function TagPicker({ tags, picked, onChange }: { tags: string[]; picked: string[]; onChange: (next: string[]) => void }) {
  const [filter, setFilter] = useState("");
  const text = filter.trim().toLowerCase();
  const shown = tags.filter((tag) => !picked.includes(tag) && (!text || tag.includes(text))).slice(0, 60);
  return (
    <Field label={`Étiquettes du produit à conseiller (${picked.length}/${CUSTOM_LIMITS.tags})`} required hint="Ce sont les mots que PharmaBoost a reconnus sur les produits du stock. Choisissez ceux qui décrivent le produit.">
      <div className="space-y-2">
        {picked.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {picked.map((tag) => (
              <button key={tag} type="button" onClick={() => onChange(picked.filter((item) => item !== tag))} className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-[12.5px] font-medium text-white" aria-label={`Retirer l'étiquette ${tag}`}>
                {tag}
                <X className="size-3" aria-hidden />
              </button>
            ))}
          </div>
        )}
        <Input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Chercher une étiquette (probiotique, nez, gorge…)" leadingIcon={<Search className="size-4" />} aria-label="Chercher une étiquette" />
        <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border-subtle bg-surface-card p-2">
          {shown.length === 0 ? (
            <span className="px-1 py-1 text-[12.5px] text-text-tertiary">Aucune étiquette ne correspond.</span>
          ) : (
            shown.map((tag) => (
              <button
                key={tag}
                type="button"
                disabled={picked.length >= CUSTOM_LIMITS.tags}
                onClick={() => onChange([...picked, tag])}
                className="rounded-full bg-surface-sunken px-2.5 py-1 text-[12.5px] text-text-secondary transition-colors hover:bg-brand-50 hover:text-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {tag}
              </button>
            ))
          )}
        </div>
      </div>
    </Field>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Ajouter une association
// ---------------------------------------------------------------------------------------------------------------

type Medicine = { id: string; name: string; substances: string[]; marketed: boolean };
type KnownProduct = { ean: string; name: string; brand: string | null };

function NewAssociationForm({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"MEDICINE" | "PRODUCT">("MEDICINE");
  const [medicine, setMedicine] = useState<Medicine | null>(null);
  const [product, setProduct] = useState<KnownProduct | null>(null);
  const [advice, setAdvice] = useState<KnownProduct | null>(null);
  const [sentence, setSentence] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const submit = () => {
    setError(null);
    const trigger = mode === "MEDICINE" ? (medicine ? ({ kind: "MEDICINE", name: medicine.name } as const) : null) : product ? ({ kind: "PRODUCT", ean: product.ean, name: product.name } as const) : null;
    if (!trigger || !advice) {
      setError("Choisissez ce qui déclenche l'association et le produit à conseiller.");
      return;
    }
    startTransition(async () => {
      const result = await addCentralAssociationAction({ trigger, advice: { ean: advice.ean, name: advice.name }, sentence: sentence.trim() || null });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Association ajoutée" });
      onDone();
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 md:grid-cols-[1fr_auto_1fr]">
        <div className="space-y-3">
          <div role="tablist" aria-label="Ce qui déclenche l'association" className="inline-flex rounded-lg bg-surface-sunken p-1 text-[13px] font-medium">
            {([["MEDICINE", "Un médicament"], ["PRODUCT", "Un produit"]] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={mode === key}
                onClick={() => setMode(key)}
                className={mode === key ? "rounded-md bg-surface-card px-3 py-1.5 text-text-primary shadow-sm" : "rounded-md px-3 py-1.5 text-text-secondary hover:text-text-primary"}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "MEDICINE" ? (
            <SearchField<Medicine>
              label="Quand ce médicament est dans la vente"
              endpoint="/api/admin/conseils/medicaments"
              minLength={3}
              placeholder="Nom du médicament (3 lettres au moins)…"
              value={medicine}
              onChange={setMedicine}
              keyOf={(item) => item.id}
              title={(item) => item.name.split(",")[0].trim()}
              subtitle={(item) => item.substances.join(", ") || "—"}
              flag={(item) => (item.marketed ? null : "Non commercialisé")}
            />
          ) : (
            <SearchField<KnownProduct>
              label="Quand ce produit est dans la vente"
              endpoint="/api/admin/conseils/produits"
              minLength={2}
              placeholder="Nom, marque ou code-barres…"
              value={product}
              onChange={setProduct}
              keyOf={(item) => item.ean}
              title={(item) => item.name}
              subtitle={(item) => [item.brand, item.ean].filter(Boolean).join(" · ")}
            />
          )}
        </div>
        <ArrowRight className="mt-16 hidden size-5 shrink-0 text-text-tertiary md:block" aria-hidden />
        <div className="md:pt-[3.1rem]">
          <SearchField<KnownProduct>
            label="PharmaBoost propose ce produit"
            endpoint="/api/admin/conseils/produits"
            minLength={2}
            placeholder="Nom, marque ou code-barres…"
            value={advice}
            onChange={setAdvice}
            keyOf={(item) => item.ean}
            title={(item) => item.name}
            subtitle={(item) => [item.brand, item.ean].filter(Boolean).join(" · ")}
          />
        </div>
      </div>
      <Field label="Ce que dit le pharmacien (facultatif)" htmlFor="central-sentence" hint="Vos mots, tels quels, sur la carte du comptoir. Sans phrase, la carte n'affiche que l'association.">
        <Textarea id="central-sentence" value={sentence} maxLength={280} onChange={(event) => setSentence(event.target.value)} />
      </Field>
      <Alert tone="info" title="Comment ça atteint les pharmacies">
        Le produit conseillé est retrouvé par son code-barres dans le stock de chaque pharmacie : celles qui ne l&apos;ont pas ne le proposent pas. Il n&apos;est jamais proposé en rupture, ni écarté par la sécurité du patient.
      </Alert>
      {error && (
        <p role="alert" className="text-[13px] text-danger-600">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Annuler
        </Button>
        <Button onClick={submit} loading={pending} leadingIcon={<Plus className="size-4" />}>
          Mettre en ligne
        </Button>
      </div>
    </div>
  );
}

export function SearchField<T>({
  label,
  endpoint,
  minLength,
  placeholder,
  value,
  onChange,
  keyOf,
  title,
  subtitle,
  flag,
}: {
  label: string;
  endpoint: string;
  minLength: number;
  placeholder: string;
  value: T | null;
  onChange: (next: T | null) => void;
  keyOf: (item: T) => string;
  title: (item: T) => string;
  subtitle: (item: T) => string;
  flag?: (item: T) => string | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (value || query.trim().length < minLength) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`${endpoint}?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        if (response.ok) setResults(((await response.json()) as { results: T[] }).results);
      } catch {
        // Requête annulée : on garde l'affichage précédent.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, value, endpoint, minLength]);

  if (value) {
    return (
      <Field label={label}>
        <div className="flex items-center gap-3 rounded-lg border border-brand-300 bg-brand-50/60 p-3 dark:border-brand-700 dark:bg-brand-950/30">
          <Check className="size-4 shrink-0 text-brand-700 dark:text-brand-300" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium text-text-primary">{title(value)}</span>
            <span className="block truncate text-[12px] text-text-tertiary">{subtitle(value)}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery("");
              setResults([]);
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

  return (
    <Field label={label}>
      <div className="space-y-2">
        <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} leadingIcon={loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} aria-label={label} />
        {query.trim().length >= minLength && (
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border-subtle bg-surface-card p-1.5">
            {results.length === 0 && !loading ? (
              <li className="px-2 py-3 text-center text-[12.5px] text-text-tertiary">Aucun résultat.</li>
            ) : (
              results.map((item) => {
                const note = flag?.(item) ?? null;
                return (
                  <li key={keyOf(item)}>
                    <button type="button" onClick={() => onChange(item)} className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-brand-50/70 dark:hover:bg-brand-950/40">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-text-primary">{title(item)}</span>
                        <span className="block truncate text-[12px] text-text-tertiary">{subtitle(item)}</span>
                      </span>
                      {note && <Badge tone="warning">{note}</Badge>}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>
    </Field>
  );
}
