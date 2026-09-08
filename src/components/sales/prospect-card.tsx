import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { ProspectStatusBadge } from "./status-badge";
import { formatDate } from "@/lib/format";

export type ProspectCardData = {
  id: string;
  name: string;
  city: string | null;
  ownerName: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  nextActionAt: Date | null;
  nextActionLabel: string | null;
  salesRepName?: string | null;
};

/**
 * Une carte de dossier : le nom, la ville, l'étape, la prochaine action, et
 * deux gestes d'un pouce — appeler, écrire. Le même composant sert au
 * pipeline du commercial et à celui de l'administrateur.
 */
export function ProspectCard({ prospect, href }: { prospect: ProspectCardData; href: string }) {
  const late = prospect.nextActionAt ? prospect.nextActionAt < new Date() : false;
  return (
    <article className="rounded-xl border border-border-subtle bg-surface-card p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Link href={href} className="min-w-0 flex-1">
          <p className="truncate text-[15px] leading-5 font-semibold text-text-primary">{prospect.name}</p>
          <p className="truncate text-[12.5px] text-text-secondary">{[prospect.ownerName, prospect.city].filter(Boolean).join(" · ") || "—"}</p>
        </Link>
        <ProspectStatusBadge status={prospect.status} />
      </div>
      {prospect.nextActionAt && (
        <p className={"mt-2 text-[12.5px] " + (late ? "font-medium text-warning-700 dark:text-warning-500" : "text-text-tertiary")}>
          {late ? "En retard · " : ""}{prospect.nextActionLabel ?? "Relance"} · {formatDate(prospect.nextActionAt)}
        </p>
      )}
      <div className="mt-2.5 flex items-center gap-2">
        {prospect.phone && (
          <a href={`tel:${prospect.phone.replace(/\s+/g, "")}`} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-default text-[13px] font-medium text-text-primary hover:bg-surface-sunken">
            <Phone className="size-4" /> Appeler
          </a>
        )}
        {prospect.email && (
          <a href={`mailto:${prospect.email}`} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-default text-[13px] font-medium text-text-primary hover:bg-surface-sunken">
            <Mail className="size-4" /> Écrire
          </a>
        )}
        <Link href={href} className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-600 px-3.5 text-[13px] font-medium text-white hover:bg-brand-700">
          Voir
        </Link>
      </div>
      {prospect.salesRepName && <p className="mt-2 text-[11.5px] text-text-tertiary">{prospect.salesRepName}</p>}
    </article>
  );
}
