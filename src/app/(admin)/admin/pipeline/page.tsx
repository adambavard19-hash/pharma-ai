import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing, List } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { BOARD_CLOSED_DAYS, followUpCounts, listRepOptions, loadBoardCards } from "@/server/services/admin/commercial";
import { defaultDemoInput, isOverdue, parseStatusParam } from "@/core/sales/board";
import { isOpenStatus } from "@/core/sales/pipeline";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { NewProspect } from "./new-prospect";
import { PipelineBoard } from "./board";
import { CommercialFilterForm, param } from "./filter-form";

export const metadata: Metadata = { title: "Pipeline commercial" };

/**
 * Le pipeline en colonnes, tous commerciaux. Filtres par l'adresse :
 * `?commercial=` (identifiant, ou `console`), `?ville=`, `?q=`.
 * `?nouveau=prospect` ouvre la création d'un dossier. Les anciens filtres
 * par étape renvoient vers la liste des prospects. Le tableau ne porte pas
 * les dossiers clos (activés, perdus) sans mouvement depuis 90 jours : un
 * lien mène à la liste, qui les a tous.
 */
export default async function AdminPipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const params = await searchParams;
  // L'ancienne liste du pipeline filtrait par étape (`?statut=`, `?activation=1`) : ces liens mènent désormais à la liste des prospects.
  const legacyStatus = parseStatusParam(param(params.statut)) ?? (param(params.activation) === "1" ? "ACTIVATED" : null);
  if (legacyStatus) {
    const target = new URLSearchParams({ statut: legacyStatus });
    for (const key of ["commercial", "q"] as const) {
      const value = param(params[key]);
      if (value) target.set(key, value);
    }
    redirect(`/admin/prospects?${target.toString()}`);
  }
  const filter = { commercial: param(params.commercial), q: param(params.q), ville: param(params.ville) };
  const now = new Date();
  const [{ cards, hiddenClosed, truncated }, reps, followUps] = await Promise.all([loadBoardCards(filter, now), listRepOptions(), followUpCounts({ commercial: filter.commercial }, now)]);
  const late = followUps.retard;
  const open = cards.filter((card) => isOpenStatus(card.status)).length;
  const overdueCards = cards.filter((card) => isOpenStatus(card.status) && isOverdue(card.nextActionAt, now)).length;
  const filtered = Boolean(filter.commercial || filter.q || filter.ville);
  /** La liste des prospects, aux filtres du tableau qu'elle connaît (commercial, recherche), éventuellement à une étape. */
  const listHref = (statut?: string) => {
    const target = new URLSearchParams();
    if (statut) target.set("statut", statut);
    if (filter.commercial) target.set("commercial", filter.commercial);
    if (filter.q) target.set("q", filter.q);
    const query = target.toString();
    return `/admin/prospects${query ? `?${query}` : ""}`;
  };

  return (
    <>
      <AdminPageHeader
        space={{ label: "Commercial", href: "/admin/pipeline" }}
        title="Pipeline"
        description={`${open} dossier${open > 1 ? "s" : ""} en cours${filtered ? " pour ce filtre" : ""} · ${cards.length} sur le tableau. Glissez une carte d'une étape à l'autre, ou utilisez « Déplacer vers… ».`}
        actions={
          <>
            <Button asChild variant="outline" leadingIcon={<List className="size-4" />}>
              <Link href={listHref()}>Vue liste</Link>
            </Button>
            {/* La clé suit `?nouveau=` : la fenêtre s'ouvre aussi quand on est déjà sur la page, et à chaque nouvel usage. */}
            <NewProspect key={param(params.nouveau) ?? "aucun"} reps={reps.filter((rep) => rep.isActive)} defaultOpen={param(params.nouveau) === "prospect"} />
          </>
        }
      />

      {late > 0 && (
        <Alert
          tone="warning"
          icon={<BellRing className="size-[18px]" aria-hidden="true" />}
          title={`${late} relance${late > 1 ? "s" : ""} en retard`}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/relances-commerciales?vue=retard${filter.commercial ? `&commercial=${encodeURIComponent(filter.commercial)}` : ""}`}>Voir les relances</Link>
            </Button>
          }
        >
          {overdueCards > 0 ? `${overdueCards} dossier${overdueCards > 1 ? "s ont" : " a"} une prochaine action dépassée : ${overdueCards > 1 ? "ils sont" : "il est"} en tête de colonne, en orange.` : "Des relances de l'agenda des commerciaux sont dépassées."}
        </Alert>
      )}

      <CommercialFilterForm action="/admin/pipeline" reps={reps} values={filter} fields={["q", "commercial", "ville"]} />

      {cards.length === 0 && !filtered && hiddenClosed === 0 && (
        <Alert tone="info" title="Aucun dossier pour l'instant">
          Les demandes du site public arrivent ici d&apos;elles-mêmes ; vous pouvez aussi créer un dossier avec « Nouveau dossier ».
        </Alert>
      )}

      {cards.length === 0 && filtered ? (
        <p className="rounded-2xl border border-dashed border-border-default bg-surface-card px-6 py-10 text-center text-[13.5px] text-text-secondary">
          Aucun dossier ne correspond à ce filtre. <Link href="/admin/pipeline" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">Effacer les filtres</Link>
        </p>
      ) : (
        <PipelineBoard cards={cards} nowIso={now.toISOString()} defaultDemoAt={defaultDemoInput(now)} />
      )}

      {(hiddenClosed > 0 || truncated) && (
        <p className="text-[12.5px] text-text-tertiary">
          {truncated ? `Le tableau montre les ${cards.length} dossiers les plus récemment modifiés. ` : ""}
          {hiddenClosed > 0 ? `${hiddenClosed} dossier${hiddenClosed > 1 ? "s" : ""} clos (activé${hiddenClosed > 1 ? "s" : ""} ou perdu${hiddenClosed > 1 ? "s" : ""}) sans mouvement depuis plus de ${BOARD_CLOSED_DAYS} jours ${hiddenClosed > 1 ? "ne sont" : "n'est"} pas sur le tableau. ` : ""}
          Voir tout dans la liste :{" "}
          {hiddenClosed > 0 ? (
            <>
              <Link href={listHref("ACTIVATED")} className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">activés</Link>
              {" · "}
              <Link href={listHref("LOST")} className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">perdus</Link>
              {" · "}
            </>
          ) : null}
          <Link href={listHref()} className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">tous les dossiers</Link>.
        </p>
      )}
    </>
  );
}
