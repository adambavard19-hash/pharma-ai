import type { Metadata } from "next";
import { CalendarCheck, ExternalLink, Phone, Mail } from "lucide-react";
import { requireDirectorSession } from "@/server/auth/director-session";
import { listDirectorDemos, type DirectorDemoRow } from "@/server/services/sales/director-demos";
import { DIRECTOR_DEMO_BONUS_CENTS } from "@/core/affiliation/director-terms";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { DemoActions } from "./demo-actions";
import { openDemoSpaceAction } from "@/server/actions/director-demos";

export const metadata: Metadata = { title: "Démos" };

const euros = (cents: number) => `${(cents / 100).toLocaleString("fr-FR")} €`;

/**
 * Les démonstrations dans l'espace du directeur (fondateur, 5 nov. 2026) : chaque démo programmée y arrive (site ou
 * commercial). Après la démo : « Démo faite » (elle est à lui), puis « Envoyer le lien de bienvenue » — le titulaire crée
 * son accès, signe et paie depuis son espace ; le logiciel n'arrive qu'après le paiement. 100 € HT par démo qui va au bout.
 */
export default async function DirectorDemosPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const session = await requireDirectorSession();
  const missingDemo = (await searchParams).demo === "absente";
  const { upcoming, past } = await listDirectorDemos(session.director.id);
  const mineThrough = past.filter((row) => row.mine && row.wentThrough).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.025em] text-text-primary">Démos</h1>
          <p className="mt-1 max-w-2xl text-[15px] text-text-secondary">
            Chaque démonstration programmée arrive ici. Après la démo : « Démo faite », puis le lien de bienvenue. {euros(DIRECTOR_DEMO_BONUS_CENTS)} HT pour vous à chaque démo qui va au bout (mise en service réglée).
          </p>
        </div>
        <form action={openDemoSpaceAction}>
          <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-br from-brand-600 to-brand-800 px-5 text-[14px] font-semibold text-white shadow-sm">
            Ouvrir l&apos;espace de démonstration <ExternalLink className="size-4" aria-hidden="true" />
          </button>
        </form>
      </div>

      {missingDemo && <p className="rounded-xl bg-warning-50 px-4 py-3 text-[13.5px] text-warning-900">L&apos;officine de démonstration n&apos;existe pas encore sur ce serveur : demandez à PharmaBoost de la créer.</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Démos à venir" value={String(upcoming.length)} />
        <Stat label="Démos faites par vous (30 jours)" value={String(past.filter((row) => row.mine).length)} />
        <Stat label="Allées au bout" value={`${mineThrough} · ${euros(mineThrough * DIRECTOR_DEMO_BONUS_CENTS)}`} />
      </div>

      <Section title="À venir" rows={upcoming} empty="Aucune démonstration programmée." />
      <Section title="Les 30 derniers jours" rows={past} empty="Aucune démonstration ces 30 derniers jours." />
    </div>
  );
}

const glass = "rounded-2xl border border-white/70 bg-white/65 shadow-[0_12px_32px_-16px_rgba(15,43,38,.22)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${glass} p-4`}>
      <p className="text-[12.5px] text-text-secondary">{label}</p>
      <p className="mt-1 bg-gradient-to-br from-brand-700 to-[#0b5560] bg-clip-text text-[26px] font-bold text-transparent tabular">{value}</p>
    </div>
  );
}

function Section({ title, rows, empty }: { title: string; rows: DirectorDemoRow[]; empty: string }) {
  return (
    <section className={`${glass} p-5`}>
      <h2 className="flex items-center gap-2 text-[17px] font-semibold text-text-primary">
        <CalendarCheck className="size-4 text-brand-600" aria-hidden="true" /> {title}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-[14px] text-text-secondary">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border-subtle">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 flex-1 basis-64">
                <p className="text-[15px] font-semibold text-text-primary">
                  {row.name}
                  {row.city ? <span className="font-normal text-text-tertiary"> · {row.city}</span> : null}
                </p>
                <p className="text-[13px] text-text-secondary">
                  {formatDateTime(row.demoAt)}
                  {row.ownerName ? ` · ${row.ownerName}` : ""}
                  {row.repName ? ` · commercial : ${row.repName}` : " · réservée sur le site"}
                </p>
                <p className="mt-0.5 flex flex-wrap gap-3 text-[12.5px] text-text-tertiary">
                  {row.phone && (
                    <a href={`tel:${row.phone}`} className="inline-flex items-center gap-1 hover:text-brand-700">
                      <Phone className="size-3.5" aria-hidden="true" /> {row.phone}
                    </a>
                  )}
                  {row.email && (
                    <a href={`mailto:${row.email}`} className="inline-flex items-center gap-1 hover:text-brand-700">
                      <Mail className="size-3.5" aria-hidden="true" /> {row.email}
                    </a>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {row.wentThrough ? <Badge tone="success">Allée au bout</Badge> : row.spaceOpened ? <Badge tone="info">Espace ouvert</Badge> : row.demoDoneAt ? <Badge tone="neutral">Démo faite</Badge> : null}
                {row.mine && <Badge tone="brand">Votre démo</Badge>}
                <DemoActions prospectId={row.id} done={Boolean(row.demoDoneAt)} mine={row.mine} spaceOpened={row.spaceOpened} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
