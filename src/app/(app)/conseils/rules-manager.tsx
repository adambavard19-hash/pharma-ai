"use client";

import { useState, useTransition } from "react";
import { Ban, Plus, Star, Trash2 } from "lucide-react";
import {
  createPharmacyRuleAction,
  deletePharmacyRuleAction,
} from "@/server/actions/recommendations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { formatDate } from "@/lib/format";
import type { ProductCategoryCode } from "@/core/ai/types";

type RuleType = "PREFER_PRODUCT" | "EXCLUDE_PRODUCT" | "PREFER_CATEGORY" | "EXCLUDE_CATEGORY";

const RULE_LABELS: Record<RuleType, { label: string; description: string }> = {
  PREFER_PRODUCT: {
    label: "Privilégier cette référence",
    description: "Remonte la référence lorsqu'elle est pertinente et disponible.",
  },
  EXCLUDE_PRODUCT: {
    label: "Ne plus proposer cette référence",
    description: "La référence n'apparaîtra plus dans les conseils.",
  },
  PREFER_CATEGORY: {
    label: "Privilégier cette catégorie",
    description: "Oriente le conseil vers cette catégorie quand elle est pertinente.",
  },
  EXCLUDE_CATEGORY: {
    label: "Ne plus proposer cette catégorie",
    description: "Aucun conseil de cette catégorie ne sera proposé.",
  },
};

/**
 * Règles de conseil de l'officine.
 *
 * Ces préférences n'agissent que sur la dimension « préférence du pharmacien »
 * du score, appliquée APRÈS la sécurité et la pertinence : elles orientent le
 * conseil sans jamais pouvoir contourner un garde-fou.
 */
export function RulesManager({
  rules,
  products,
  canManage,
}: {
  rules: {
    id: string;
    type: string;
    productName: string | null;
    category: string | null;
    note: string | null;
    isActive: boolean;
    createdAt: string;
    createdBy: string | null;
  }[];
  products: { id: string; label: string }[];
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);

  const preferences = rules.filter((r) => r.type.startsWith("PREFER"));
  const exclusions = rules.filter((r) => r.type.startsWith("EXCLUDE"));

  return (
    <div className="space-y-5">
      <Alert tone="info" title="Ces règles ne contournent jamais la sécurité">
        Une préférence commerciale ne peut pas faire remonter une référence écartée pour raison
        de sécurité, de contre-indication ou de rupture de stock. Elle intervient uniquement pour
        départager des références déjà jugées appropriées.
      </Alert>

      {canManage && (
        <Button onClick={() => setOpen(true)} leadingIcon={<Plus className="size-[18px]" />}>
          Ajouter une règle
        </Button>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <RuleList
          title="Références privilégiées"
          icon={<Star className="size-4 text-brand-600 dark:text-brand-400" />}
          rules={preferences}
          canManage={canManage}
          emptyLabel="Aucune préférence enregistrée."
        />
        <RuleList
          title="Références écartées"
          icon={<Ban className="size-4 text-danger-600 dark:text-danger-500" />}
          rules={exclusions}
          canManage={canManage}
          emptyLabel="Aucune exclusion enregistrée."
        />
      </div>

      <CreateRuleModal
        open={open}
        onClose={() => setOpen(false)}
        products={products}
      />
    </div>
  );
}

function RuleList({
  title,
  icon,
  rules,
  canManage,
  emptyLabel,
}: {
  title: string;
  icon: React.ReactNode;
  rules: {
    id: string;
    type: string;
    productName: string | null;
    category: string | null;
    note: string | null;
    createdAt: string;
    createdBy: string | null;
  }[];
  canManage: boolean;
  emptyLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const remove = (id: string) => {
    startTransition(async () => {
      const result = await deletePharmacyRuleAction(id);
      push({
        tone: result.ok ? "success" : "error",
        title: result.ok ? (result.message ?? "Règle supprimée") : result.error,
      });
    });
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {icon}
            {title}
          </span>
        }
      />
      <CardContent className="pt-0">
        {rules.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-text-tertiary">{emptyLabel}</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {rules.map((rule) => (
              <li key={rule.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-[13.5px] font-medium text-text-primary">
                    {rule.productName ??
                      PRODUCT_CATEGORY_LABELS[rule.category as ProductCategoryCode] ??
                      "—"}
                  </p>
                  <Badge tone="neutral">
                    {RULE_LABELS[rule.type as RuleType]?.label ?? rule.type}
                  </Badge>
                  {rule.note && (
                    <p className="text-[12px] leading-4 text-text-secondary">{rule.note}</p>
                  )}
                  <p className="text-[11.5px] text-text-tertiary">
                    {formatDate(rule.createdAt)}
                    {rule.createdBy && ` · ${rule.createdBy}`}
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(rule.id)}
                    className="shrink-0 rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-danger-50 hover:text-danger-600 disabled:opacity-50 dark:hover:bg-danger-700/15"
                    aria-label="Supprimer la règle"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CreateRuleModal({
  open,
  onClose,
  products,
}: {
  open: boolean;
  onClose: () => void;
  products: { id: string; label: string }[];
}) {
  const [type, setType] = useState<RuleType>("PREFER_PRODUCT");
  const [productId, setProductId] = useState("");
  const [category, setCategory] = useState<ProductCategoryCode>("PROBIOTIQUES");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const targetsProduct = type === "PREFER_PRODUCT" || type === "EXCLUDE_PRODUCT";

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createPharmacyRuleAction({
        type,
        productId: targetsProduct ? productId : null,
        category: targetsProduct ? null : category,
        note,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Règle enregistrée" });
      setNote("");
      onClose();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nouvelle règle de conseil"
      description="Orientez les propositions du moteur selon les habitudes de votre officine."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} loading={pending}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <Field label="Type de règle" htmlFor="rule-type">
          <Select
            id="rule-type"
            value={type}
            onChange={(event) => setType(event.target.value as RuleType)}
          >
            {(Object.keys(RULE_LABELS) as RuleType[]).map((value) => (
              <option key={value} value={value}>
                {RULE_LABELS[value].label}
              </option>
            ))}
          </Select>
        </Field>

        <p className="text-[12.5px] leading-5 text-text-secondary">
          {RULE_LABELS[type].description}
        </p>

        {targetsProduct ? (
          <Field label="Référence" htmlFor="rule-product" required>
            <Select
              id="rule-product"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
            >
              <option value="">Sélectionner une référence…</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Catégorie" htmlFor="rule-category" required>
            <Select
              id="rule-category"
              value={category}
              onChange={(event) => setCategory(event.target.value as ProductCategoryCode)}
            >
              {PRODUCT_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {PRODUCT_CATEGORY_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field
          label="Motif"
          htmlFor="rule-note"
          hint="Utile à votre équipe pour comprendre la règle dans six mois."
        >
          <Input
            id="rule-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Référence de référence de l'officine, rupture fournisseur…"
          />
        </Field>
      </div>
    </Modal>
  );
}
