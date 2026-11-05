"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ADVICE_MODULES, type AdviceModuleCode } from "@/core/ai/advice-modules";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { AssociationItem, NewAssociationForm, type AssociationCard, type FamilyChoice } from "../advice-control";

/**
 * Les associations d'un module (fondateur, 4 nov. 2026) : « un médicament déclencheur qui donne lieu à un conseil grâce à une
 * plante ». Elles ne passent au comptoir QUE dans les pharmacies qui ont choisi le module, et seulement une fois validées.
 */
export function ModuleAssociations({ associations, families }: { associations: AssociationCard[]; families: FamilyChoice[] }) {
  const [current, setCurrent] = useState<AdviceModuleCode>("PHYTOTHERAPIE");
  const [adding, setAdding] = useState(false);
  const meta = ADVICE_MODULES.find((item) => item.code === current)!;
  const shown = associations.filter((association) => association.module === current);
  return (
    <section className="mb-6 rounded-xl border border-border-subtle bg-surface-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-text-primary">Associations des modules</h2>
          <p className="mt-0.5 max-w-3xl text-[13px] leading-5 text-text-secondary">
            Un médicament déclencheur appelle un produit du module. Au comptoir, seules les pharmacies qui ont choisi le module la voient, si le produit est en stock et une fois l&apos;association validée.
          </p>
        </div>
        <Button onClick={() => setAdding(true)} leadingIcon={<Plus className="size-4" />}>
          Ajouter une association
        </Button>
      </div>
      <div role="tablist" aria-label="Module" className="mb-4 inline-flex rounded-lg bg-surface-sunken p-1 text-[13px] font-medium">
        {ADVICE_MODULES.map((item) => {
          const count = associations.filter((association) => association.module === item.code && association.status !== "REMOVED").length;
          return (
            <button
              key={item.code}
              type="button"
              role="tab"
              aria-selected={current === item.code}
              onClick={() => setCurrent(item.code)}
              className={current === item.code ? "rounded-md bg-surface-card px-3 py-1.5 text-text-primary shadow-sm" : "rounded-md px-3 py-1.5 text-text-secondary hover:text-text-primary"}
            >
              {item.label} <span className="tabular-nums text-text-tertiary">{count}</span>
            </button>
          );
        })}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-lg bg-surface-sunken px-4 py-6 text-center text-[13px] text-text-secondary">Aucune association en {meta.label.toLowerCase()} pour l&apos;instant.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((association) => (
            <AssociationItem key={association.id} association={association} />
          ))}
        </ul>
      )}
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title={`Ajouter une association · ${meta.label}`}
        description={`Quand ce médicament est dans la vente, PharmaBoost propose ce produit, seulement dans les pharmacies qui ont choisi le module ${meta.label}.`}
        size="lg"
      >
        {adding && <NewAssociationForm module={current} families={families} onDone={() => setAdding(false)} />}
      </Modal>
    </section>
  );
}
