import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hrefWith } from "@/components/admin/filters";

/** La pagination des listes d'argent : précédent, suivant, et où l'on en est. Rien si une seule page. */
export function Pager({ basePath, keep, page, pageCount, total, noun }: { basePath: string; keep: Record<string, string | null>; page: number; pageCount: number; total: number; noun: string }) {
  if (pageCount <= 1) return null;
  const href = (target: number) => hrefWith(basePath, keep, { page: target > 1 ? String(target) : null });
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
      <p className="text-[12.5px] text-text-tertiary">
        Page {page} sur {pageCount} · {total} {noun}
        {total > 1 ? "s" : ""}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm" leadingIcon={<ChevronLeft className="size-4" />}>
            <Link href={href(page - 1)}>Précédentes</Link>
          </Button>
        ) : null}
        {page < pageCount ? (
          <Button asChild variant="outline" size="sm" trailingIcon={<ChevronRight className="size-4" />}>
            <Link href={href(page + 1)}>Suivantes</Link>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
