import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, ListChecks, Package } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { getTraining, type TrainingDetail } from "@/server/services/training";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { universeLabel } from "@/config/universes";
import { brandDisplay, defaultSourceLabel, isSafeHttpUrl } from "@/core/training/content";
import { displayHost, videoEmbed, VIDEO_PLATFORM_LABELS } from "@/core/training/video";
import { DurationBadge, KindBadge } from "../_components/badges";
import { OpenContentButton, ProgressPanel } from "../_components/progress-panel";

export const metadata: Metadata = { title: "Formation" };

/**
 * Lire une formation et noter où l'on en est.
 *
 * Une vidéo d'une plateforme connue se lit dans la page ; tout autre contenu
 * externe s'ouvre chez sa source, dans un nouvel onglet — PharmaBoost
 * n'héberge ni ne recopie les contenus des laboratoires. La provenance est
 * toujours affichée.
 */
export default async function TrainingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission(PERMISSIONS.TRAINING_VIEW);
  const canManage = session.permissions.has(PERMISSIONS.TRAINING_MANAGE);
  const canViewProducts = session.permissions.has(PERMISSIONS.PRODUCT_VIEW);
  const training = await getTraining(session.scope, id, { includeInactiveOwn: canManage });
  if (!training) notFound();

  const facts = [
    training.laboratory,
    brandDisplay(training.brandKey),
    training.rangeName ? `Gamme ${training.rangeName}` : null,
    training.universe ? universeLabel(training.universe) : null,
  ].filter(Boolean);
  const source = training.sourceLabel ?? defaultSourceLabel(!training.isOwn);

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href={canManage && training.isOwn ? "/formation?onglet=contenus" : "/formation"}>Formation</Link>
      </Button>

      <header className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <KindBadge kind={training.kind} />
          <DurationBadge minutes={training.durationMinutes} />
        </div>
        <h1 className="text-2xl leading-8 font-semibold tracking-[-0.015em] break-words text-text-primary">{training.title}</h1>
        {facts.length > 0 && <p className="text-[13.5px] text-text-secondary">{facts.join(" · ")}</p>}
        <p className="text-[12.5px] text-text-tertiary">{source}</p>
      </header>

      {!training.isActive && (
        <Alert tone="warning" title="Contenu désactivé">
          Votre équipe ne le voit plus dans son catalogue. Réactivez-le depuis l&apos;onglet « Contenus de l&apos;officine ».
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {training.summary && <p className="text-[14.5px] leading-6 break-words text-text-primary">{training.summary}</p>}
          <Reader training={training} />
        </div>

        <aside className="min-w-0 space-y-4">
          {training.kind !== "QUIZ" && training.isActive && (
            <Card>
              <CardHeader title="Ma progression" />
              <CardContent>
                <ProgressPanel contentId={training.id} status={training.status} percent={training.percent} completedAt={training.completedAt?.toISOString() ?? null} />
              </CardContent>
            </Card>
          )}
          {training.products.length > 0 && (
            <Card>
              <CardHeader title="Dans votre officine" description="Les produits concernés par cette formation." />
              <CardContent>
                <ul className="space-y-1.5">
                  {training.products.map((product) => (
                    <li key={product.id}>
                      {canViewProducts ? (
                        <Link href={`/stock/${product.id}`} className="flex items-center gap-2 text-[13px] text-text-primary hover:text-brand-700">
                          <Package className="size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
                          <span className="min-w-0 truncate">{product.name}</span>
                        </Link>
                      ) : (
                        <span className="flex items-center gap-2 text-[13px] text-text-primary">
                          <Package className="size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
                          <span className="min-w-0 truncate">{product.name}</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function Reader({ training }: { training: TrainingDetail }) {
  // Validé à l'enregistrement ; relu ici par prudence : on ne rend jamais un lien autre que http(s).
  const url = isSafeHttpUrl(training.url) ? training.url!.trim() : null;
  if (training.kind === "QUIZ") {
    return (
      <Alert tone="neutral" icon={<ListChecks className="size-[18px]" aria-hidden="true" />} title="Les quiz arrivent bientôt">
        Ce format n&apos;est pas encore disponible dans PharmaBoost. Le contenu sera proposé dès qu&apos;il le sera.
      </Alert>
    );
  }

  if (training.kind === "SHEET") {
    return (
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="text-[14.5px] leading-7 break-words whitespace-pre-line text-text-primary">{training.body}</div>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] text-brand-700 hover:underline">
              Source : {displayHost(url)}
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          )}
        </CardContent>
      </Card>
    );
  }

  const embed = training.kind === "VIDEO" ? videoEmbed(url) : null;
  if (embed && url) {
    return (
      <div className="space-y-2">
        <div className="aspect-video w-full overflow-hidden rounded-xl border border-border-subtle bg-ink-950">
          <iframe
            src={embed.embedUrl}
            title={training.title}
            className="size-full"
            loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12.5px] text-text-tertiary hover:text-brand-700">
          Ouvrir sur {VIDEO_PLATFORM_LABELS[embed.platform]}
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </div>
    );
  }

  if (!url) {
    return <Alert tone="warning">Le lien de ce contenu n&apos;est pas renseigné.</Alert>;
  }

  const host = displayHost(url);
  const label = training.kind === "VIDEO" ? "Regarder la vidéo" : training.kind === "DOCUMENT" ? "Ouvrir le document" : "Ouvrir le lien officiel";
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <p className="text-[13.5px] text-text-secondary">
          Ce contenu s&apos;ouvre {host ? <>sur <span className="font-medium text-text-primary">{host}</span></> : "chez sa source"}, dans un nouvel onglet. Revenez ici pour le marquer comme terminé.
        </p>
        <OpenContentButton contentId={training.id} url={url} label={label} status={training.status} track={training.isActive} />
      </CardContent>
    </Card>
  );
}
