"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers, Plus, Trash2, X } from "lucide-react";
import { addCentralRuleAction, decideCentralRuleAction } from "@/server/actions/admin-central-advice";
import type { RoutineView } from "@/server/services/central-advice";
import { PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import type { ProductCategoryCode } from "@/core/ai/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { ChosenList, SearchField, medicineTitle, splitAtcCodes } from "../advice-control";

type Medicine = { id: string; name: string; substances: string[]; marketed: boolean; atcCode: string | null; family: string | null };
type KnownProduct = { ean: string; name: string; brand: string | null; category: string; tags: string[] };
type Step = { label: string; product: KnownProduct | null; brand: string; tags: string[] };

const THEME_SUGGESTIONS = ["Acné", "Allergie", "Peau sèche", "Peau atopique", "Solaire", "Cheveux", "Bouche et dents", "Yeux", "Digestion", "Douleur", "Sommeil", "Immunité"];
const STEP_SUGGESTIONS = ["Nettoyer", "Hydrater", "Traiter les boutons", "Protéger", "Apaiser", "Yeux", "Nez", "Complément"];

/** La gamme d'un produit : sa marque, ou à défaut le premier mot de son nom (« CERAVE GEL MOUSSANT » → « CERAVE »). */
const brandOf = (product: KnownProduct) => product.brand?.trim() || product.name.split(/\s+/)[0] || "";

export function RoutinesBoard({ routines, types }: { routines: RoutineView[]; /** Les types de produit que les règles connaissent. */ types: string[] }) {
  const [view, setView] = useState<"theme" | "medicine">("theme");
  const [creating, setCreating] = useState(false);
  const groups = useMemo(() => {
    const map = new Map<string, RoutineView[]>();
    for (const routine of routines) {
      const keys = view === "theme" ? [routine.theme] : routine.medicines.length > 0 ? routine.medicines.map(medicineTitle) : routine.atcCodes.map((atc) => (atc.family ? `${atc.code} · ${atc.family}` : atc.code));
      for (const key of keys.length ? keys : ["Sans médicament"]) map.set(key, [...(map.get(key) ?? []), routine]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }, [routines, view]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Classer les routines" className="inline-flex rounded-lg bg-surface-sunken p-1 text-[13px] font-medium">
          {([["theme", "Par thème"], ["medicine", "Par médicament"]] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)} className={view === key ? "rounded-md bg-surface-card px-3 py-1.5 text-text-primary shadow-sm" : "rounded-md px-3 py-1.5 text-text-secondary hover:text-text-primary"}>
              {label}
            </button>
          ))}
        </div>
        <span className="text-[13px] text-text-tertiary">{routines.length} routine{routines.length > 1 ? "s" : ""}</span>
        <Button className="ml-auto" onClick={() => setCreating(true)} leadingIcon={<Plus className="size-4" />}>
          Nouvelle routine
        </Button>
      </div>

      {groups.length === 0 && <p className="text-sm text-text-secondary">Aucune routine pour l&apos;instant.</p>}
      {groups.map(([group, list]) => (
        <section key={group} className="space-y-2">
          <h2 className="text-[13px] font-bold tracking-[0.08em] text-text-secondary uppercase">{group}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.map((routine) => (
              <RoutineCard key={`${group}-${routine.ruleKey}`} routine={routine} />
            ))}
          </div>
        </section>
      ))}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nouvelle routine" description="Elle part au comptoir de toutes les pharmacies qui ont les produits en stock." size="lg">
        {creating && <NewRoutineForm types={types} themes={[...new Set([...routines.map((routine) => routine.theme).filter((theme) => theme !== "Routines PharmaBoost" && theme !== "Sans thème"), ...THEME_SUGGESTIONS])]} onDone={() => setCreating(false)} />}
      </Modal>
    </div>
  );
}

function RoutineCard({ routine }: { routine: RoutineView }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const remove = () =>
    start(async () => {
      const result = await decideCentralRuleAction({ ruleKey: routine.ruleKey, decision: "REMOVE" });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? `« ${routine.title} » retirée de toutes les pharmacies.` : result.error });
      if (result.ok) router.refresh();
    });
  const triggers = routine.medicines.length > 0 ? routine.medicines.map(medicineTitle) : routine.atcCodes.map((atc) => (atc.family ? `${atc.code} (${atc.family})` : atc.code));
  return (
    <Card>
      <CardContent className="space-y-2.5 py-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[#E4DDFF] text-[#3B2A86]">
            <Layers className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-text-primary">{routine.title}</p>
            <p className="line-clamp-2 text-[12px] text-text-tertiary">Pour {triggers.join(", ") || "—"}</p>
          </div>
          <Badge tone={routine.origin === "PharmaBoost" ? "neutral" : "success"}>{routine.origin === "PharmaBoost" ? "PharmaBoost" : "Vous"}</Badge>
        </div>
        <ol className="space-y-1">
          {routine.steps.map((step, index) => (
            <li key={`${step.label}-${index}`} className="flex items-baseline gap-2 text-[12.5px]">
              <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[#6B55D6] text-[10.5px] font-bold text-white">{index + 1}</span>
              <span className="font-semibold text-text-primary">{step.label}</span>
              <span className="min-w-0 truncate text-text-secondary">{step.brand ? `· ${step.brand}` : `· ${step.tags.slice(0, 2).join(", ")}`}</span>
            </li>
          ))}
        </ol>
        {routine.origin === "Console" && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" disabled={pending} onClick={remove} leadingIcon={<Trash2 className="size-3.5" />}>
              Retirer
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NewRoutineForm({ themes, types, onDone }: { themes: string[]; types: string[]; onDone: () => void }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [theme, setTheme] = useState("");
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [atcInput, setAtcInput] = useState("");
  const [atcCodes, setAtcCodes] = useState<string[]>([]);
  const [steps, setSteps] = useState<Step[]>(() => ["Nettoyer", "Hydrater", "Traiter les boutons"].map((label) => ({ label, product: null, brand: "", tags: [] })));
  const [reason, setReason] = useState("Pendant le traitement ({drug}), la peau a besoin d'une routine adaptée.");
  const [script, setScript] = useState("« Pendant votre traitement ({drug}), je vous conseille une routine complète : {product} pour cette étape. »");

  const addAtc = () => {
    const codes = splitAtcCodes(atcInput);
    if (codes.length === 0) return;
    setAtcCodes((list) => [...new Set([...list, ...codes])]);
    setAtcInput("");
  };
  const setStep = (index: number, patch: Partial<Step>) => setSteps((list) => list.map((step, at) => (at === index ? { ...step, ...patch } : step)));

  const submit = () => {
    setError(null);
    // Un médicament choisi déclenche par son code ATC officiel ; un code tapé sans « Ajouter » compte aussi.
    const atcPrefixes = [...new Set([...medicines.map((medicine) => medicine.atcCode).filter((code): code is string => Boolean(code)), ...atcCodes, ...splitAtcCodes(atcInput)])];
    const missingAtc = medicines.filter((medicine) => !medicine.atcCode).map((medicine) => medicineTitle(medicine.name));
    if (missingAtc.length > 0) {
      setError(`Famille officielle inconnue pour ${missingAtc.join(", ")} : ajoutez son code ATC à la main.`);
      return;
    }
    start(async () => {
      const result = await addCentralRuleAction({
        title,
        kind: "TOLERANCE",
        theme,
        medicines: medicines.map((medicine) => medicine.name),
        atcPrefixes,
        therapeuticClasses: [],
        shortReason: reason,
        counterScript: script,
        safetyNotes: [],
        routine: {
          steps: steps.map((step) => ({ label: step.label, category: step.product?.category ?? "", tags: step.tags, brand: step.brand.trim() || null, ean: step.product?.ean ?? null, productName: step.product?.name ?? null })),
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: `« ${title} » est en ligne dans toutes les pharmacies.` });
      router.refresh();
      onDone();
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Nom de la routine" htmlFor="routine-title">
          <Input id="routine-title" value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} placeholder="Routine acné sous isotrétinoïne" />
        </Field>
        <Field label="Thème" htmlFor="routine-theme" hint="Pour ranger vos routines.">
          <Input id="routine-theme" list="routine-themes" value={theme} maxLength={40} onChange={(event) => setTheme(event.target.value)} placeholder="Acné" />
          <datalist id="routine-themes">
            {themes.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <SearchField<Medicine>
            label="Quand un de ces médicaments est dans la vente"
            endpoint="/api/admin/conseils/medicaments"
            minLength={3}
            placeholder="Curacné, cétirizine… (3 lettres au moins)"
            value={null}
            onChange={(item) => item && setMedicines((list) => (list.some((known) => known.id === item.id) ? list : [...list, item]))}
            onPickAll={(items) => setMedicines((list) => [...list, ...items.filter((item) => !list.some((known) => known.id === item.id))])}
            keyOf={(item) => item.id}
            title={(item) => medicineTitle(item.name)}
            subtitle={(item) => [item.atcCode, item.substances.join(", ")].filter(Boolean).join(" · ") || "—"}
            flag={(item) => (item.marketed ? null : "Non commercialisé")}
          />
          <ChosenList
            items={medicines.map((item) => ({ key: item.id, title: medicineTitle(item.name), subtitle: item.atcCode ? `${item.atcCode}${item.family ? ` · ${item.family}` : ""}` : "Famille officielle inconnue" }))}
            onRemove={(key) => setMedicines((list) => list.filter((item) => item.id !== key))}
            label="Médicaments choisis"
          />
        </div>
        <div>
          <Field label="ou des codes ATC (toute une famille)" htmlFor="routine-atc" hint="« R06A » pour tous les antihistaminiques. Entrée pour ajouter.">
            <div className="flex gap-2">
              <Input id="routine-atc" value={atcInput} maxLength={80} onChange={(event) => setAtcInput(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addAtc(); } }} placeholder="D10BA01" />
              <Button variant="outline" onClick={addAtc} disabled={splitAtcCodes(atcInput).length === 0} leadingIcon={<Plus className="size-4" />}>
                Ajouter
              </Button>
            </div>
          </Field>
          <ChosenList items={atcCodes.map((code) => ({ key: code, title: code, subtitle: null }))} onRemove={(key) => setAtcCodes((list) => list.filter((code) => code !== key))} label="Codes ATC choisis" />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[13px] font-semibold text-text-primary">Les étapes</p>
        {steps.map((step, index) => (
          <div key={index} className="rounded-xl border border-border-subtle bg-surface-page p-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[#6B55D6] text-[12px] font-bold text-white">{index + 1}</span>
              <Input aria-label={`Nom de l'étape ${index + 1}`} list="routine-steps" value={step.label} maxLength={30} onChange={(event) => setStep(index, { label: event.target.value })} placeholder="Nettoyer" className="max-w-[220px]" />
              {steps.length > 2 && (
                <button type="button" onClick={() => setSteps((list) => list.filter((_, at) => at !== index))} className="ml-auto rounded-md p-1.5 text-text-tertiary hover:bg-surface-sunken hover:text-text-primary" aria-label={`Retirer l'étape ${index + 1}`}>
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-[1fr_200px]">
              <SearchField<KnownProduct>
                label="Produit de référence"
                endpoint="/api/admin/conseils/produits"
                minLength={2}
                placeholder="CeraVe gel moussant, Eucerin…"
                value={step.product}
                onChange={(item) => setStep(index, { product: item, brand: item ? brandOf(item) : "", tags: item ? item.tags : [] })}
                keyOf={(item) => item.ean}
                title={(item) => item.name}
                subtitle={(item) => [item.brand, PRODUCT_CATEGORY_LABELS[item.category as ProductCategoryCode] ?? item.category].filter(Boolean).join(" · ")}
              />
              <Field label="Gamme" htmlFor={`routine-brand-${index}`}>
                <Input id={`routine-brand-${index}`} value={step.brand} maxLength={60} onChange={(event) => setStep(index, { brand: event.target.value })} placeholder="CeraVe" />
              </Field>
            </div>
            {step.product && (
              // Le type de produit (ce que PharmaBoost cherche dans chaque stock) : celui du produit choisi, modifiable ; un
              // produit pas encore rangé n'en a pas, on le choisit dans la liste.
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="text-text-tertiary">Type de produit :</span>
                {step.tags.map((tag) => (
                  <button key={tag} type="button" onClick={() => setStep(index, { tags: step.tags.filter((known) => known !== tag) })} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700" aria-label={`Retirer le type ${tag}`}>
                    {tag} <X className="size-3" aria-hidden="true" />
                  </button>
                ))}
                <select
                  aria-label={`Ajouter un type de produit à l'étape ${index + 1}`}
                  value=""
                  onChange={(event) => event.target.value && setStep(index, { tags: [...new Set([...step.tags, event.target.value])].slice(0, 6) })}
                  className="h-7 rounded-md border border-border-subtle bg-surface-card px-2 text-[12px]"
                >
                  <option value="">{step.tags.length === 0 ? "Choisir le type…" : "+ un type"}</option>
                  {types.filter((type) => !step.tags.includes(type)).map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ))}
        <datalist id="routine-steps">
          {STEP_SUGGESTIONS.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
        {steps.length < 5 && (
          <Button variant="outline" size="sm" onClick={() => setSteps((list) => [...list, { label: "", product: null, brand: "", tags: [] }])} leadingIcon={<Plus className="size-3.5" />}>
            Ajouter une étape
          </Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Pourquoi (une ligne)" htmlFor="routine-reason" hint="{drug} = le médicament de la vente.">
          <Textarea id="routine-reason" value={reason} maxLength={160} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <Field label="Ce que dit le pharmacien" htmlFor="routine-script" hint="{product} = le produit de l'étape.">
          <Textarea id="routine-script" value={script} maxLength={420} onChange={(event) => setScript(event.target.value)} />
        </Field>
      </div>

      <Alert tone="info" title="Comment chaque pharmacie choisit ses produits">
        Pour chaque étape, PharmaBoost prend un produit du même type dans le stock de la pharmacie : d&apos;abord une gamme prioritaire du titulaire, puis le produit et la gamme choisis ici, puis la date courte, le challenge et la meilleure marge. Une étape sans produit en stock n&apos;apparaît pas.
      </Alert>
      {error && (
        <p role="alert" className="text-[13px] text-danger-600">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
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
