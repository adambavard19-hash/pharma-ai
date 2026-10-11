import type { Metadata } from "next";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { academyPickers } from "@/server/services/mobile/academy-admin";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { ModuleForm } from "../../_components/module-editor";

export const metadata: Metadata = { title: "Nouveau parcours" };

export default async function NewAcademyModulePage() {
  await requirePlatformSession();
  const { partners } = await academyPickers();
  return (
    <div className="space-y-5">
      <AdminPageHeader space={{ label: "Gestion", href: "/admin/conseils" }} parent={{ label: "Académie", href: "/admin/academie?onglet=parcours" }} title="Nouveau parcours" description="Un parcours enchaîne des contenus dans l'ordre. Après l'avoir créé : ses étapes, puis la relecture." />
      <AdminSection>
        <ModuleForm initial={{ id: null, title: "", slug: "", summary: "", audience: "ALL", isFreeAccess: false, isSponsored: false, partnerId: "", sortOrder: 0 }} partners={partners} />
      </AdminSection>
    </div>
  );
}
