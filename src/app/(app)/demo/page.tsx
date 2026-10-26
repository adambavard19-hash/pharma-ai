import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { isCommercialDemoPharmacy } from "@/core/demo/identity";
import { CounterDemoCard } from "./counter-demo-card";

export const metadata: Metadata = { title: "Simuler une délivrance" };

/**
 * La page du présentateur : seulement la démo au comptoir (fondateur, 26 oct. 2026 : le reste ne sert pas en rendez-vous).
 * Elle n'existe que dans l'officine de démonstration : ailleurs, elle n'existe pas.
 */
export default async function DemoPage() {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_CREATE);
  if (!isCommercialDemoPharmacy(session.pharmacy)) notFound();
  return (
    <div className="mx-auto max-w-5xl">
      <CounterDemoCard />
    </div>
  );
}
