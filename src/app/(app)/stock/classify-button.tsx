"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { classifyProductsAction } from "@/server/actions/stock-import";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Relance la compréhension des produits que le moteur ne sait pas encore
 * relier à un besoin. Quelques lots par clic ; le message dit ce qu'il reste.
 */
export function ClassifyProductsButton({ pending: count, size = "sm" }: { pending: number; size?: "sm" | "md" }) {
  const [busy, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  return (
    <Button
      size={size}
      variant="outline"
      loading={busy}
      leadingIcon={<Sparkles className="size-4" />}
      onClick={() =>
        start(async () => {
          const result = await classifyProductsAction();
          push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Produits compris.") : result.error });
          if (result.ok) router.refresh();
        })
      }
    >
      Comprendre {count} produit{count > 1 ? "s" : ""} non classé{count > 1 ? "s" : ""}
    </Button>
  );
}
