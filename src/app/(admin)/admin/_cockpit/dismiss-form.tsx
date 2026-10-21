"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { dismissFormSubmissionAction } from "@/server/actions/platform-sales";
import { useToast } from "@/components/ui/toast";

/** La petite croix d'une ligne de « Formulaires reçus » (fondateur, 21 oct. 2026) : retire la ligne de l'accueil, rien d'autre. */
export function DismissFormButton({ id, title }: { id: string; title: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  return (
    <button
      type="button"
      aria-label={`Retirer « ${title} » de l'accueil`}
      title="Retirer de l'accueil"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await dismissFormSubmissionAction(id);
          if (!result.ok) push({ tone: "error", title: result.error });
          router.refresh();
        })
      }
      className="grid size-8 shrink-0 place-items-center rounded-full text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-text-primary focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-40"
    >
      <X className="size-4" aria-hidden="true" />
    </button>
  );
}
