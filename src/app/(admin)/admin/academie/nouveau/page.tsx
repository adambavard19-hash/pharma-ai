import type { Metadata } from "next";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { academyPickers } from "@/server/services/mobile/academy-admin";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { ContentForm, EMPTY_CONTENT } from "../_components/content-form";

export const metadata: Metadata = { title: "Nouveau contenu" };

/** Un nouveau contenu naît brouillon : vidéo, quiz et relecture se font ensuite, sur sa page. */
export default async function NewAcademyContentPage() {
  await requirePlatformSession();
  const { partners } = await academyPickers();
  return (
    <div className="space-y-5">
      <AdminPageHeader space={{ label: "Gestion", href: "/admin/conseils" }} parent={{ label: "Académie", href: "/admin/academie" }} title="Nouveau contenu" description="Il naît brouillon. Après l'avoir créé : la vidéo, le quiz, puis l'envoi en relecture." />
      <AdminSection>
        <ContentForm initial={{ ...EMPTY_CONTENT, authorName: "", sourceLabel: "" }} partners={partners} reviewed={false} />
      </AdminSection>
    </div>
  );
}
