import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { academyPickers, getAcademyModule } from "@/server/services/mobile/academy-admin";
import { AdminPageHeader, AdminSection, FactList } from "@/components/admin/page-header";
import { onlineState } from "@/core/academy/review";
import { formatDateLong } from "@/lib/format";
import { ModuleForm, ModuleItemsEditor } from "../../_components/module-editor";
import { ReviewPanel } from "../../_components/review-panel";
import { OnlineBadge, ReviewBadge } from "../../_components/status";

export const metadata: Metadata = { title: "Parcours de l'Académie" };

export default async function AcademyModulePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformSession();
  const { id } = await params;
  const [module, pickers] = await Promise.all([getAcademyModule(id), academyPickers()]);
  if (!module) notFound();
  const now = new Date();
  const online = onlineState({ ...module, validUntil: null }, now) === "ONLINE";

  return (
    <div className="space-y-5">
      <AdminPageHeader
        space={{ label: "Gestion", href: "/admin/conseils" }}
        parent={{ label: "Académie", href: "/admin/academie?onglet=parcours" }}
        title={module.title}
        badge={
          <span className="flex gap-1">
            <ReviewBadge status={module.reviewStatus} />
            <OnlineBadge item={module} now={now} />
          </span>
        }
        actions={
          online ? (
            <Link href={`/m/formations/parcours/${module.slug}`} target="_blank" className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border-default px-4 text-sm font-medium text-text-primary hover:bg-surface-sunken">
              Voir dans l&apos;application
              <ExternalLink className="size-4" aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <AdminSection title="Étapes" description="Dans l'ordre où elles seront suivies. Seules les étapes approuvées et en ligne apparaissent dans l'application.">
            <ModuleItemsEditor moduleId={module.id} initial={module.items.map((item) => ({ contentId: item.content.id, isRequired: item.isRequired }))} options={pickers.contents} />
          </AdminSection>
          <AdminSection title="Parcours">
            <ModuleForm
              partners={pickers.partners}
              initial={{ id: module.id, title: module.title, slug: module.slug, summary: module.summary ?? "", audience: module.audience, isFreeAccess: module.isFreeAccess, isSponsored: module.isSponsored, partnerId: module.partnerId ?? "", sortOrder: module.sortOrder }}
            />
          </AdminSection>
        </div>
        <AdminSection title="Relecture et publication">
          <div className="space-y-4">
            <FactList
              className="sm:grid-cols-1"
              items={[
                { label: "Relecteur", value: module.reviewedBy, hint: module.reviewedAt ? `le ${formatDateLong(module.reviewedAt)}` : undefined },
                { label: "Mise en ligne", value: module.publishedAt ? formatDateLong(module.publishedAt) : null },
              ]}
            />
            <ReviewPanel target="module" id={module.id} status={module.reviewStatus} published={!!module.publishedAt} />
          </div>
        </AdminSection>
      </div>
    </div>
  );
}
