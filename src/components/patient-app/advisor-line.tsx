import { Star, UserRound } from "lucide-react";
import type { BilanContent } from "@/core/documents/bilan";

/** « Votre conseiller : Claire, pharmacien titulaire » et le lien pour lui laisser un avis (fondateur, 19 nov. 2026). */
export function AdvisorLine({ advisor, withReview = true }: { advisor: BilanContent["advisor"]; withReview?: boolean }) {
  if (!advisor) return null;
  return (
    <div data-bilan-conseiller="" className="mt-3 flex items-center gap-3 rounded-[18px] bg-[#E8F3EF] px-4 py-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-[#0E8A7B]">
        <UserRound className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] text-[#4B6A62]">Votre conseiller</span>
        <span className="block text-[15px] font-bold text-[#0F2B26]">{advisor.firstName} · {advisor.roleLabel}</span>
      </span>
      {withReview && (
        <a href={`/app/avis?conseiller=${encodeURIComponent(advisor.userId)}`} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-bold text-[#0E8A7B]">
          <Star className="size-3.5" aria-hidden="true" /> Mon avis
        </a>
      )}
    </div>
  );
}
