import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { academyPickers, getAcademyContent } from "@/server/services/mobile/academy-admin";
import { academyVideoMaxBytes } from "@/server/services/mobile/academy-media";
import { AdminPageHeader, AdminSection, FactList } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { mediaPath } from "@/core/academy/media";
import { isMedicineTopic } from "@/core/academy/topics";
import { onlineState } from "@/core/academy/review";
import { formatDateLong } from "@/lib/format";
import { ContentForm } from "../_components/content-form";
import { MediaUploader } from "../_components/media-uploader";
import { QuizEditor } from "../_components/quiz-editor";
import { ReviewPanel } from "../_components/review-panel";
import { OnlineBadge, ReviewBadge } from "../_components/status";

export const metadata: Metadata = { title: "Contenu de l'Académie" };

function day(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export default async function AcademyContentPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformSession();
  const { id } = await params;
  const [content, pickers] = await Promise.all([getAcademyContent(id), academyPickers()]);
  if (!content) notFound();
  const now = new Date();
  const state = onlineState(content, now);
  const reviewed = content.reviewStatus === "APPROVED" || content.reviewStatus === "IN_REVIEW";
  const videoUrl = content.videoAssetKey ? mediaPath(content.id, "video", content.videoAssetKey.split("/").pop()) : null;
  const { stats } = content;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        space={{ label: "Gestion", href: "/admin/conseils" }}
        parent={{ label: "Académie", href: "/admin/academie" }}
        title={content.title}
        badge={
          <span className="flex gap-1">
            <ReviewBadge status={content.reviewStatus} />
            <OnlineBadge item={content} now={now} />
          </span>
        }
        actions={
          state === "ONLINE" ? (
            <Link href={`/m/formations/${content.id}`} target="_blank" className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border-default px-4 text-sm font-medium text-text-primary hover:bg-surface-sunken">
              Voir dans l&apos;application
              <ExternalLink className="size-4" aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <AdminSection title="Contenu" description="Titre, format, auteur, partenaire, accès.">
            <ContentForm
              reviewed={reviewed}
              partners={pickers.partners}
              initial={{
                id: content.id,
                title: content.title,
                summary: content.summary ?? "",
                kind: content.kind,
                url: content.url ?? "",
                body: content.body ?? "",
                academyTopic: content.academyTopic ?? "",
                orientation: content.orientation ?? (content.kind === "MICRO_VIDEO" ? "VERTICAL" : "HORIZONTAL"),
                durationSeconds: content.durationSeconds ? String(content.durationSeconds) : "",
                authorName: content.authorName ?? "",
                authorRole: content.authorRole ?? "",
                partnerId: content.partnerId ?? "",
                isSponsored: content.isSponsored,
                isFreeAccess: content.isFreeAccess,
                quizPassPercent: String(content.quizPassPercent),
                sourceLabel: content.sourceLabel ?? "",
                laboratory: content.laboratory ?? "",
              }}
            />
          </AdminSection>
          {content.kind !== "SHEET" && (
            <AdminSection title="Vidéo et image d'attente" description="Hébergées par PharmaBoost, servies seulement aux personnes qui ont le droit de voir le contenu.">
              <MediaUploader contentId={content.id} videoUrl={videoUrl} posterUrl={content.posterUrl} vertical={content.orientation === "VERTICAL"} maxVideoMb={Math.round(academyVideoMaxBytes() / 1024 / 1024)} />
            </AdminSection>
          )}
          <AdminSection title="Quiz" description={`Après la vidéo. Réussi à partir de ${content.quizPassPercent} %. Modifier le quiz renvoie le contenu en relecture.`}>
            <QuizEditor
              contentId={content.id}
              initial={content.quizQuestions.map((question) => ({ prompt: question.prompt, choices: question.choices, correctIndexes: question.correctIndexes, explanation: question.explanation ?? "", sourceLabel: question.sourceLabel ?? "" }))}
            />
          </AdminSection>
        </div>

        <div className="space-y-5">
          <AdminSection title="Relecture et publication">
            <div className="space-y-4">
              <FactList
                className="sm:grid-cols-1"
                items={[
                  { label: "Relecteur", value: content.reviewedBy ? <>{content.reviewedBy} {content.reviewerIsPharmacist && <Badge tone="brand">Pharmacien</Badge>}</> : null, hint: content.reviewedAt ? `le ${formatDateLong(content.reviewedAt)}` : undefined },
                  { label: "Mise en ligne", value: content.publishedAt ? formatDateLong(content.publishedAt) : null },
                  { label: "Valable jusqu'au", value: content.validUntil ? formatDateLong(content.validUntil) : "Sans limite" },
                ]}
              />
              <ReviewPanel target="content" id={content.id} status={content.reviewStatus} medicine={isMedicineTopic(content.academyTopic)} published={!!content.publishedAt} validUntil={day(content.validUntil)} reviewNote={content.reviewNote} />
            </div>
          </AdminSection>
          <AdminSection title="Chiffres" description="Agrégats seulement, sans aucun nom.">
            <dl className="grid grid-cols-2 gap-3">
              {[
                { label: "Vues", value: stats.learners },
                { label: "Terminés", value: stats.completed },
                { label: "Comptes gratuits", value: stats.freeLearners },
                { label: "Équipes clientes", value: stats.staffLearners },
                { label: "Tentatives de quiz", value: stats.attempts },
                { label: "Réussite", value: stats.passRate === null ? "—" : `${stats.passRate} %` },
              ].map((item) => (
                <div key={item.label} className="rounded-xl bg-surface-sunken/60 px-3 py-2.5">
                  <dt className="text-[12px] text-text-tertiary">{item.label}</dt>
                  <dd className="text-[20px] font-semibold text-text-primary tabular">{item.value}</dd>
                </div>
              ))}
            </dl>
          </AdminSection>
          {content.moduleItems.length > 0 && (
            <AdminSection title="Dans les parcours">
              <ul className="space-y-1.5 text-[14px]">
                {content.moduleItems.map((item) => (
                  <li key={item.module.id}>
                    <Link href={`/admin/academie/parcours/${item.module.id}`} className="text-brand-700 hover:underline">
                      {item.module.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </AdminSection>
          )}
        </div>
      </div>
    </div>
  );
}
