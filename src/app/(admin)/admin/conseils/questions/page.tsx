import type { Metadata } from "next";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listCentralRules } from "@/server/services/central-advice";
import { listAdminPitches } from "@/server/services/counter-pitches";
import { PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { AdminPageHeader } from "@/components/admin/page-header";
import { CounterPitches } from "../counter-pitches";

export const metadata: Metadata = { title: "Questions du comptoir" };

/**
 * Les questions du comptoir, sur leur propre page (fondateur, 21 oct. 2026 : « l'accès direct ») : ce que montre l'onglet
 * « 1. Questions » de la bannière sous chaque produit conseil, à corriger ici pour toutes les pharmacies. Le même éditeur que
 * dans « Conseils », sans avoir à descendre sous la liste des règles.
 */
export default async function CounterQuestionsPage() {
  await requirePlatformSession();
  const [rules, pitches] = await Promise.all([listCentralRules(PRODUCT_CATEGORY_LABELS), listAdminPitches()]);
  const ruleTitles = new Map(rules.map((rule) => [rule.ruleKey, rule.title]));
  return (
    <>
      <AdminPageHeader
        space={{ label: "Gestion", href: "/admin/conseils" }}
        title="Questions du comptoir"
        description="Les deux questions, les réponses du patient et le conseil à dire, que la bannière montre sous chaque produit conseil. Cliquez sur un produit pour le modifier : c'est aussitôt valable pour toutes les pharmacies."
      />
      <CounterPitches rows={pitches.map((pitch) => ({ ...pitch, ruleTitle: ruleTitles.get(pitch.ruleKey) ?? (pitch.ruleKey.startsWith("association:") ? "Association de produits" : "Suggestion du robot"), updatedAt: pitch.updatedAt.toISOString() }))} />
    </>
  );
}
