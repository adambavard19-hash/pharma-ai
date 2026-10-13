"use client";

import { useState, useTransition } from "react";
import { History, Plus, RotateCcw, Save, X } from "lucide-react";
import { editCentralAssociationAction, editCentralRuleAction, revertCentralAssociationAction, revertCentralRuleAction } from "@/server/actions/admin-central-advice";
import { EDIT_LIMITS, type RuleEditValues } from "@/core/ai/central-advice-edit-constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { SearchField, TagPicker } from "./advice-control";

/**
 * Modifier un conseil, depuis la console : les mêmes champs pour une règle du code, un conseil ajouté ou une suggestion du
 * robot devenue conseil. La modification vaut pour toutes les pharmacies ; la version d'origine reste à un clic.
 */

export type HistoryLine = { id: string; action: "EDIT" | "REVERT"; changed: string[]; by: string | null; at: string };

const lines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);
const list = (value: string) => value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);

type Medicine = { id: string; name: string; substances: string[]; marketed: boolean; atcCode: string | null; family: string | null };

/** Ajouter un déclencheur en partant d'un médicament : on choisit le médicament lui-même ou sa famille. */
export function MedicineTriggerPicker({ onAdd }: { onAdd: (code: string) => void }) {
  const [medicine, setMedicine] = useState<Medicine | null>(null);
  return (
    <div className="space-y-2">
      <SearchField<Medicine>
        label="Ajouter un médicament qui déclenche ce conseil"
        endpoint="/api/admin/conseils/medicaments"
        minLength={3}
        placeholder="Doliprane, cétirizine, Maalox…"
        value={medicine}
        onChange={setMedicine}
        keyOf={(item) => item.id}
        title={(item) => item.name.split(",")[0].trim()}
        subtitle={(item) => [item.substances.join(", "), item.atcCode ? `famille ${item.atcCode}` : "famille inconnue"].filter(Boolean).join(" · ")}
        flag={(item) => (item.atcCode ? null : "Famille inconnue")}
      />
      {medicine?.atcCode && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-text-secondary">Déclencher pour :</span>
          {[
            { code: medicine.atcCode, label: `ce médicament (${medicine.atcCode})` },
            ...(medicine.atcCode.length > 5 ? [{ code: medicine.atcCode.slice(0, 5), label: `sa famille (${medicine.atcCode.slice(0, 5)})` }] : []),
            ...(medicine.atcCode.length > 4 ? [{ code: medicine.atcCode.slice(0, 4), label: `sa grande famille (${medicine.atcCode.slice(0, 4)})` }] : []),
          ].map((choice) => (
            <Button
              key={choice.code}
              size="sm"
              variant="outline"
              leadingIcon={<Plus className="size-3.5" />}
              onClick={() => {
                onAdd(choice.code);
                setMedicine(null);
              }}
            >
              {choice.label}
            </Button>
          ))}
          {medicine.family && <span className="text-text-tertiary">{medicine.family}</span>}
        </div>
      )}
    </div>
  );
}

export function RuleEditForm({
  ruleKey,
  initial,
  requiresProduct,
  hasRoutine,
  codeExclusions,
  categories,
  tags,
  onDone,
}: {
  ruleKey: string;
  initial: RuleEditValues;
  requiresProduct: boolean;
  hasRoutine: boolean;
  codeExclusions: string[];
  categories: { code: string; label: string }[];
  tags: string[];
  onDone: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [counterScript, setCounterScript] = useState(initial.counterScript);
  const [patientReason, setPatientReason] = useState(initial.patientReason);
  const [shortReason, setShortReason] = useState(initial.shortReason);
  const [question, setQuestion] = useState(initial.question ?? "");
  const [atc, setAtc] = useState(initial.atcPrefixes.join(", "));
  const [classes, setClasses] = useState(initial.therapeuticClasses.join(", "));
  const [category, setCategory] = useState(initial.category);
  const [picked, setPicked] = useState<string[]>(initial.matchingTags);
  const [prefer, setPrefer] = useState(initial.preferWords.join(", "));
  const [minAge, setMinAge] = useState(initial.exclusions.minAgeYears === null ? "" : String(initial.exclusions.minAgeYears));
  const [pregnancy, setPregnancy] = useState(initial.exclusions.pregnancy);
  const [breastfeeding, setBreastfeeding] = useState(initial.exclusions.breastfeeding);
  const [conditions, setConditions] = useState(initial.exclusions.conditions.join("\n"));
  const [priority, setPriority] = useState(String(initial.priority));
  const [notes, setNotes] = useState(initial.safetyNotes.join("\n"));
  const [source, setSource] = useState(initial.source ?? "");
  const [confirmNone, setConfirmNone] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await editCentralRuleAction({
        ruleKey,
        values: {
          title,
          counterScript,
          patientReason,
          shortReason,
          question,
          atcPrefixes: list(atc),
          therapeuticClasses: list(classes),
          category,
          matchingTags: picked,
          preferWords: list(prefer),
          exclusions: { minAgeYears: minAge.trim() === "" ? null : minAge.trim(), pregnancy, breastfeeding, conditions: lines(conditions) },
          priority: Number(priority),
          safetyNotes: lines(notes),
          source,
          confirmNoExclusions: confirmNone,
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data.needsConfirmation) {
        setNeedsConfirmation(true);
        setError(result.message ?? "Confirmez.");
        return;
      }
      push({ tone: "success", title: result.message ?? "Conseil modifié" });
      onDone();
    });
  };

  return (
    <div className="space-y-5">
      <Field label="Nom du conseil" htmlFor="edit-title" required>
        <Input id="edit-title" value={title} maxLength={EDIT_LIMITS.title} onChange={(event) => setTitle(event.target.value)} />
      </Field>

      <fieldset className="space-y-3 rounded-lg border border-border-subtle p-3.5">
        <legend className="px-1 text-[13px] font-semibold text-text-primary">Ce qui le déclenche</legend>
        <MedicineTriggerPicker onAdd={(code) => setAtc((current) => [...new Set([...list(current), code])].join(", "))} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Familles de médicaments (codes ATC)" htmlFor="edit-atc" hint="Séparées par des virgules. Le début du code suffit : R06A = tous les antihistaminiques.">
            <Input id="edit-atc" value={atc} onChange={(event) => setAtc(event.target.value)} />
          </Field>
          <Field label="…ou classes de médicaments" htmlFor="edit-classes" hint="Facultatif, séparées par des virgules.">
            <Input id="edit-classes" value={classes} onChange={(event) => setClasses(event.target.value)} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-border-subtle p-3.5">
        <legend className="px-1 text-[13px] font-semibold text-text-primary">Ce qu&apos;il faut proposer</legend>
        {hasRoutine ? (
          <p className="text-[13px] text-text-secondary">Ce conseil est une routine en plusieurs étapes : ses produits restent ceux écrits dans le moteur.</p>
        ) : (
          <>
            <p className="text-[12.5px] text-text-secondary">Décrivez le BESOIN, pas une marque : chaque pharmacie a un stock différent, PharmaBoost prend dans le sien le produit qui répond le mieux à ce besoin.</p>
            <Field label="Type de produit" htmlFor="edit-category" required>
              <Select id="edit-category" value={category} onChange={(event) => setCategory(event.target.value)}>
                {categories.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
            <TagPicker tags={tags} picked={picked} onChange={setPicked} max={EDIT_LIMITS.tags} label="Mots qui décrivent le besoin" />
          </>
        )}
        <Field label="Préférences (facultatif)" htmlFor="edit-prefer" hint="Une marque, « sans alcool »… Séparées par des virgules. Elles font passer une référence devant ses équivalentes quand la pharmacie l'a — jamais une obligation.">
          <Input id="edit-prefer" value={prefer} onChange={(event) => setPrefer(event.target.value)} />
        </Field>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-border-subtle p-3.5">
        <legend className="px-1 text-[13px] font-semibold text-text-primary">Ce qui se dit</legend>
        <Field label="Question à poser avant de proposer (facultatif)" htmlFor="edit-question" hint="Oui / non. Le produit n'est proposé qu'après la réponse. Vide : aucune question.">
          <Input id="edit-question" value={question} maxLength={EDIT_LIMITS.question} onChange={(event) => setQuestion(event.target.value)} />
        </Field>
        <Field label="Ce que dit le pharmacien" htmlFor="edit-script" required hint={requiresProduct ? "{product} sera remplacé par le produit choisi dans le stock (obligatoire) ; {drug} par le médicament." : "{drug} sera remplacé par le médicament."}>
          <Textarea id="edit-script" value={counterScript} maxLength={EDIT_LIMITS.script} onChange={(event) => setCounterScript(event.target.value)} />
        </Field>
        <Field label="Phrase pour le patient" htmlFor="edit-patient" required hint="Ce que lit le patient. Sans jargon, sans promesse.">
          <Textarea id="edit-patient" value={patientReason} maxLength={EDIT_LIMITS.script} onChange={(event) => setPatientReason(event.target.value)} className="min-h-16" />
        </Field>
        <Field label="Raison affichée au pharmacien, en une ligne" htmlFor="edit-reason" required hint="Le POURQUOI pour ce traitement. {drug} sera remplacé par le médicament.">
          <Input id="edit-reason" value={shortReason} maxLength={EDIT_LIMITS.reason} onChange={(event) => setShortReason(event.target.value)} />
        </Field>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-border-subtle p-3.5">
        <legend className="px-1 text-[13px] font-semibold text-text-primary">Personnes exclues</legend>
        {codeExclusions.length > 0 && (
          <div className="rounded-md bg-surface-sunken px-3 py-2 text-[12.5px] text-text-secondary">
            <p className="font-medium text-text-primary">Toujours appliqué (écrit dans le moteur, ne peut pas être retiré) :</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {codeExclusions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Âge minimum (ans)" htmlFor="edit-age" hint="Vide : aucun.">
            <Input id="edit-age" inputMode="numeric" value={minAge} onChange={(event) => setMinAge(event.target.value)} placeholder="12" />
          </Field>
          <div className="space-y-2 pt-6 sm:col-span-2">
            <Checkbox id="edit-pregnancy" checked={pregnancy} onChange={(event) => setPregnancy(event.target.checked)} label="Pas pendant la grossesse" />
            <Checkbox id="edit-breastfeeding" checked={breastfeeding} onChange={(event) => setBreastfeeding(event.target.checked)} label="Pas pendant l'allaitement" />
          </div>
        </div>
        <Field label="Autres (facultatif)" htmlFor="edit-conditions" hint="Une par ligne : asthme, épilepsie, allergie aux huiles essentielles… Le conseil est écarté si le patient le déclare.">
          <Textarea id="edit-conditions" value={conditions} onChange={(event) => setConditions(event.target.value)} className="min-h-16" />
        </Field>
        {needsConfirmation && <Checkbox id="edit-confirm-none" checked={confirmNone} onChange={(event) => setConfirmNone(event.target.checked)} label="Je confirme : plus aucune exclusion ajoutée" />}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <Field label="Priorité" htmlFor="edit-priority" hint="1 à 100.">
          <Input id="edit-priority" inputMode="numeric" value={priority} onChange={(event) => setPriority(event.target.value)} />
        </Field>
        <Field label="Précautions (facultatif)" htmlFor="edit-notes" hint="Une par ligne.">
          <Textarea id="edit-notes" value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-16" />
        </Field>
      </div>
      <Field label="Source" htmlFor="edit-source" hint="Recommandation, RCP, retour du comptoir…">
        <Textarea id="edit-source" value={source} maxLength={EDIT_LIMITS.source} onChange={(event) => setSource(event.target.value)} className="min-h-16" />
      </Field>

      <Alert tone="info" title="Les garde-fous restent les mêmes">
        Une modification choisit un besoin, jamais un produit qui passerait outre la sécurité : un médicament sur ordonnance, un produit contre-indiqué pour le patient ou en rupture n&apos;est jamais proposé. Les exclusions écrites dans le moteur restent appliquées.
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
        <Button onClick={submit} loading={pending} leadingIcon={<Save className="size-4" />}>
          Enregistrer pour toutes les pharmacies
        </Button>
      </div>
    </div>
  );
}

type KnownProduct = { ean: string; name: string; brand: string | null };

export function AssociationEditForm({ id, advice, sentence: initialSentence, onDone }: { id: string; advice: KnownProduct; sentence: string | null; onDone: () => void }) {
  const [product, setProduct] = useState<KnownProduct | null>(advice);
  const [sentence, setSentence] = useState(initialSentence ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();
  const submit = () => {
    setError(null);
    if (!product) {
      setError("Choisissez le produit à proposer.");
      return;
    }
    startTransition(async () => {
      const result = await editCentralAssociationAction({ id, advice: { ean: product.ean, name: product.name }, sentence: sentence.trim() || null });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Conseil modifié" });
      onDone();
    });
  };
  return (
    <div className="space-y-4">
      <SearchField<KnownProduct>
        label="PharmaBoost propose ce produit"
        endpoint="/api/admin/conseils/produits"
        minLength={2}
        placeholder="Nom, marque ou code-barres…"
        value={product}
        onChange={setProduct}
        keyOf={(item) => item.ean}
        title={(item) => item.name}
        subtitle={(item) => [item.brand, item.ean].filter(Boolean).join(" · ")}
      />
      <Field label="Ce que dit le pharmacien (facultatif)" htmlFor="association-edit-sentence" hint="Vos mots, tels quels, sur la carte du comptoir.">
        <Textarea id="association-edit-sentence" value={sentence} maxLength={280} onChange={(event) => setSentence(event.target.value)} />
      </Field>
      {error && (
        <p role="alert" className="text-[13px] text-danger-600">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Annuler
        </Button>
        <Button onClick={submit} loading={pending} leadingIcon={<Save className="size-4" />}>
          Enregistrer pour toutes les pharmacies
        </Button>
      </div>
    </div>
  );
}

/** « Revenir à la version d'origine », avec confirmation. */
export function RevertButton({ target }: { target: { kind: "RULE"; ruleKey: string } | { kind: "ASSOCIATION"; id: string } }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();
  const revert = () =>
    startTransition(async () => {
      const result = target.kind === "RULE" ? await revertCentralRuleAction({ ruleKey: target.ruleKey }) : await revertCentralAssociationAction({ id: target.id });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Version d'origine rétablie") : result.error });
      setConfirming(false);
    });
  if (confirming) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 rounded-lg bg-surface-sunken px-3 py-1.5" role="group" aria-label="Confirmer le retour à la version d'origine">
        <span className="text-[13px] text-text-primary">Annuler toutes les modifications ?</span>
        <Button size="sm" disabled={pending} onClick={revert} leadingIcon={<RotateCcw className="size-4" />}>
          Oui, revenir à l&apos;origine
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)} leadingIcon={<X className="size-4" />}>
          Non
        </Button>
      </span>
    );
  }
  return (
    <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} leadingIcon={<RotateCcw className="size-4" />}>
      Revenir à la version d&apos;origine
    </Button>
  );
}

/** Qui a modifié quoi, et quand. */
export function EditHistory({ history }: { history: HistoryLine[] }) {
  if (history.length === 0) return null;
  return (
    <details className="text-[12.5px] text-text-secondary">
      <summary className="flex cursor-pointer items-center gap-1 text-text-tertiary hover:text-text-secondary">
        <History className="size-3.5" aria-hidden /> Historique des modifications ({history.length})
      </summary>
      <ul className="mt-2 space-y-1 pl-5">
        {history.map((line) => (
          <li key={line.id} className="flex flex-wrap items-center gap-2">
            <Badge tone={line.action === "REVERT" ? "neutral" : "info"}>{line.action === "REVERT" ? "Retour à l'origine" : "Modifié"}</Badge>
            <span>
              {line.by ?? "Équipe PharmaBoost"} · {formatDate(line.at)}
              {line.action === "EDIT" && line.changed.length > 0 ? ` — ${line.changed.join(", ")}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
